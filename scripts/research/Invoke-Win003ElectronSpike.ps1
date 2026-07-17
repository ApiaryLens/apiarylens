[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $WebDist,

    [Parameter(Mandatory)]
    [string] $ServerDeploy,

    [Parameter(Mandatory)]
    [string] $OutputDirectory,

    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string] $ResearchVersion = '0.0.1'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# WIN-003 research automation only. The Electron application is generated entirely
# under the hosted runner's temporary directory and is never a product scaffold.

$webDistPath = (Resolve-Path -LiteralPath $WebDist).Path
$serverDeployPath = (Resolve-Path -LiteralPath $ServerDeploy).Path
if ((Split-Path -Leaf $serverDeployPath) -ne 'server') {
    throw 'The disposable portable-server deployment directory must be named server'
}
$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
$runnerTemp = [System.IO.Path]::GetFullPath($env:RUNNER_TEMP)
if (-not $outputPath.StartsWith($runnerTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Research output must remain under the runner temporary directory: $runnerTemp"
}

$labPath = Join-Path $runnerTemp 'apiarylens-win003-electron-lab'
if (Test-Path -LiteralPath $labPath) {
    $resolvedLab = [System.IO.Path]::GetFullPath($labPath)
    if (-not $resolvedLab.StartsWith($runnerTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clear a path outside the runner temporary directory: $resolvedLab"
    }
    Remove-Item -LiteralPath $resolvedLab -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $labPath | Out-Null
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $labPath 'web') | Out-Null
Copy-Item -Path (Join-Path $webDistPath '*') -Destination (Join-Path $labPath 'web') -Recurse -Force

$packageJson = @'
{
  "name": "apiarylens-win003-electron-research",
  "productName": "ApiaryLens WIN-003 Electron Research",
  "version": "0.0.1",
  "private": true,
  "description": "ApiaryLens WIN-003 Electron packaging research",
  "author": "ApiaryLens",
  "license": "UNLICENSED",
  "main": "main.cjs",
  "dependencies": {
    "electron-squirrel-startup": "1.0.1"
  },
  "devDependencies": {
    "@electron-forge/cli": "7.11.2",
    "@electron-forge/maker-squirrel": "7.11.2",
    "electron": "43.1.1"
  }
}
'@
$packageJson = $packageJson.Replace('"version": "0.0.1"', '"version": "' + $ResearchVersion + '"')

$forgeConfig = @'
module.exports = {
  packagerConfig: {
    asar: true,
    executableName: "ApiaryLensElectronResearch",
    extraResource: [process.env.WIN003_SERVER_DEPLOY],
    windowsSign: process.env.WINDOWS_CERTIFICATE_FILE ? true : false
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "ApiaryLensElectronResearch",
        authors: "ApiaryLens",
        description: "ApiaryLens WIN-003 Electron packaging research",
        setupExe: "ApiaryLensElectronResearchSetup.exe",
        noMsi: true
      }
    }
  ]
};
'@

$preload = @'
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "apiaryLensDesktop",
  Object.freeze({
    health: () => ipcRenderer.invoke("apiarylens:desktop-health")
  })
);
'@

$main = @'
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, ipcMain, safeStorage } = require("electron");

if (require("electron-squirrel-startup")) app.quit();
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

const indexPath = path.join(__dirname, "web", "index.html");
const trustedDocumentUrl = pathToFileURL(indexPath).toString();
const controlToken = crypto.randomBytes(32).toString("base64url");
const bootstrapToken = crypto.randomBytes(32).toString("base64url");
const authRootSecret = crypto.randomBytes(48).toString("base64url");
const allowedOrigin = "file://apiarylens-electron-research";
let bridgeInvocationCount = 0;
let bridgeArgumentCount = 0;
let serviceEndpoint;
let serviceReady;
let serviceProcess;
let serviceLab;
let serviceOutput = "";
let lastStartRemovedStaleReadiness = false;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function startRealService(reuseLab = false, requestedLab) {
  if (requestedLab) {
    serviceLab = path.resolve(requestedLab);
  } else if (!reuseLab) {
    serviceLab = fs.mkdtempSync(path.join(os.tmpdir(), "apiarylens-win003-electron-service-"));
  }
  const readyFile = path.join(serviceLab, "ready.json");
  lastStartRemovedStaleReadiness = false;
  if (fs.existsSync(readyFile)) {
    let priorPid;
    try {
      priorPid = Number.parseInt(JSON.parse(fs.readFileSync(readyFile, "utf8")).pid, 10);
    } catch {}
    if (Number.isSafeInteger(priorPid)) {
      try {
        process.kill(priorPid, 0);
        throw new Error("active-service-readiness-record");
      } catch (error) {
        if (error.message === "active-service-readiness-record") throw error;
      }
    }
    fs.rmSync(readyFile, { force: true });
    lastStartRemovedStaleReadiness = true;
  }
  const serverRoot = path.join(process.resourcesPath, "server");
  const serviceScript = path.join(serverRoot, "desktop-wrapper.mjs");
  serviceProcess = spawn(process.execPath, [serviceScript], {
    cwd: serverRoot,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      APIARYLENS_CONTROL_TOKEN: controlToken,
      APIARYLENS_ALLOWED_ORIGIN: allowedOrigin,
      APIARYLENS_DATA_DIRECTORY: path.join(serviceLab, "data"),
      APIARYLENS_READY_FILE: readyFile,
      APIARYLENS_PARENT_PID: String(process.pid),
      APIARYLENS_INSTANCE_NAME: `ApiaryLens-WIN003-Electron-${crypto.randomUUID()}`,
      APIARYLENS_BOOTSTRAP_TOKEN: bootstrapToken,
      APIARYLENS_AUTH_ROOT_SECRET: authRootSecret
    }
  });
  serviceProcess.stdout.on("data", (chunk) => { serviceOutput += chunk.toString(); });
  serviceProcess.stderr.on("data", (chunk) => { serviceOutput += chunk.toString(); });

  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (fs.existsSync(readyFile)) {
      serviceReady = JSON.parse(fs.readFileSync(readyFile, "utf8"));
      serviceEndpoint = `http://127.0.0.1:${serviceReady.port}`;
      return;
    }
    if (serviceProcess.exitCode !== null) {
      throw new Error(`real-service-exited-${serviceProcess.exitCode}:${serviceOutput}`);
    }
    await delay(100);
  }
  serviceProcess.kill();
  throw new Error("real-service-readiness-timeout");
}

async function stopRealService() {
  if (!serviceProcess || serviceProcess.exitCode !== null) return;
  await fetch(`${serviceEndpoint}/__desktop/shutdown`, {
    method: "POST",
    headers: { authorization: `Bearer ${controlToken}`, origin: allowedOrigin }
  });
  for (let attempt = 0; attempt < 100 && serviceProcess.exitCode === null; attempt += 1) {
    await delay(50);
  }
  if (serviceProcess.exitCode === null) serviceProcess.kill();
}

