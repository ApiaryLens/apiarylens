import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  session,
  type OnBeforeSendHeadersListenerDetails,
} from 'electron';
import { bootstrapRequestSchema } from '@apiarylens/contracts';
import {
  desktopBridgeVersion,
  type DesktopBootstrapSession,
  type DesktopRuntimeStatus,
} from './contracts.js';
import { createWindowsDataPaths } from './paths.js';
import { loadOrCreateStandaloneSecrets } from './protected-secrets.js';
import { desktopControlHeader } from './service-contract.js';
import { ServiceSupervisor } from './service-supervisor.js';
import { isTrustedRendererUrl, shouldInjectControlHeader } from './window-policy.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const preloadPath = join(currentDirectory, 'preload.cjs');
const serviceScript = join(currentDirectory, 'service.js');
const webRoot = resolve(currentDirectory, '..', '..', 'web', 'dist');
const trustedWebContents = new Set<number>();
let primaryWindow: BrowserWindow | undefined;
let supervisor: ServiceSupervisor | undefined;
let shutdownStarted = false;

const userDataArgument = process.argv.find((argument) =>
  argument.startsWith('--desktop-user-data='),
);
if (userDataArgument) {
  app.setPath('userData', resolve(userDataArgument.slice('--desktop-user-data='.length)));
}

if (!app.requestSingleInstanceLock()) app.quit();

function secureWindow(endpoint: string, showWhenReady = true): BrowserWindow {
  const desktopSession = session.fromPartition('persist:apiarylens-windows');
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 320,
    minHeight: 480,
    show: false,
    backgroundColor: '#fffaf0',
    webPreferences: {
      preload: preloadPath,
      partition: 'persist:apiarylens-windows',
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      devTools: false,
      spellcheck: true,
    },
  });
  trustedWebContents.add(window.webContents.id);
  window.on('closed', () => trustedWebContents.delete(window.webContents.id));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isTrustedRendererUrl(navigationUrl, endpoint)) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  if (showWhenReady) window.once('ready-to-show', () => window.show());
  desktopSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
  return window;
}

