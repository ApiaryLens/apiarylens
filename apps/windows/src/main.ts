import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  session,
  type OnBeforeSendHeadersListenerDetails,
} from 'electron';
import { bootstrapRequestSchema, createBuildIdentity } from '@apiarylens/contracts';
import {
  desktopBridgeVersion,
  type DesktopBackupResult,
  type DesktopBootstrapSession,
  type DesktopRuntimeStatus,
} from './contracts.js';
import { createWindowsDataPaths } from './paths.js';
import { loadOrCreateStandaloneSecrets } from './protected-secrets.js';
import { desktopControlHeader } from './service-contract.js';
import { ServiceSupervisor } from './service-supervisor.js';
import {
  isTrustedConnectedRendererUrl,
  isTrustedRendererUrl,
  shouldInjectControlHeader,
} from './window-policy.js';
import {
  loadSavedConnectionProfile,
  readConnectionProfile,
  removeConnectionProfile,
  saveConnectionProfile,
  verifyConnectedBackend,
} from './connected-profile.js';
import { createStandaloneBackup } from './standalone-backup.js';

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

function secureWindow(
  endpoint: string,
  showWhenReady = true,
  mode: 'standalone' | 'connected' = 'standalone',
): BrowserWindow {
  const partition =
    mode === 'standalone' ? 'persist:apiarylens-windows' : 'persist:apiarylens-windows-connected';
  const desktopSession = session.fromPartition(partition);
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 320,
    minHeight: 480,
    show: false,
    backgroundColor: '#fffaf0',
    webPreferences: {
      ...(mode === 'standalone' ? { preload: preloadPath } : {}),
      partition,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      devTools: false,
      spellcheck: true,
    },
  });
  if (mode === 'standalone') trustedWebContents.add(window.webContents.id);
  window.on('closed', () => trustedWebContents.delete(window.webContents.id));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, navigationUrl) => {
    const trusted =
      mode === 'standalone'
        ? isTrustedRendererUrl(navigationUrl, endpoint)
        : isTrustedConnectedRendererUrl(navigationUrl, endpoint);
    if (!trusted) event.preventDefault();
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
  const userData = app.getPath('userData');
  mkdirSync(userData, { recursive: true, mode: 0o700 });
  const profilePath = resolve(userData, 'connection-profile.v1.json');
  if (process.argv.includes('--desktop-standalone')) removeConnectionProfile(profilePath);
  const profileArgument = process.argv.find((argument) =>
    argument.startsWith('--desktop-profile='),
  );
  if (profileArgument && process.argv.includes('--desktop-standalone'))
    throw new Error('Choose either connected profile import or standalone mode, not both');
  if (profileArgument) {
    const imported = readConnectionProfile(profileArgument.slice('--desktop-profile='.length));
    await verifyConnectedBackend(imported);
    saveConnectionProfile(profilePath, imported);
  }
  const connection = loadSavedConnectionProfile(profilePath);
  if (connection) {
    // Remote content receives no preload or IPC bridge. Authentication cookies,
    // IndexedDB, service workers, and the offline outbox stay in this isolated partition.
    primaryWindow = secureWindow(connection.backendUrl, true, 'connected');
    await primaryWindow.loadURL(connection.backendUrl);
    return;
  }
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
    { urls: ['http://127.0.0.1:*/*'] },
    (details, callback) => {
      const typedDetails = details as OnBeforeSendHeadersListenerDetails & {
        webContentsId?: number;
      };
      const requestHeaders = { ...details.requestHeaders };
      const active = supervisor?.running;
      if (
        active &&
        shouldInjectControlHeader(
          details.url,
          active.endpoint,
          typedDetails.webContentsId,
          trustedWebContents,
        )
      ) {
        requestHeaders[desktopControlHeader] = active.controlToken;
      }
      callback({ requestHeaders });
    },
  );

  const assertTrustedSender = (event: Electron.IpcMainInvokeEvent): void => {
    const senderFrame = event.senderFrame;
    if (!senderFrame) throw new Error('Desktop operation has no sender frame');
    const senderUrl = senderFrame.url;
    const active = supervisor?.running;
    if (
      !active ||
      !trustedWebContents.has(event.sender.id) ||
      senderFrame !== event.sender.mainFrame ||
      !isTrustedRendererUrl(senderUrl, active.endpoint)
    ) {
      throw new Error('Untrusted renderer requested a desktop operation');
    }
  };
  ipcMain.handle('apiarylens:runtime-status', async (event): Promise<DesktopRuntimeStatus> => {
    assertTrustedSender(event);
    const active = supervisor?.running;
    if (!active) throw new Error('Standalone service is unavailable');
    const response = await fetch(`${active.endpoint}/health`, {
      headers: { [desktopControlHeader]: active.controlToken, origin: active.endpoint },
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
      const active = supervisor?.running;
      if (!active) throw new Error('Standalone service is unavailable');
      const input = bootstrapRequestSchema.omit({ bootstrapToken: true }).parse(untrustedInput);
      const response = await desktopSession.fetch(`${active.endpoint}/api/v1/bootstrap`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [desktopControlHeader]: active.controlToken,
          origin: active.endpoint,
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
  ipcMain.handle(
    'apiarylens:create-standalone-backup',
    async (event): Promise<DesktopBackupResult> => {
      assertTrustedSender(event);
      if (!primaryWindow || !supervisor) throw new Error('Standalone host is unavailable');
      const selected = await dialog.showSaveDialog(primaryWindow, {
        title: 'Save verified ApiaryLens backup',
        defaultPath: join(
          paths.backups,
          `apiarylens-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.albackup`,
        ),
        filters: [{ name: 'ApiaryLens backup', extensions: ['albackup'] }],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      });
      if (selected.canceled || !selected.filePath) return { status: 'canceled' };
      await supervisor.stop();
      let result: DesktopBackupResult;
      try {
        const identity = createBuildIdentity({ deploymentProfile: 'development' });
        const manifest = createStandaloneBackup(paths, selected.filePath, {
          productVersion: identity.productVersion,
          databaseMigration: identity.databaseMigration,
        });
        result = {
          status: 'saved',
          path: selected.filePath,
          createdAt: manifest.createdAt,
          files: manifest.files.length,
        };
      } finally {
        const restarted = await supervisor.start();
        setTimeout(() => void primaryWindow?.loadURL(restarted.endpoint), 250);
      }
      return result;
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
    // The exact-host harness reads the evidence and then stops this hidden
    // process tree, so production code does not gain a self-termination path.
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