async function restartRealService() {
  await stopRealService();
  await startRealService(true);
  return Object.freeze({
    endpoint: serviceEndpoint,
    migrationVersions: serviceReady.migrationVersions
  });
}

ipcMain.handle("apiarylens:desktop-health", async (event, ...args) => {
  bridgeArgumentCount += args.length;
  if (event.senderFrame.url !== trustedDocumentUrl) throw new Error("untrusted-sender");
  bridgeInvocationCount += 1;

  if (!serviceEndpoint) throw new Error("real-service-not-ready");
  const response = await fetch(`${serviceEndpoint}/health`, {
    headers: { authorization: `Bearer ${controlToken}`, origin: allowedOrigin }
  });
  return Object.freeze({
    status: response.status,
    serviceProtocolVersion: serviceReady.serviceProtocolVersion
  });
});

function sqliteProbe() {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(":memory:");
  db.exec("create table probe(value text)");
  db.close();
  return "electron-node-sqlite-ok";
}

function safeStorageCredentialProbe() {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("safe-storage-unavailable");
  const credentialDirectory = path.join(serviceLab, "credential-probe");
  const credentialFile = path.join(credentialDirectory, "connected-session.bin");
  const replacementFile = path.join(credentialDirectory, "connected-session.next");
  fs.mkdirSync(credentialDirectory, { recursive: true });

  const initialSecret = crypto.randomBytes(48).toString("base64url");
  const replacementSecret = crypto.randomBytes(48).toString("base64url");
  const initialCiphertext = safeStorage.encryptString(initialSecret);
  fs.writeFileSync(credentialFile, initialCiphertext, { mode: 0o600 });
  const storedInitial = fs.readFileSync(credentialFile);
  const initialRoundTrip = safeStorage.decryptString(storedInitial) === initialSecret;
  const initialCiphertextExcludesPlaintext =
    !storedInitial.includes(Buffer.from(initialSecret, "utf8"));

  const replacementCiphertext = safeStorage.encryptString(replacementSecret);
  fs.writeFileSync(replacementFile, replacementCiphertext, { mode: 0o600 });
  fs.renameSync(replacementFile, credentialFile);
  const storedReplacement = fs.readFileSync(credentialFile);
  const replacementRoundTrip =
    safeStorage.decryptString(storedReplacement) === replacementSecret;
  const replacementCiphertextExcludesPlaintext =
    !storedReplacement.includes(Buffer.from(initialSecret, "utf8")) &&
    !storedReplacement.includes(Buffer.from(replacementSecret, "utf8"));

  const corruptCiphertext = Buffer.from(storedReplacement);
  corruptCiphertext[Math.floor(corruptCiphertext.length / 2)] ^= 0xff;
  let corruptCiphertextRejected = false;
  try {
    safeStorage.decryptString(corruptCiphertext);
  } catch {
    corruptCiphertextRejected = true;
  }

  fs.rmSync(credentialDirectory, { recursive: true, force: true });
  return {
    evidence: Object.freeze({
      encryptionAvailable: true,
      initialRoundTrip,
      initialCiphertextExcludesPlaintext,
      replacementRoundTrip,
      replacementCiphertextExcludesPlaintext,
      corruptCiphertextRejected,
      credentialDeleted: !fs.existsSync(credentialFile)
    }),
    secrets: [initialSecret, replacementSecret]
  };
}

function protectCredentialEnvelope(target, version, purpose) {
  const envelope = JSON.stringify({
    schemaVersion: 1,
    version,
    purpose,
    value: crypto.randomBytes(48).toString("base64url")
  });
  fs.writeFileSync(target, safeStorage.encryptString(envelope), { mode: 0o600 });
}

function readCredentialEnvelope(target) {
  return JSON.parse(safeStorage.decryptString(fs.readFileSync(target)));
}

function retentionRootFromState(statePath) {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) throw new Error("missing-localappdata");
  const expected = path.resolve(localAppData, "ApiaryLens", "WIN003-Retention-Research");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const presented = path.resolve(state.retentionRoot);
  if (presented.toLowerCase() !== expected.toLowerCase()) {
    throw new Error("retention-root-mismatch");
  }
  return expected;
}

function createServerSessionCredentialLifecycle() {
  const directory = path.join(serviceLab, "server-session-credential");
  const currentFile = path.join(directory, "connected-session.bin");
  const pendingFile = path.join(directory, "connected-session.pending");
  const journalFile = path.join(directory, "rotation.json");
  fs.mkdirSync(directory, { recursive: true });
  const secrets = [];
  let issuedCount = 0;
  let rotationPassed = false;
  let revocationPassed = false;
  let signOutPassed = false;
  const protect = (target, value) => {
    secrets.push(value);
    fs.writeFileSync(target, safeStorage.encryptString(value), { mode: 0o600 });
  };
  const load = () => safeStorage.decryptString(fs.readFileSync(currentFile));
  return {
    secrets,
    issued(value) {
      protect(currentFile, value);
      if (load() !== value) throw new Error("server-session-protect-failed");
      issuedCount += 1;
    },
    rotated(previous, replacement) {
      if (load() !== previous) throw new Error("server-session-rotation-source-mismatch");
      protect(pendingFile, replacement);
      fs.writeFileSync(
        journalFile,
        JSON.stringify({ schemaVersion: 1, state: "replacement-protected", purpose: "connected-session" }),
        { encoding: "utf8", mode: 0o600 }
      );
      fs.renameSync(pendingFile, currentFile);
      fs.rmSync(journalFile, { force: true });
      rotationPassed = load() === replacement && !fs.existsSync(pendingFile);
      if (!rotationPassed) throw new Error("server-session-rotation-failed");
    },
    revoked(value) {
      if (load() !== value) throw new Error("server-session-revocation-source-mismatch");
      fs.rmSync(currentFile, { force: true });
      revocationPassed = !fs.existsSync(currentFile);
    },
    signedOut(value) {
      if (load() !== value) throw new Error("server-session-signout-source-mismatch");
      fs.rmSync(directory, { recursive: true, force: true });
      signOutPassed = !fs.existsSync(directory);
    },
    passed() {
      return issuedCount === 2 && rotationPassed && revocationPassed && signOutPassed;
    }
  };
}

