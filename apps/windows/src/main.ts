import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  session,
  type OnBeforeSendHeadersListenerDetails,
} from 'electron';
import {
  bootstrapRequestSchema,
  createBuildIdentity,
  type SessionView,
} from '@apiarylens/contracts';
import { SqliteStore } from '@apiarylens/database';
import { FilesystemMediaStore } from '@apiarylens/media';
import {
  desktopBridgeVersion,
  type DesktopBackupResult,
  type DesktopBootstrapSession,
  type DesktopRestoreResult,
  type DesktopRuntimeStatus,
  type DesktopMigrationResult,
} from './contracts.js';
import {
  readWindowsModeChoice,
  resolveWindowsStartupMode,
  saveWindowsModeChoice,
} from './first-run.js';
import { createWindowsDataPaths } from './paths.js';
import {
  loadDeviceOwnerCredential,
  loadOrCreateDeviceOwnerCredential,
  loadOrCreateStandaloneSecrets,
} from './protected-secrets.js';
import { desktopControlHeader } from './service-contract.js';
import { ServiceSupervisor } from './service-supervisor.js';
import {
  isTrustedConnectedRendererUrl,
  isTrustedFirstRunUrl,
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
import {
  activateStagedStandaloneData,
  createStandaloneBackup,
  readStandaloneBackup,
  rebindRestoredDeviceOwner,
  rollbackStandaloneData,
  restoreStandaloneBackupToStaging,
} from './standalone-backup.js';
import {
  acquireHeadlessLifecycleLock,
  readHeadlessLifecycleRequest,
  runHeadlessLifecycle,
  writeHeadlessLifecycleEvidence,
} from './headless-lifecycle.js';
import {
  HttpMigrationTarget,
  SqliteMigrationJournal,
  recoverAuthorityCutover,
  runStandaloneToConnectedMigration,
} from './standalone-migration.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const squirrelStartup = require('electron-squirrel-startup') as boolean;
const preloadPath = join(currentDirectory, 'preload.cjs');
const serviceScript = join(currentDirectory, 'service.js');
const webRoot = resolve(currentDirectory, '..', '..', 'web', 'dist');
const trustedWebContents = new Set<number>();
let primaryWindow: BrowserWindow | undefined;
let firstRunWindow: BrowserWindow | undefined;
let supervisor: ServiceSupervisor | undefined;
let shutdownStarted = false;
let desktopMaintenanceRunning = false;

const userDataArgument = process.argv.find((argument) =>
  argument.startsWith('--desktop-user-data='),
);
if (userDataArgument) {
  app.setPath('userData', resolve(userDataArgument.slice('--desktop-user-data='.length)));
}

if (squirrelStartup || !app.requestSingleInstanceLock()) app.quit();

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

type FirstRunChoiceResult =
  { status: 'ok' } | { status: 'canceled' } | { status: 'error'; message: string };

/**
 * Clean-profile first launch (WIN-028): before any service starts or any data
 * is created, present the two supported modes from ADR 0015. The chooser is a
 * packaged local page — it performs zero network access itself. Only choosing
 * "Connect my family" reaches the network, and only to verify the imported
 * connection profile against its backend.
 */
function presentFirstRunChooser(
  modePath: string,
  profilePath: string,
): Promise<'disconnected' | 'connected' | 'quit'> {
  const chooserPage = join(currentDirectory, 'first-run.html');
  const chooserPageUrl = pathToFileURL(chooserPage).href;
  const chooserSession = session.fromPartition('apiarylens-first-run');
  chooserSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
  const window = new BrowserWindow({
    width: 760,
    height: 640,
    minWidth: 320,
    minHeight: 480,
    show: false,
    backgroundColor: '#fffaf0',
    webPreferences: {
      preload: join(currentDirectory, 'first-run-preload.cjs'),
      partition: 'apiarylens-first-run',
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      devTools: false,
      spellcheck: false,
    },
  });
  firstRunWindow = window;
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isTrustedFirstRunUrl(navigationUrl, chooserPageUrl)) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  return new Promise((resolveChoice) => {
    let settled = false;
    const settle = (value: 'disconnected' | 'connected' | 'quit'): void => {
      if (settled) return;
      settled = true;
      ipcMain.removeHandler('apiarylens:first-run-choose');
      resolveChoice(value);
    };
    ipcMain.handle(
      'apiarylens:first-run-choose',
      async (event, untrustedChoice: unknown): Promise<FirstRunChoiceResult> => {
        if (event.sender !== window.webContents) {
          throw new Error('Untrusted renderer requested a first-run choice');
        }
        if (untrustedChoice === 'disconnected') {
          saveWindowsModeChoice(modePath, 'disconnected');
          settle('disconnected');
          // The window stays open (hidden) until the product window exists so
          // closing it never triggers window-all-closed shutdown.
          window.hide();
          return { status: 'ok' };
        }
        if (untrustedChoice === 'connected') {
          const selected = await dialog.showOpenDialog(window, {
            title: 'Select your ApiaryLens connection profile',
            filters: [{ name: 'ApiaryLens connection profile', extensions: ['json'] }],
            properties: ['openFile'],
          });
          const selectedPath = selected.filePaths[0];
          if (selected.canceled || !selectedPath) return { status: 'canceled' };
          try {
            const imported = readConnectionProfile(selectedPath);
            await verifyConnectedBackend(imported);
            saveConnectionProfile(profilePath, imported);
            saveWindowsModeChoice(modePath, 'connected');
          } catch (error) {
            return {
              status: 'error',
              message: `ApiaryLens could not connect with that profile: ${
                error instanceof Error ? error.message : 'unknown connection error'
              }`,
            };
          }
          settle('connected');
          window.hide();
          return { status: 'ok' };
        }
        throw new Error('Unknown first-run choice');
      },
    );
    window.on('closed', () => {
      if (firstRunWindow === window) firstRunWindow = undefined;
      settle('quit');
    });
    window.once('ready-to-show', () => window.show());
    void window.loadFile(chooserPage);
  });
}