async function start(): Promise<void> {
  app.setName('ApiaryLens');
  app.setAccessibilitySupportEnabled(true);
  const paths = createWindowsDataPaths(app.getPath('userData'));
  const secrets = loadOrCreateStandaloneSecrets(paths.protectedSecrets, safeStorage);
  supervisor = new ServiceSupervisor({
    executable: process.execPath,
    serviceScript,
    webRoot,
    paths,
    secrets,
    onUnexpectedExit: () => {
      if (!shutdownStarted) app.exit(71);
    },
  });
  const running = await supervisor.start();
  const smokeArgument = process.argv.find((argument) => argument.startsWith('--desktop-smoke='));
  const desktopSession = session.fromPartition('persist:apiarylens-windows');
  desktopSession.webRequest.onBeforeSendHeaders(
    { urls: [`${running.endpoint}/*`] },
    (details, callback) => {
      const typedDetails = details as OnBeforeSendHeadersListenerDetails & {
        webContentsId?: number;
      };
      const requestHeaders = { ...details.requestHeaders };
      if (
        shouldInjectControlHeader(
          details.url,
          running.endpoint,
          typedDetails.webContentsId,
          trustedWebContents,
        )
      ) {
        requestHeaders[desktopControlHeader] = running.controlToken;
      }
      callback({ requestHeaders });
    },
  );

  const assertTrustedSender = (event: Electron.IpcMainInvokeEvent): void => {
    const senderFrame = event.senderFrame;
    if (!senderFrame) throw new Error('Desktop operation has no sender frame');
    const senderUrl = senderFrame.url;
    if (
      !trustedWebContents.has(event.sender.id) ||
      senderFrame !== event.sender.mainFrame ||
      !isTrustedRendererUrl(senderUrl, running.endpoint)
    ) {
      throw new Error('Untrusted renderer requested a desktop operation');
    }
  };
  ipcMain.handle('apiarylens:runtime-status', async (event): Promise<DesktopRuntimeStatus> => {
    assertTrustedSender(event);
    const response = await fetch(`${running.endpoint}/health`, {
      headers: { [desktopControlHeader]: running.controlToken, origin: running.endpoint },
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) throw new Error(`Standalone service health failed (${response.status})`);
    return {
      bridgeVersion: desktopBridgeVersion,
      mode: 'standalone',
      serviceProtocolVersion: running.readiness.serviceProtocolVersion,
      productVersion: app.getVersion(),
    };
  });
  ipcMain.handle(
    'apiarylens:bootstrap-owner',
    async (event, untrustedInput: unknown): Promise<DesktopBootstrapSession> => {
      assertTrustedSender(event);
      const input = bootstrapRequestSchema.omit({ bootstrapToken: true }).parse(untrustedInput);
      const response = await desktopSession.fetch(`${running.endpoint}/api/v1/bootstrap`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [desktopControlHeader]: running.controlToken,
          origin: running.endpoint,
        },
        body: JSON.stringify({ ...input, bootstrapToken: secrets.bootstrapToken }),
      });
      const body = (await response.json()) as DesktopBootstrapSession | { message?: string };
      if (!response.ok) {
        throw new Error('message' in body && body.message ? body.message : 'Owner setup failed');
      }
      return body as DesktopBootstrapSession;
    },
  );

  primaryWindow = secureWindow(running.endpoint, !smokeArgument);
  await primaryWindow.loadURL(running.endpoint);
  if (smokeArgument) {
    const evidencePath = resolve(smokeArgument.slice('--desktop-smoke='.length));
    const unauthorized = await fetch(`${running.endpoint}/health`);
    const renderer = (await primaryWindow.webContents.executeJavaScript(`(async () => ({
      nodeType: typeof process,
      requireType: typeof require,
      bridgeKeys: Object.keys(window.apiaryLensDesktop),
      status: await window.apiaryLensDesktop.runtimeStatus(),
      rootPresent: Boolean(document.querySelector('#root')),
      stringGlobals: Object.getOwnPropertyNames(window).filter((name) => {
        try { return typeof window[name] === 'string'; } catch { return false; }
      }).map((name) => window[name])
    }))()`)) as {
      nodeType: string;
      requireType: string;
      bridgeKeys: string[];
      status: DesktopRuntimeStatus;
      rootPresent: boolean;
      stringGlobals: string[];
    };
    writeFileSync(
      evidencePath,
      JSON.stringify(
        {
          loopbackOnly: running.readiness.address === '127.0.0.1',
          unauthorizedRequestRejected: unauthorized.status === 401,
          authenticatedHealthPassed: renderer.status.serviceProtocolVersion === 1,
          productShellServed: renderer.rootPresent,
          sandboxedRenderer:
            renderer.nodeType === 'undefined' && renderer.requireType === 'undefined',
          bridgeKeys: renderer.bridgeKeys,
          controlTokenExposedInRenderer: renderer.stringGlobals.includes(running.controlToken),
          serviceProtocolVersion: running.readiness.serviceProtocolVersion,
        },
        null,
        2,
      ),
    );
    primaryWindow.destroy();
    await supervisor.stop();
    shutdownStarted = true;
    app.exit(0);
  }
}

app.on('second-instance', () => {
  if (!primaryWindow) return;
  if (primaryWindow.isMinimized()) primaryWindow.restore();
  primaryWindow.show();
  primaryWindow.focus();
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', (event) => {
  if (shutdownStarted || !supervisor) return;
  event.preventDefault();
  shutdownStarted = true;
  void supervisor.stop().finally(() => app.quit());
});

void app
  .whenReady()
  .then(start)
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown Windows host startup error';
    console.error(`ApiaryLens Windows startup failed: ${message}`);
    void supervisor?.stop().finally(() => app.exit(70));
  });