const probeIndex = process.argv.indexOf("--win003-probe-output");
const bridgeProbeIndex = process.argv.indexOf("--win003-bridge-output");
const crashProbeIndex = process.argv.indexOf("--win003-crash-probe-output");
const recoveryProbeInputIndex = process.argv.indexOf("--win003-recovery-probe-input");
const recoveryProbeOutputIndex = process.argv.indexOf("--win003-recovery-probe-output");
const credentialCrashOutputIndex = process.argv.indexOf("--win003-credential-crash-output");
const credentialRecoveryInputIndex = process.argv.indexOf("--win003-credential-recovery-input");
const credentialRecoveryOutputIndex = process.argv.indexOf("--win003-credential-recovery-output");
const retentionPrepareOutputIndex = process.argv.indexOf("--win003-retention-prepare-output");
const retentionVerifyInputIndex = process.argv.indexOf("--win003-retention-verify-input");
const retentionVerifyOutputIndex = process.argv.indexOf("--win003-retention-verify-output");
const retentionRemoveInputIndex = process.argv.indexOf("--win003-retention-remove-input");
const retentionRemoveOutputIndex = process.argv.indexOf("--win003-retention-remove-output");
if (!hasSingleInstanceLock) {
  // The primary instance owns all application and embedded-service work.
} else if (retentionRemoveInputIndex >= 0 && retentionRemoveOutputIndex >= 0) {
  app.whenReady().then(() => {
    const retentionRoot = retentionRootFromState(process.argv[retentionRemoveInputIndex + 1]);
    fs.rmSync(retentionRoot, { recursive: true, force: true });
    fs.writeFileSync(
      process.argv[retentionRemoveOutputIndex + 1],
      JSON.stringify({ removeAllDeletedCredentialAndHiveData: !fs.existsSync(retentionRoot) })
    );
    app.quit();
  }).catch((error) => {
    console.error(`retention-remove-probe-failed:${error.message}`);
    app.exit(81);
  });
} else if (retentionVerifyInputIndex >= 0 && retentionVerifyOutputIndex >= 0) {
  app.whenReady().then(() => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("safe-storage-unavailable");
    const retentionRoot = retentionRootFromState(process.argv[retentionVerifyInputIndex + 1]);
    const activeRoot = path.join(retentionRoot, "standalone-root.bin");
    const backupRoot = path.join(retentionRoot, "backups", "standalone-root.bin");
    const protectedRoot = readCredentialEnvelope(activeRoot);
    const hiveData = fs.readFileSync(path.join(retentionRoot, "apiarylens.sqlite.fixture"), "utf8");
    fs.rmSync(activeRoot, { force: true });
    fs.copyFileSync(backupRoot, activeRoot);
    const restoredRoot = readCredentialEnvelope(activeRoot);
    fs.writeFileSync(
      process.argv[retentionVerifyOutputIndex + 1],
      JSON.stringify({
        protectedRootReadableAfterReinstall:
          protectedRoot.schemaVersion === 1 &&
          protectedRoot.version === 1 &&
          protectedRoot.purpose === "standalone-auth-root" &&
          typeof protectedRoot.value === "string" &&
          protectedRoot.value.length === 64,
        hiveDataReadableAfterReinstall: hiveData === "non-secret-hive-data",
        protectedBackupRestoredAfterReinstall:
          restoredRoot.schemaVersion === 1 &&
          restoredRoot.version === 1 &&
          restoredRoot.purpose === "standalone-auth-root" &&
          restoredRoot.value === protectedRoot.value
      })
    );
    app.quit();
  }).catch((error) => {
    console.error(`retention-verify-probe-failed:${error.message}`);
    app.exit(80);
  });
} else if (retentionPrepareOutputIndex >= 0) {
  app.whenReady().then(() => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("safe-storage-unavailable");
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) throw new Error("missing-localappdata");
    const retentionRoot = path.resolve(
      localAppData,
      "ApiaryLens",
      "WIN003-Retention-Research"
    );
    fs.rmSync(retentionRoot, { recursive: true, force: true });
    fs.mkdirSync(retentionRoot, { recursive: true });
    const activeRoot = path.join(retentionRoot, "standalone-root.bin");
    const backupRoot = path.join(retentionRoot, "backups", "standalone-root.bin");
    protectCredentialEnvelope(
      activeRoot,
      1,
      "standalone-auth-root"
    );
    fs.mkdirSync(path.dirname(backupRoot), { recursive: true });
    fs.copyFileSync(activeRoot, backupRoot);
    fs.writeFileSync(
      path.join(retentionRoot, "apiarylens.sqlite.fixture"),
      "non-secret-hive-data",
      { encoding: "utf8", mode: 0o600 }
    );
    fs.writeFileSync(
      process.argv[retentionPrepareOutputIndex + 1],
      JSON.stringify({ retentionRoot })
    );
    app.quit();
  }).catch((error) => {
    console.error(`retention-prepare-probe-failed:${error.message}`);
    app.exit(79);
  });
} else if (credentialRecoveryInputIndex >= 0 && credentialRecoveryOutputIndex >= 0) {
  app.whenReady().then(() => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("safe-storage-unavailable");
    const crashState = JSON.parse(
      fs.readFileSync(process.argv[credentialRecoveryInputIndex + 1], "utf8")
    );
    const credentialLab = path.resolve(crashState.credentialLab);
    const tempRoot = path.resolve(os.tmpdir()) + path.sep;
    if (
      !credentialLab.startsWith(tempRoot) ||
      !path.basename(credentialLab).startsWith("apiarylens-win003-electron-credential-")
    ) {
      throw new Error("credential-recovery-lab-outside-electron-temp");
    }
    const currentFile = path.join(credentialLab, "connected-session.bin");
    const pendingFile = path.join(credentialLab, "connected-session.pending");
    const journalFile = path.join(credentialLab, "rotation.json");
    const dataFile = path.join(credentialLab, "hive-data.sqlite.fixture");
    const journal = JSON.parse(fs.readFileSync(journalFile, "utf8"));
    const current = readCredentialEnvelope(currentFile);
    const pending = readCredentialEnvelope(pendingFile);
    const interruptedRotationDetected =
      journal.state === "replacement-protected" &&
      journal.fromVersion === 1 &&
      journal.toVersion === 2 &&
      current.version === 1 &&
      pending.version === 2 &&
      current.purpose === "connected-session" &&
      pending.purpose === "connected-session" &&
      typeof current.value === "string" &&
      current.value.length === 64 &&
      typeof pending.value === "string" &&
      pending.value.length === 64;
    if (!interruptedRotationDetected) throw new Error("invalid-interrupted-rotation-state");

    fs.renameSync(pendingFile, currentFile);
    fs.rmSync(journalFile, { force: true });
    const promoted = readCredentialEnvelope(currentFile);
    const replacementPromoted =
      promoted.version === 2 &&
      promoted.purpose === "connected-session" &&
      promoted.value === pending.value &&
      !fs.existsSync(pendingFile) &&
      !fs.existsSync(journalFile);

    fs.rmSync(currentFile, { force: true });
    const revokedSessionDeleted = !fs.existsSync(currentFile);
    const signOutRetainedHiveData = fs.existsSync(dataFile);

    const standaloneRoot = path.join(credentialLab, "standalone-root.bin");
    protectCredentialEnvelope(standaloneRoot, 1, "standalone-auth-root");
    const keepDataPreservedProtectedRootAndHiveData =
      readCredentialEnvelope(standaloneRoot).purpose === "standalone-auth-root" &&
      fs.existsSync(dataFile);

    fs.rmSync(credentialLab, { recursive: true, force: true });
    const removeAllDeletedCredentialAndHiveData = !fs.existsSync(credentialLab);
    fs.writeFileSync(
      process.argv[credentialRecoveryOutputIndex + 1],
      JSON.stringify({
        interruptedRotationDetected,
        replacementPromoted,
        revokedSessionDeleted,
        signOutRetainedHiveData,
        keepDataPreservedProtectedRootAndHiveData,
        removeAllDeletedCredentialAndHiveData
      })
    );
    app.quit();
  }).catch((error) => {
    console.error(`credential-recovery-probe-failed:${error.message}`);
    app.exit(77);
  });
} else if (credentialCrashOutputIndex >= 0) {
  app.whenReady().then(() => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("safe-storage-unavailable");
    const credentialLab = fs.mkdtempSync(
      path.join(os.tmpdir(), "apiarylens-win003-electron-credential-")
    );
    const currentFile = path.join(credentialLab, "connected-session.bin");
    const pendingFile = path.join(credentialLab, "connected-session.pending");
    const journalFile = path.join(credentialLab, "rotation.json");
    fs.writeFileSync(path.join(credentialLab, "hive-data.sqlite.fixture"), "non-secret-hive-data");
    protectCredentialEnvelope(currentFile, 1, "connected-session");
    protectCredentialEnvelope(pendingFile, 2, "connected-session");
    fs.writeFileSync(
      journalFile,
      JSON.stringify({
        schemaVersion: 1,
        state: "replacement-protected",
        purpose: "connected-session",
        fromVersion: 1,
        toVersion: 2
      }),
      { encoding: "utf8", mode: 0o600 }
    );
    fs.writeFileSync(
      process.argv[credentialCrashOutputIndex + 1],
      JSON.stringify({ credentialLab })
    );
    app.exit(76);
  }).catch((error) => {
    console.error(`credential-crash-probe-failed:${error.message}`);
    app.exit(78);
  });
} else if (recoveryProbeInputIndex >= 0 && recoveryProbeOutputIndex >= 0) {
  app.whenReady().then(async () => {
    const crashState = JSON.parse(fs.readFileSync(process.argv[recoveryProbeInputIndex + 1], "utf8"));
    const previousReadyFile = path.resolve(crashState.serviceReadyFile);
    const previousLab = path.dirname(previousReadyFile);
    const tempRoot = path.resolve(os.tmpdir()) + path.sep;
    if (
      !previousLab.startsWith(tempRoot) ||
      !path.basename(previousLab).startsWith("apiarylens-win003-electron-service-")
    ) {
      throw new Error("recovery-probe-lab-outside-electron-temp");
    }
    await startRealService(false, previousLab);
    const recoveredPid = serviceProcess.pid;
    const readinessReplacedForRecoveredService =
      serviceReady.pid === recoveredPid && serviceReady.address === "127.0.0.1";
    await stopRealService();
    const readyFileRemovedAfterRecoveryShutdown = !fs.existsSync(previousReadyFile);
    fs.writeFileSync(process.argv[recoveryProbeOutputIndex + 1], JSON.stringify({
      staleReadinessRemovedBeforeRestart: lastStartRemovedStaleReadiness,
      readinessReplacedForRecoveredService,
      recoveredServiceExitCode: serviceProcess.exitCode,
      readyFileRemovedAfterRecoveryShutdown
    }));
    fs.rmSync(previousLab, { recursive: true, force: true });
    app.quit();
  }).catch((error) => {
    console.error(`recovery-probe-failed:${error.message}`);
    if (serviceProcess?.exitCode === null) serviceProcess.kill();
    app.exit(72);
  });
} else if (crashProbeIndex >= 0) {
  app.whenReady().then(async () => {
    await startRealService();
    fs.writeFileSync(process.argv[crashProbeIndex + 1], JSON.stringify({
      hostProcessId: process.pid,
      serviceProcessId: serviceProcess.pid,
      serviceReadyFile: path.join(serviceLab, "ready.json")
    }));
  }).catch((error) => {
    console.error(`crash-probe-failed:${error.message}`);
    if (serviceProcess?.exitCode === null) serviceProcess.kill();
    app.exit(71);
  });
} else if (bridgeProbeIndex >= 0) {
  app.whenReady().then(async () => {
    await startRealService();
    const serverRoot = path.join(process.resourcesPath, "server");
    const acceptanceModule = await import(
      `${pathToFileURL(path.join(serverRoot, "desktop-acceptance.mjs")).href}?run=${crypto.randomUUID()}`
    );
    const serverSessionCredentialLifecycle = createServerSessionCredentialLifecycle();
    const apiAcceptance = await acceptanceModule.runApiAcceptance({
      endpoint: serviceEndpoint,
      controlToken,
      allowedOrigin,
      bootstrapToken,
      migrationVersions: serviceReady.migrationVersions,
      restartService: restartRealService,
      credentialLifecycle: serverSessionCredentialLifecycle
    });
    const credentialProbe = safeStorageCredentialProbe();
    const consoleMessages = [];
    const trustedWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    trustedWindow.webContents.on("console-message", (...args) => consoleMessages.push(args.map(String).join(" ")));
    trustedWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    trustedWindow.webContents.on("will-navigate", (event) => event.preventDefault());
    await trustedWindow.loadFile(indexPath);
    const rendererResult = await trustedWindow.webContents.executeJavaScript(`(async () => {
      const health = await window.apiaryLensDesktop.health();
      const stringGlobals = [];
      for (const name of Object.getOwnPropertyNames(window)) {
        try {
          if (typeof window[name] === "string") stringGlobals.push([name, window[name]]);
        } catch {}
      }
      return {
        nodeType: typeof process,
        requireType: typeof require,
        bridgeKeys: Object.keys(window.apiaryLensDesktop),
        health,
        localStorage: Object.entries(localStorage),
        sessionStorage: Object.entries(sessionStorage),
        stringGlobals
      };
    })()`);

    const untrustedWindow = new BrowserWindow({
      width: 320,
      height: 240,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    await untrustedWindow.loadURL("data:text/html,<title>untrusted</title>");
    const untrustedSenderRejected = await untrustedWindow.webContents.executeJavaScript(`
      window.apiaryLensDesktop.health().then(() => false).catch(() => true)
    `);

    const rendererSnapshot = JSON.stringify(rendererResult);
    const credentialSecretPresentOutsideMain = [
      ...credentialProbe.secrets,
      ...serverSessionCredentialLifecycle.secrets
    ].some((secret) =>
      rendererSnapshot.includes(secret) ||
      consoleMessages.some((message) => message.includes(secret)) ||
      process.argv.some((argument) => argument.includes(secret)) ||
      serviceProcess.spawnargs.some((argument) => argument.includes(secret)) ||
      JSON.stringify(serviceReady).includes(secret) ||
      serviceOutput.includes(secret)
    );
    await stopRealService();
    const databasePath = path.join(serviceLab, "data", "apiarylens.sqlite");
    const mediaPath = path.join(serviceLab, "data", "media");
    const result = {
      sandboxedRendererHasNoNodeProcess: rendererResult.nodeType === "undefined",
      sandboxedRendererHasNoRequire: rendererResult.requireType === "undefined",
      exposedBridgeKeys: rendererResult.bridgeKeys,
      typedHealthStatus: rendererResult.health.status,
      typedHealthProtocolVersion: rendererResult.health.serviceProtocolVersion,
      bridgeInvocationCount,
      rendererToMainArgumentCount: bridgeArgumentCount,
      untrustedSenderRejected,
      tokenPresentInRendererSnapshot: rendererSnapshot.includes(controlToken),
      tokenPresentInConsoleMessages: consoleMessages.some((message) => message.includes(controlToken)),
      tokenPresentInArguments: process.argv.some((argument) => argument.includes(controlToken)),
      tokenPresentInServiceArguments: serviceProcess.spawnargs.some((argument) => argument.includes(controlToken)),
      tokenPresentInReadinessOrServiceOutput:
        JSON.stringify(serviceReady).includes(controlToken) || serviceOutput.includes(controlToken),
      realServiceAddress: serviceReady.address,
      realServiceDatabaseCreated: fs.existsSync(databasePath),
      realServiceMediaDirectoryCreated: fs.existsSync(mediaPath),
      realServiceExitCode: serviceProcess.exitCode,
      apiAcceptance,
      nativeCredentialProtection: credentialProbe.evidence,
      serverSessionCredentialLifecyclePassed:
        apiAcceptance.serverSessionCredentialLifecyclePassed,
      credentialSecretPresentOutsideMain,
      localStorageEntryCount: rendererResult.localStorage.length,
      sessionStorageEntryCount: rendererResult.sessionStorage.length
    };
    fs.writeFileSync(process.argv[bridgeProbeIndex + 1], JSON.stringify(result));
    trustedWindow.destroy();
    untrustedWindow.destroy();
    fs.rmSync(serviceLab, { recursive: true, force: true });
    app.quit();
  }).catch((error) => {
    console.error(`bridge-probe-failed:${error.message}`);
    if (serviceProcess?.exitCode === null) serviceProcess.kill();
    if (serviceLab) fs.rmSync(serviceLab, { recursive: true, force: true });
    app.exit(70);
  });
} else if (probeIndex >= 0) {
  app.whenReady().then(() => {
    fs.writeFileSync(process.argv[probeIndex + 1], JSON.stringify({ sqlite: sqliteProbe(), electron: process.versions.electron, node: process.versions.node }));
    app.quit();
  });
} else {
  app.whenReady().then(() => {
    const window = new BrowserWindow({
      width: 1280,
      height: 800,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    window.webContents.once("did-finish-load", () => {
      const readyFile = process.env.WIN003_READY_FILE;
      if (readyFile) fs.writeFileSync(readyFile, JSON.stringify({ sqlite: sqliteProbe(), electron: process.versions.electron, node: process.versions.node }));
    });
    window.loadFile(indexPath);
  });
}

app.on("window-all-closed", () => app.quit());
'@

Set-Content -LiteralPath (Join-Path $labPath 'package.json') -Value $packageJson -Encoding utf8NoBOM
Set-Content -LiteralPath (Join-Path $labPath 'forge.config.js') -Value $forgeConfig -Encoding utf8NoBOM
Set-Content -LiteralPath (Join-Path $labPath 'preload.cjs') -Value $preload -Encoding utf8NoBOM
Set-Content -LiteralPath (Join-Path $labPath 'main.cjs') -Value $main -Encoding utf8NoBOM
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'win003-electron-real-service-fixture.mjs') -Destination (Join-Path $serverDeployPath 'desktop-wrapper.mjs') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'win003-electron-api-acceptance.mjs') -Destination (Join-Path $serverDeployPath 'desktop-acceptance.mjs') -Force

Push-Location $labPath
try {
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "Electron lab dependency install failed with exit code $LASTEXITCODE" }
    $env:WIN003_SERVER_DEPLOY = $serverDeployPath
    npx --no-install electron-forge make --arch=x64
    if ($LASTEXITCODE -ne 0) { throw "Electron Forge make failed with exit code $LASTEXITCODE" }
} finally {
    Remove-Item Env:WIN003_SERVER_DEPLOY -ErrorAction SilentlyContinue
    Pop-Location
}

$packageDirectory = Get-ChildItem -LiteralPath (Join-Path $labPath 'out') -Directory |
    Where-Object { $_.Name -like '*-win32-x64' } |
    Select-Object -First 1
$hostExecutable = Get-ChildItem -LiteralPath $packageDirectory.FullName -Filter 'ApiaryLensElectronResearch.exe' | Select-Object -First 1
$makeDirectory = Join-Path $labPath 'out/make/squirrel.windows/x64'
$installer = Get-ChildItem -LiteralPath $makeDirectory -Filter '*Setup.exe' | Select-Object -First 1
$nupkg = Get-ChildItem -LiteralPath $makeDirectory -Filter '*-full.nupkg' | Select-Object -First 1
$releases = Join-Path $makeDirectory 'RELEASES'
if (-not $packageDirectory -or -not $hostExecutable -or -not $installer -or -not $nupkg -or -not (Test-Path -LiteralPath $releases)) {
    throw 'Electron Forge did not produce the expected package and Squirrel artifacts'
}
$packagedServer = Join-Path $packageDirectory.FullName 'resources/server'
if (-not (Test-Path -LiteralPath (Join-Path $packagedServer 'dist/app.js')) -or
    -not (Test-Path -LiteralPath (Join-Path $packagedServer 'desktop-wrapper.mjs')) -or
    -not (Test-Path -LiteralPath (Join-Path $packagedServer 'desktop-acceptance.mjs'))) {
    throw 'Electron package does not contain the deployed real ApiaryLens server resource'
}

if ($env:WINDOWS_CERTIFICATE_FILE) {
    $signTool = Get-ChildItem -LiteralPath "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter 'signtool.exe' |
        Where-Object FullName -Match '\\x64\\signtool\.exe$' |
        Sort-Object FullName -Descending |
        Select-Object -First 1
    if (-not $signTool) { throw 'Windows SDK SignTool was not found for outer installer test signing' }
    & $signTool.FullName sign /fd SHA256 /f $env:WINDOWS_CERTIFICATE_FILE /p $env:WINDOWS_CERTIFICATE_PASSWORD $installer.FullName
    if ($LASTEXITCODE -ne 0) { throw "Electron outer setup test signing failed with exit code $LASTEXITCODE" }
}

$hostSignature = Get-AuthenticodeSignature -LiteralPath $hostExecutable.FullName
$setupSignature = Get-AuthenticodeSignature -LiteralPath $installer.FullName
if ($env:WINDOWS_CERTIFICATE_FILE -and (
    -not $hostSignature.SignerCertificate -or
    -not $setupSignature.SignerCertificate -or
    $hostSignature.SignerCertificate.Thumbprint -ne $env:WIN003_CERT_THUMBPRINT -or
    $setupSignature.SignerCertificate.Thumbprint -ne $env:WIN003_CERT_THUMBPRINT
)) {
    throw 'Electron test signatures did not match the ephemeral signing certificate'
}

function Get-DescendantProcessIds {
    param([int] $RootId)
    $all = @(Get-CimInstance Win32_Process)
    $ids = [System.Collections.Generic.HashSet[int]]::new()
    [void] $ids.Add($RootId)
    do {
        $added = $false
        foreach ($candidate in $all) {
            if ($ids.Contains([int] $candidate.ParentProcessId) -and -not $ids.Contains([int] $candidate.ProcessId)) {
                [void] $ids.Add([int] $candidate.ProcessId)
                $added = $true
            }
        }
    } while ($added)
    return @($ids)
}

$probePath = Join-Path $runnerTemp 'win003-electron-package-probe.json'
$probe = Start-Process -FilePath $hostExecutable.FullName -ArgumentList @('--win003-probe-output', "`"$probePath`"") -PassThru -WindowStyle Hidden
if (-not $probe.WaitForExit(15000)) {
    Stop-Process -Id $probe.Id -Force -ErrorAction SilentlyContinue
    throw 'Packaged Electron sqlite probe exceeded 15 seconds'
}
if ($probe.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $probePath)) { throw 'Packaged Electron sqlite probe failed' }
$probeResult = Get-Content -Raw -LiteralPath $probePath | ConvertFrom-Json
if ($probeResult.sqlite -ne 'electron-node-sqlite-ok') { throw "Packaged Electron sqlite result was $($probeResult.sqlite)" }

$bridgeProbePath = Join-Path $runnerTemp 'win003-electron-bridge-probe.json'
$bridgeProbe = Start-Process -FilePath $hostExecutable.FullName -ArgumentList @('--win003-bridge-output', "`"$bridgeProbePath`"") -PassThru -WindowStyle Hidden
if (-not $bridgeProbe.WaitForExit(30000)) {
    Stop-Process -Id $bridgeProbe.Id -Force -ErrorAction SilentlyContinue
    throw 'Packaged Electron bridge probe exceeded 30 seconds'
}
if ($bridgeProbe.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $bridgeProbePath)) {
    throw 'Packaged Electron bridge probe failed'
}
$bridgeResult = Get-Content -Raw -LiteralPath $bridgeProbePath | ConvertFrom-Json
$bridgePassed =
    $bridgeResult.sandboxedRendererHasNoNodeProcess -and
    $bridgeResult.sandboxedRendererHasNoRequire -and
    @($bridgeResult.exposedBridgeKeys).Count -eq 1 -and
    $bridgeResult.exposedBridgeKeys[0] -eq 'health' -and
    $bridgeResult.typedHealthStatus -eq 200 -and
    $bridgeResult.typedHealthProtocolVersion -eq 1 -and
    $bridgeResult.bridgeInvocationCount -eq 1 -and
    $bridgeResult.rendererToMainArgumentCount -eq 0 -and
    $bridgeResult.untrustedSenderRejected -and
    -not $bridgeResult.tokenPresentInRendererSnapshot -and
    -not $bridgeResult.tokenPresentInConsoleMessages -and
    -not $bridgeResult.tokenPresentInArguments -and
    -not $bridgeResult.tokenPresentInServiceArguments -and
    -not $bridgeResult.tokenPresentInReadinessOrServiceOutput -and
    $bridgeResult.realServiceAddress -eq '127.0.0.1' -and
    $bridgeResult.realServiceDatabaseCreated -and
    $bridgeResult.realServiceMediaDirectoryCreated -and
    $bridgeResult.realServiceExitCode -eq 0 -and
    $bridgeResult.apiAcceptance.passed -and
    $bridgeResult.apiAcceptance.checkCount -ge 40 -and
    @($bridgeResult.apiAcceptance.migrationVersions).Count -eq 4 -and
    $bridgeResult.apiAcceptance.bootstrapProtected -and
    $bridgeResult.apiAcceptance.csrfAndDeduplicationPassed -and
    $bridgeResult.apiAcceptance.organizationIsolationPassed -and
    $bridgeResult.apiAcceptance.sessionRotationAndRecoveryPassed -and
    $bridgeResult.apiAcceptance.viewerAuthorizationPassed -and
    $bridgeResult.apiAcceptance.mediaOriginalThumbnailExportDeletePassed -and
    $bridgeResult.apiAcceptance.restartPersistencePassed -and
    $bridgeResult.nativeCredentialProtection.encryptionAvailable -and
    $bridgeResult.nativeCredentialProtection.initialRoundTrip -and
    $bridgeResult.nativeCredentialProtection.initialCiphertextExcludesPlaintext -and
    $bridgeResult.nativeCredentialProtection.replacementRoundTrip -and
    $bridgeResult.nativeCredentialProtection.replacementCiphertextExcludesPlaintext -and
    $bridgeResult.nativeCredentialProtection.corruptCiphertextRejected -and
    $bridgeResult.nativeCredentialProtection.credentialDeleted -and
    $bridgeResult.serverSessionCredentialLifecyclePassed -and
    -not $bridgeResult.credentialSecretPresentOutsideMain -and
    $bridgeResult.localStorageEntryCount -eq 0 -and
    $bridgeResult.sessionStorageEntryCount -eq 0
if (-not $bridgePassed) { throw 'Packaged Electron bridge isolation acceptance checks failed' }

$credentialCrashPath = Join-Path $runnerTemp 'win003-electron-package-credential-crash.json'
$credentialRecoveryPath = Join-Path $runnerTemp 'win003-electron-package-credential-recovery.json'
$credentialCrash = Start-Process -FilePath $hostExecutable.FullName -ArgumentList @('--win003-credential-crash-output', "`"$credentialCrashPath`"") -PassThru -WindowStyle Hidden
if (-not $credentialCrash.WaitForExit(15000)) {
    Stop-Process -Id $credentialCrash.Id -Force -ErrorAction SilentlyContinue
    throw 'Packaged Electron credential crash probe exceeded 15 seconds'
}
if ($credentialCrash.ExitCode -ne 76 -or -not (Test-Path -LiteralPath $credentialCrashPath)) {
    throw "Packaged Electron credential crash probe failed with exit $($credentialCrash.ExitCode)"
}
$credentialRecovery = Start-Process -FilePath $hostExecutable.FullName -ArgumentList @('--win003-credential-recovery-input', "`"$credentialCrashPath`"", '--win003-credential-recovery-output', "`"$credentialRecoveryPath`"") -PassThru -WindowStyle Hidden
if (-not $credentialRecovery.WaitForExit(15000)) {
    Stop-Process -Id $credentialRecovery.Id -Force -ErrorAction SilentlyContinue
    throw 'Packaged Electron credential recovery probe exceeded 15 seconds'
}
if ($credentialRecovery.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $credentialRecoveryPath)) {
    throw "Packaged Electron credential recovery probe failed with exit $($credentialRecovery.ExitCode)"
}
$credentialRecoveryState = Get-Content -Raw -LiteralPath $credentialRecoveryPath | ConvertFrom-Json
$credentialCrashRecoveryPassed =
    $credentialRecoveryState.interruptedRotationDetected -and
    $credentialRecoveryState.replacementPromoted -and
    $credentialRecoveryState.revokedSessionDeleted -and
    $credentialRecoveryState.signOutRetainedHiveData -and
    $credentialRecoveryState.keepDataPreservedProtectedRootAndHiveData -and
    $credentialRecoveryState.removeAllDeletedCredentialAndHiveData