function dismissFirstRunChooser(): void {
  const window = firstRunWindow;
  firstRunWindow = undefined;
  if (window && !window.isDestroyed()) window.destroy();
}

async function start(): Promise<void> {
  app.setName('ApiaryLens');
  app.setAccessibilitySupportEnabled(true);
  const userData = app.getPath('userData');
  mkdirSync(userData, { recursive: true, mode: 0o700 });
  const paths = createWindowsDataPaths(userData);
  const lifecycleRequestArgument = process.argv.find((argument) =>
    argument.startsWith('--desktop-lifecycle-request='),
  );
  const lifecycleEvidenceArgument = process.argv.find((argument) =>
    argument.startsWith('--desktop-lifecycle-evidence='),
  );
  const profilePath = resolve(userData, 'connection-profile.v1.json');
  const modePath = resolve(userData, 'windows-mode.v1.json');
  const headlessLifecycle = Boolean(lifecycleRequestArgument || lifecycleEvidenceArgument);
  const smokeArgument = process.argv.find((argument) => argument.startsWith('--desktop-smoke='));
  if (!headlessLifecycle && process.argv.includes('--desktop-standalone')) {
    removeConnectionProfile(profilePath);
    saveWindowsModeChoice(modePath, 'disconnected');
  }
  const profileArgument = process.argv.find((argument) =>
    argument.startsWith('--desktop-profile='),
  );
  if (headlessLifecycle && profileArgument)
    throw new Error('Headless lifecycle cannot import a connected profile');
  if (profileArgument && process.argv.includes('--desktop-standalone'))
    throw new Error('Choose either connected profile import or standalone mode, not both');
  if (profileArgument) {
    const imported = readConnectionProfile(profileArgument.slice('--desktop-profile='.length));
    await verifyConnectedBackend(imported);
    saveConnectionProfile(profilePath, imported);
    saveWindowsModeChoice(modePath, 'connected');
  }
  if (!headlessLifecycle && !smokeArgument) {
    const savedMode = readWindowsModeChoice(modePath);
    const startupMode = resolveWindowsStartupMode({
      savedMode,
      connectionProfileExists: existsSync(profilePath),
      standaloneDataExists: existsSync(paths.database) || existsSync(paths.protectedSecrets),
    });
    if (startupMode === 'chooser') {
      const choice = await presentFirstRunChooser(modePath, profilePath);
      if (choice === 'quit') {
        shutdownStarted = true;
        app.quit();
        return;
      }
    } else if (savedMode !== startupMode) {
      // Installs that predate the mode record adopt the mode their existing
      // data implies instead of re-entering onboarding.
      saveWindowsModeChoice(modePath, startupMode);
    }
  }
  const connection =
    lifecycleRequestArgument || lifecycleEvidenceArgument
      ? undefined
      : loadSavedConnectionProfile(profilePath);
  if (connection) {
    if (connection.migration) {
      const migrationJournal = new SqliteMigrationJournal(paths.migrationJournal);
      try {
        recoverAuthorityCutover(migrationJournal, connection);
      } finally {
        migrationJournal.close();
      }
    }
    // Remote content receives no preload or IPC bridge. Authentication cookies,
    // IndexedDB, service workers, and the offline outbox stay in this isolated partition.
    primaryWindow = secureWindow(connection.backendUrl, true, 'connected');
    await primaryWindow.loadURL(connection.backendUrl);
    dismissFirstRunChooser();
    return;
  }
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
  if (lifecycleRequestArgument || lifecycleEvidenceArgument) {
    if (!lifecycleRequestArgument || !lifecycleEvidenceArgument) {
      throw new Error('Headless lifecycle requires both request and evidence files');
    }
    const requestPath = lifecycleRequestArgument.slice('--desktop-lifecycle-request='.length);
    const evidencePath = lifecycleEvidenceArgument.slice('--desktop-lifecycle-evidence='.length);
    const parsed = readHeadlessLifecycleRequest(requestPath, evidencePath);
    const identity = createBuildIdentity({ deploymentProfile: 'development' });
    const releaseLifecycleLock = acquireHeadlessLifecycleLock(paths.runtime);
    try {
      await supervisor.start();
      await supervisor.stop();
      const evidence = await runHeadlessLifecycle({
        requestPath,
        evidencePath,
        paths,
        authRootSecret: secrets.authRootSecret,
        identity: {
          productVersion: identity.productVersion,
          databaseMigration: identity.databaseMigration,
        },
        hooks: {
          verifyServiceHealth: async () => {
            if (!supervisor) throw new Error('Standalone service is unavailable');
            const active = await supervisor.start();
            try {
              const response = await fetch(`${active.endpoint}/health`, {
                headers: {
                  [desktopControlHeader]: active.controlToken,
                  origin: active.endpoint,
                },
                cache: 'no-store',
                signal: AbortSignal.timeout(5_000),
              });
              if (!response.ok) throw new Error('Standalone health verification failed');
            } finally {
              await supervisor.stop();
            }
          },
        },
      });
      writeHeadlessLifecycleEvidence(parsed.evidencePath, evidence);
      shutdownStarted = true;
      app.exit(evidence.status === 'passed' ? 0 : 72);
      return;
    } finally {
      releaseLifecycleLock();
    }
  }
  const running = await supervisor.start();
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
  const assertOwnerSession = async (
    event: Electron.IpcMainInvokeEvent,
  ): Promise<{ organizationId: string }> => {
    assertTrustedSender(event);
    const active = supervisor?.running;
    if (!active) throw new Error('Standalone service is unavailable');
    const response = await desktopSession.fetch(`${active.endpoint}/api/v1/session`, {
      headers: {
        [desktopControlHeader]: active.controlToken,
        origin: active.endpoint,
      },
    });
    const body = (await response.json().catch(() => undefined)) as
      { membership?: { role?: unknown }; organization?: { id?: unknown } } | undefined;
    if (
      !response.ok ||
      body?.membership?.role !== 'owner' ||
      typeof body.organization?.id !== 'string'
    ) {
      throw new Error('A signed-in family owner is required for this recovery operation');
    }
    return { organizationId: body.organization.id };
  };
  const reloadAfterMaintenance = async (): Promise<void> => {
    if (!supervisor) throw new Error('Standalone host is unavailable');
    const restarted = await supervisor.start();
    setTimeout(() => void primaryWindow?.loadURL(restarted.endpoint), 250);
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
  ipcMain.handle('apiarylens:provision-device-owner', async (event): Promise<SessionView> => {
    assertTrustedSender(event);
    const active = supervisor?.running;
    if (!active) throw new Error('Standalone service is unavailable');
    const controlHeaders = {
      [desktopControlHeader]: active.controlToken,
      origin: active.endpoint,
    };
    const statusResponse = await desktopSession.fetch(
      `${active.endpoint}/api/v1/bootstrap/status`,
      {
        headers: controlHeaders,
      },
    );
    const status = (await statusResponse.json().catch(() => undefined)) as
      { available?: unknown } | undefined;
    if (!statusResponse.ok || typeof status?.available !== 'boolean') {
      throw new Error('Standalone service did not report bootstrap status');
    }
    if (status.available) {
      // Clean disconnected apiary: create the device-managed owner. The person
      // never sees an account, a password, or the recovery codes — the
      // credential lives DPAPI-protected beside the other standalone secrets.
      const owner = loadOrCreateDeviceOwnerCredential(paths.deviceOwnerCredential, safeStorage);
      const created = await desktopSession.fetch(`${active.endpoint}/api/v1/bootstrap`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...controlHeaders },
        body: JSON.stringify({
          identifier: owner.identifier,
          displayName: 'Beekeeper',
          password: owner.password,
          organizationName: 'My apiary',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          bootstrapToken: secrets.bootstrapToken,
        }),
      });
      const body = (await created.json().catch(() => undefined)) as
        (SessionView & { recoveryCodes?: string[] }) | { message?: string } | undefined;
      if (!created.ok || !body || !('user' in body)) {
        throw new Error(
          body && 'message' in body && body.message ? body.message : 'Device setup failed',
        );
      }
      const { recoveryCodes: _deviceManaged, ...view } = body;
      return view;
    }
    // An owner already exists. Only a device-managed credential may sign in
    // silently; a person-created account keeps the standard sign-in screen.
    const owner = loadDeviceOwnerCredential(paths.deviceOwnerCredential, safeStorage);
    if (!owner) throw new Error('This apiary uses a signed-in account');
    const signedIn = await desktopSession.fetch(`${active.endpoint}/api/v1/auth/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...controlHeaders },
      body: JSON.stringify({ identifier: owner.identifier, password: owner.password }),
    });
    const sessionBody = (await signedIn.json().catch(() => undefined)) as
      SessionView | { message?: string } | undefined;
    if (!signedIn.ok || !sessionBody || !('user' in sessionBody)) {
      throw new Error('This apiary uses a signed-in account');
    }
    return sessionBody;
  });
  ipcMain.handle(
    'apiarylens:migrate-standalone-to-connected',
    async (event): Promise<DesktopMigrationResult> => {
      const owner = await assertOwnerSession(event);
      if (!primaryWindow || !supervisor) throw new Error('Standalone host is unavailable');
      if (desktopMaintenanceRunning)
        throw new Error('Another recovery operation is already running');
      const selected = await dialog.showOpenDialog(primaryWindow, {
        title: 'Select the Scout Bee connection profile',
        filters: [{ name: 'ApiaryLens connection profile', extensions: ['json'] }],
        properties: ['openFile'],
      });
      const selectedPath = selected.filePaths[0];
      if (selected.canceled || !selectedPath) return { status: 'canceled' };
      const profile = readConnectionProfile(selectedPath);
      await verifyConnectedBackend(profile);
      const confirmation = await dialog.showMessageBox(primaryWindow, {
        type: 'warning',
        title: 'Connect this Windows apiary?',
        message: 'ApiaryLens will copy and verify your standalone records before connecting.',
        detail:
          'Your standalone database remains intact and a verified recovery backup is retained. Sign in as the target family owner in the next window. The authority switch occurs only after every record and photo reconciles.',
        buttons: ['Cancel', 'Sign in and migrate'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (confirmation.response !== 1) return { status: 'canceled' };

      const authWindow = secureWindow(profile.backendUrl, false, 'connected');
      authWindow.setParentWindow(primaryWindow);
      authWindow.setTitle('Sign in to the ApiaryLens migration target');
      await authWindow.loadURL(profile.backendUrl);
      authWindow.show();
      await new Promise<void>((resolveClosed) => authWindow.once('closed', resolveClosed));
      const connectedSession = session.fromPartition('persist:apiarylens-windows-connected');
      const target = new HttpMigrationTarget(
        profile,
        connectedSession.fetch.bind(connectedSession) as typeof fetch,
      );
      await target.preflight();

      desktopMaintenanceRunning = true;
      const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
      const backupPath = join(paths.backups, `apiarylens-pre-connect-${stamp}.albackup`);
      let source: SqliteStore | undefined;
      let journal: SqliteMigrationJournal | undefined;
      try {
        await supervisor.stop();
        source = new SqliteStore(paths.database, { authRootSecret: secrets.authRootSecret });
        const sourceMedia = new FilesystemMediaStore(paths.media);
        journal = new SqliteMigrationJournal(paths.migrationJournal);
        const identity = createBuildIdentity({ deploymentProfile: 'development' });
        const completion = await runStandaloneToConnectedMigration({
          journal,
          sourceOrganizationId: owner.organizationId,
          source,
          sourceMedia,
          target,
          profile,
          backupPath,
          createVerifiedBackup: () => {
            createStandaloneBackup(paths, backupPath, {
              productVersion: identity.productVersion,
              databaseMigration: identity.databaseMigration,
            });
          },
          cutover: (connectedProfile) => saveConnectionProfile(profilePath, connectedProfile),
        });
        await dialog.showMessageBox(primaryWindow, {
          type: 'info',
          title: 'ApiaryLens is connected',
          message: 'Every standalone record and photo was verified before connecting.',
          detail: `Migration ${completion.migrationId} copied ${completion.recordCount} records and ${completion.mediaCount} media files. Recovery backup: ${backupPath}`,
        });
        shutdownStarted = true;
        app.relaunch();
        app.exit(0);
        return {
          status: 'connected',
          migrationId: completion.migrationId,
          records: completion.recordCount,
          media: completion.mediaCount,
          backupPath,
        };
      } catch (error) {
        removeConnectionProfile(profilePath);
        await reloadAfterMaintenance();
        throw new Error(
          `Connection migration stopped; standalone data remains authoritative: ${error instanceof Error ? error.message : 'unknown migration error'}`,
        );
      } finally {
        source?.close();
        journal?.close();
        desktopMaintenanceRunning = false;
      }
    },
  );
  ipcMain.handle(
    'apiarylens:create-standalone-backup',
    async (event): Promise<DesktopBackupResult> => {
      await assertOwnerSession(event);
      if (!primaryWindow || !supervisor) throw new Error('Standalone host is unavailable');
      if (desktopMaintenanceRunning)
        throw new Error('Another recovery operation is already running');
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
      desktopMaintenanceRunning = true;
      try {
        await supervisor.stop();
        const identity = createBuildIdentity({ deploymentProfile: 'development' });
        try {
          const manifest = createStandaloneBackup(paths, selected.filePath, {
            productVersion: identity.productVersion,
            databaseMigration: identity.databaseMigration,
          });
          await reloadAfterMaintenance();
          await dialog.showMessageBox(primaryWindow, {
            type: 'info',
            title: 'ApiaryLens backup complete',
            message: 'Your verified Windows backup was saved.',
            detail: `${manifest.files.length} database and media files were verified. Keep the backup on another device or protected storage.`,
          });
          return {
            status: 'saved',
            path: selected.filePath,
            createdAt: manifest.createdAt,
            files: manifest.files.length,
          };
        } catch (error) {
          await reloadAfterMaintenance();
          throw error;
        }
      } finally {
        desktopMaintenanceRunning = false;
      }
    },
  );
  ipcMain.handle(
    'apiarylens:restore-standalone-backup',
    async (event): Promise<DesktopRestoreResult> => {
      await assertOwnerSession(event);
      if (!primaryWindow || !supervisor) throw new Error('Standalone host is unavailable');
      if (desktopMaintenanceRunning)
        throw new Error('Another recovery operation is already running');
      const selected = await dialog.showOpenDialog(primaryWindow, {
        title: 'Select a verified ApiaryLens backup to restore',
        filters: [{ name: 'ApiaryLens backup', extensions: ['albackup'] }],
        properties: ['openFile'],
      });
      const archivePath = selected.filePaths[0];
      if (selected.canceled || !archivePath) return { status: 'canceled' };
      const verified = readStandaloneBackup(archivePath);
      const identity = createBuildIdentity({ deploymentProfile: 'development' });
      if (
        verified.manifest.productVersion !== identity.productVersion ||
        verified.manifest.databaseMigration !== identity.databaseMigration
      ) {
        throw new Error(
          `Backup compatibility ${verified.manifest.productVersion}/migration ${verified.manifest.databaseMigration} does not match this application`,
        );
      }
      const confirmation = await dialog.showMessageBox(primaryWindow, {
        type: 'warning',
        title: 'Replace current ApiaryLens data?',
        message: 'Restore replaces the current Windows database and original photos.',
        detail: `Backup created ${new Date(verified.manifest.createdAt).toLocaleString()} with ${verified.manifest.files.length} verified files. ApiaryLens will first create a recovery backup. All restored sessions will be revoked.`,
        buttons: ['Cancel', 'Create recovery backup and restore'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (confirmation.response !== 1) return { status: 'canceled' };

      desktopMaintenanceRunning = true;
      const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
      const recoveryBackupPath = join(paths.backups, `apiarylens-pre-restore-${stamp}.albackup`);
      const stagingRoot = join(paths.root, 'restore-staging');
      const rollbackData = join(paths.root, 'restore-rollback-data');
      const currentData = dirname(paths.database);
      let cutoverStarted = false;
      try {
        await supervisor.stop();
        createStandaloneBackup(paths, recoveryBackupPath, {
          productVersion: identity.productVersion,
          databaseMigration: identity.databaseMigration,
        });
        restoreStandaloneBackupToStaging(archivePath, stagingRoot);
        const stagedStore = new SqliteStore(join(stagingRoot, 'data', 'apiarylens.sqlite'), {
          authRootSecret: secrets.authRootSecret,
        });
        try {
          const integrity = stagedStore.database.prepare('PRAGMA integrity_check').get() as
            { integrity_check?: unknown } | undefined;
          if (integrity?.integrity_check !== 'ok') {
            throw new Error('Restored SQLite integrity verification failed');
          }
          stagedStore.database
            .prepare('UPDATE sessions SET revoked_at = ?')
            .run(new Date().toISOString());
          // A restored no-account apiary must stay silently accessible: rebind
          // its device-managed owner to this machine's DPAPI credential, since
          // backups never carry credential files (WIN-028).
          await rebindRestoredDeviceOwner(
            stagedStore,
            paths.deviceOwnerCredential,
            safeStorage,
            secrets.authRootSecret,
          );
        } finally {
          stagedStore.close();
        }
        activateStagedStandaloneData(currentData, join(stagingRoot, 'data'), rollbackData);
        cutoverStarted = true;
        const restarted = await supervisor.start();
        const health = await fetch(`${restarted.endpoint}/health`, {
          headers: { [desktopControlHeader]: restarted.controlToken },
          cache: 'no-store',
          signal: AbortSignal.timeout(5_000),
        });
        if (!health.ok) throw new Error(`Restored service health failed (${health.status})`);
        rmSync(rollbackData, { recursive: true, force: true });
        rmSync(stagingRoot, { recursive: true, force: true });
        setTimeout(() => void primaryWindow?.loadURL(restarted.endpoint), 250);
        await dialog.showMessageBox(primaryWindow, {
          type: 'info',
          title: 'ApiaryLens restore complete',
          message: 'The verified backup was restored successfully.',
          detail: `A recovery backup of the replaced data was saved at ${recoveryBackupPath}. Sign in again to continue.`,
        });
        return {
          status: 'restored',
          sourceCreatedAt: verified.manifest.createdAt,
          files: verified.manifest.files.length,
          recoveryBackupPath,
        };
      } catch (error) {
        await supervisor.stop().catch(() => undefined);
        if (cutoverStarted) {
          rollbackStandaloneData(currentData, rollbackData);
        }
        rmSync(stagingRoot, { recursive: true, force: true });
        await reloadAfterMaintenance();
        throw new Error(
          `Restore stopped and the prior Windows data was recovered: ${error instanceof Error ? error.message : 'unknown restore error'}`,
        );
      } finally {
        desktopMaintenanceRunning = false;
      }
    },
  );

  primaryWindow = secureWindow(running.endpoint, !smokeArgument);
  await primaryWindow.loadURL(running.endpoint);
  dismissFirstRunChooser();
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