if (-not $credentialCrashRecoveryPassed) { throw 'Packaged Electron credential crash/recovery acceptance failed' }

$crashProbePath = Join-Path $runnerTemp 'win003-electron-package-crash-probe.json'
$duplicateProbePath = Join-Path $runnerTemp 'win003-electron-package-duplicate-probe.json'
$crashProbe = Start-Process -FilePath $hostExecutable.FullName -ArgumentList @('--win003-crash-probe-output', "`"$crashProbePath`"") -PassThru -WindowStyle Hidden
$crashDeadline = [DateTimeOffset]::UtcNow.AddSeconds(15)
while (-not $crashProbe.HasExited -and -not (Test-Path -LiteralPath $crashProbePath) -and [DateTimeOffset]::UtcNow -lt $crashDeadline) {
    Start-Sleep -Milliseconds 50
    $crashProbe.Refresh()
}
if (-not (Test-Path -LiteralPath $crashProbePath)) {
    Stop-Process -Id $crashProbe.Id -Force -ErrorAction SilentlyContinue
    throw 'Packaged Electron crash probe did not become ready'
}
$crashState = Get-Content -Raw -LiteralPath $crashProbePath | ConvertFrom-Json
$duplicateProbe = Start-Process -FilePath $hostExecutable.FullName -ArgumentList @('--win003-probe-output', "`"$duplicateProbePath`"") -PassThru -WindowStyle Hidden
if (-not $duplicateProbe.WaitForExit(10000)) {
    Stop-Process -Id $duplicateProbe.Id -Force -ErrorAction SilentlyContinue
    throw 'Packaged Electron duplicate instance did not exit'
}
$singleInstancePassed = -not (Test-Path -LiteralPath $duplicateProbePath)
Stop-Process -Id ([int] $crashState.hostProcessId) -Force -ErrorAction Stop
$serviceExitedAfterHostCrash = $false
foreach ($attempt in 1..100) {
    if (-not (Get-Process -Id ([int] $crashState.serviceProcessId) -ErrorAction SilentlyContinue)) {
        $serviceExitedAfterHostCrash = $true
        break
    }
    Start-Sleep -Milliseconds 100
}
$readyFileRemovedAfterHostCrash = -not (Test-Path -LiteralPath ([string] $crashState.serviceReadyFile))
$crashLab = [IO.Path]::GetFullPath((Split-Path -Parent ([string] $crashState.serviceReadyFile)))
$windowsTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
if (-not $crashLab.StartsWith($windowsTemp, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Packaged Electron crash probe escaped the Windows temporary directory'
}
if (-not $singleInstancePassed -or -not $serviceExitedAfterHostCrash) {
    Stop-Process -Id ([int] $crashState.serviceProcessId) -Force -ErrorAction SilentlyContinue
    throw "Packaged Electron single-instance or parent-death acceptance failed (singleInstance=$singleInstancePassed, serviceExited=$serviceExitedAfterHostCrash, readyFileRemoved=$readyFileRemovedAfterHostCrash)"
}
$recoveryProbePath = Join-Path $runnerTemp 'win003-electron-package-recovery-probe.json'
$recoveryProbe = Start-Process -FilePath $hostExecutable.FullName -ArgumentList @('--win003-recovery-probe-input', "`"$crashProbePath`"", '--win003-recovery-probe-output', "`"$recoveryProbePath`"") -PassThru -WindowStyle Hidden
if (-not $recoveryProbe.WaitForExit(15000)) {
    Stop-Process -Id $recoveryProbe.Id -Force -ErrorAction SilentlyContinue
    throw 'Packaged Electron stale-readiness recovery probe exceeded 15 seconds'
}
if ($recoveryProbe.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $recoveryProbePath)) {
    throw 'Packaged Electron stale-readiness recovery probe failed'
}
$recoveryState = Get-Content -Raw -LiteralPath $recoveryProbePath | ConvertFrom-Json
$staleReadinessRecoveryPassed =
    $recoveryState.staleReadinessRemovedBeforeRestart -and
    $recoveryState.readinessReplacedForRecoveredService -and
    $recoveryState.recoveredServiceExitCode -eq 0 -and
    $recoveryState.readyFileRemovedAfterRecoveryShutdown
if (-not $staleReadinessRecoveryPassed) { throw 'Packaged Electron stale-readiness recovery acceptance failed' }

$runs = @()
foreach ($run in 1..5) {
    $readyPath = Join-Path $runnerTemp "win003-electron-ready-$run.json"
    $env:WIN003_READY_FILE = $readyPath
    $started = [System.Diagnostics.Stopwatch]::StartNew()
    $process = Start-Process -FilePath $hostExecutable.FullName -PassThru -WindowStyle Hidden
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(15)
    while (-not $process.HasExited -and -not (Test-Path -LiteralPath $readyPath) -and [DateTimeOffset]::UtcNow -lt $deadline) {
        Start-Sleep -Milliseconds 25
        $process.Refresh()
    }
    $readyMs = if (Test-Path -LiteralPath $readyPath) { $started.ElapsedMilliseconds } else { $null }
    Start-Sleep -Milliseconds 750
    $ids = Get-DescendantProcessIds -RootId $process.Id
    $processes = @(Get-Process -Id $ids -ErrorAction SilentlyContinue)
    $runs += [pscustomobject]@{
        run = $run
        rendererReadyMs = $readyMs
        processCount = $processes.Count
        workingSetMiB = [math]::Round((($processes | Measure-Object WorkingSet64 -Sum).Sum) / 1MB, 1)
        privateMiB = [math]::Round((($processes | Measure-Object PrivateMemorySize64 -Sum).Sum) / 1MB, 1)
    }
    Get-Process -Id ($ids | Sort-Object -Descending) -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    $process.WaitForExit(5000) | Out-Null
    if ($null -eq $readyMs) { throw "Electron renderer did not become ready on run $run" }
}
Remove-Item Env:\WIN003_READY_FILE -ErrorAction SilentlyContinue

$packageFiles = Get-ChildItem -LiteralPath $packageDirectory.FullName -Recurse -File
$measurement = [ordered]@{
    measuredAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    sourceCommit = $env:GITHUB_SHA
    runnerImage = $env:ImageOS
    runnerImageVersion = $env:ImageVersion
    researchVersion = $ResearchVersion
    electronVersion = $probeResult.electron
    bundledNodeVersion = $probeResult.node
    electronForgeVersion = (Get-Content -Raw -LiteralPath (Join-Path $labPath 'node_modules/@electron-forge/cli/package.json') | ConvertFrom-Json).version
    webBundleBytes = (Get-ChildItem -LiteralPath (Join-Path $labPath 'web') -Recurse -File | Measure-Object Length -Sum).Sum
    packageDirectoryBytes = ($packageFiles | Measure-Object Length -Sum).Sum
    packageFileCount = $packageFiles.Count
    hostExecutableBytes = $hostExecutable.Length
    setupBytes = $installer.Length
    setupSha256 = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash
    fullNupkgBytes = $nupkg.Length
    fullNupkgSha256 = (Get-FileHash -LiteralPath $nupkg.FullName -Algorithm SHA256).Hash
    signingMode = if ($env:WINDOWS_CERTIFICATE_FILE) { 'ephemeral-test-signing' } else { 'unsigned' }
    hostSignatureStatus = [string] $hostSignature.Status
    hostSignatureSubject = if ($hostSignature.SignerCertificate) { $hostSignature.SignerCertificate.Subject } else { $null }
    hostSignatureThumbprint = if ($hostSignature.SignerCertificate) { $hostSignature.SignerCertificate.Thumbprint } else { $null }
    setupSignatureStatus = [string] $setupSignature.Status
    setupSignatureSubject = if ($setupSignature.SignerCertificate) { $setupSignature.SignerCertificate.Subject } else { $null }
    setupSignatureThumbprint = if ($setupSignature.SignerCertificate) { $setupSignature.SignerCertificate.Thumbprint } else { $null }
    packagedNodeSqliteProbe = $probeResult.sqlite
    packagedRealServerBytes = (Get-ChildItem -LiteralPath $packagedServer -Recurse -File | Measure-Object Length -Sum).Sum
    packagedRealServerFileCount = @(Get-ChildItem -LiteralPath $packagedServer -Recurse -File).Count
    packagedBridgeIsolationPassed = $bridgePassed
    bridgeSurfaceKeys = @($bridgeResult.exposedBridgeKeys)
    bridgeRendererToMainArgumentCount = $bridgeResult.rendererToMainArgumentCount
    bridgeUntrustedSenderRejected = $bridgeResult.untrustedSenderRejected
    bridgeTokenPresentInRendererStorageGlobalsConsoleOrArguments =
        $bridgeResult.tokenPresentInRendererSnapshot -or
        $bridgeResult.tokenPresentInConsoleMessages -or
        $bridgeResult.tokenPresentInArguments -or
        $bridgeResult.tokenPresentInServiceArguments -or
        $bridgeResult.tokenPresentInReadinessOrServiceOutput
    bridgeRealServiceAddress = $bridgeResult.realServiceAddress
    bridgeRealServiceDatabaseCreated = $bridgeResult.realServiceDatabaseCreated
    bridgeRealServiceMediaDirectoryCreated = $bridgeResult.realServiceMediaDirectoryCreated
    bridgeRealServiceExitCode = $bridgeResult.realServiceExitCode
    packagedApiAcceptancePassed = $bridgeResult.apiAcceptance.passed
    packagedApiAcceptanceCheckCount = $bridgeResult.apiAcceptance.checkCount
    packagedApiAcceptanceMigrationVersions = @($bridgeResult.apiAcceptance.migrationVersions)
    packagedApiOrganizationIsolationPassed = $bridgeResult.apiAcceptance.organizationIsolationPassed
    packagedApiMediaLifecyclePassed = $bridgeResult.apiAcceptance.mediaOriginalThumbnailExportDeletePassed
    packagedApiRestartPersistencePassed = $bridgeResult.apiAcceptance.restartPersistencePassed
    packagedNativeCredentialProtectionPassed =
        $bridgeResult.nativeCredentialProtection.encryptionAvailable -and
        $bridgeResult.nativeCredentialProtection.initialRoundTrip -and
        $bridgeResult.nativeCredentialProtection.initialCiphertextExcludesPlaintext -and
        $bridgeResult.nativeCredentialProtection.replacementRoundTrip -and
        $bridgeResult.nativeCredentialProtection.replacementCiphertextExcludesPlaintext -and
        $bridgeResult.nativeCredentialProtection.corruptCiphertextRejected -and
        $bridgeResult.nativeCredentialProtection.credentialDeleted -and
        $bridgeResult.serverSessionCredentialLifecyclePassed -and
        -not $bridgeResult.credentialSecretPresentOutsideMain
    packagedServerSessionCredentialLifecyclePassed = $bridgeResult.serverSessionCredentialLifecyclePassed
    packagedCredentialCrashRecoveryPassed = $credentialCrashRecoveryPassed
    packagedSingleInstancePassed = $singleInstancePassed
    packagedServiceExitedAfterHostCrash = $serviceExitedAfterHostCrash
    packagedReadyFileRemovedAfterHostCrash = $readyFileRemovedAfterHostCrash
    packagedStaleReadinessRecoveryPassed = $staleReadinessRecoveryPassed
    runs = $runs
    meanRendererReadyMs = [math]::Round(($runs.rendererReadyMs | Measure-Object -Average).Average, 1)
    medianRendererReadyMs = ($runs.rendererReadyMs | Sort-Object)[2]
    meanWorkingSetMiB = [math]::Round(($runs.workingSetMiB | Measure-Object -Average).Average, 1)
    meanPrivateMiB = [math]::Round(($runs.privateMiB | Measure-Object -Average).Average, 1)
    limitations = @(
        $(if ($env:WINDOWS_CERTIFICATE_FILE) { 'Ephemeral self-signed research identity; not a production trust chain or release artifact' } else { 'Unsigned research build; not a release artifact' }),
        'Hosted Windows runner, not a retail family computer',
        'Real packaged API/auth/org-isolation/media/export/restart lifecycle exercised; historical and failed migration transitions remain open',
        $(if ($readyFileRemovedAfterHostCrash) { 'Forced host termination removed readiness state' } else { 'Forced host termination left stale readiness state; the next host rejected, replaced, and removed it during verified recovery' }),
        'Warm filesystem/runtime effects after the first launch'
    )
}

$measurement | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputPath 'measurement.json') -Encoding utf8NoBOM
Copy-Item -LiteralPath $installer.FullName -Destination (Join-Path $outputPath 'electron-research-setup.exe')
Copy-Item -LiteralPath $nupkg.FullName -Destination (Join-Path $outputPath $nupkg.Name)
Copy-Item -LiteralPath $releases -Destination (Join-Path $outputPath 'RELEASES')
Copy-Item -LiteralPath (Join-Path $labPath 'package-lock.json') -Destination (Join-Path $outputPath 'package-lock.json')

$measurement | ConvertTo-Json -Depth 8
