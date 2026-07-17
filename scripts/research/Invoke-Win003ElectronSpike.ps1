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
const { app, BrowserWindow, ipcMain } = require("electron");

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

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function startRealService(reuseLab = false) {
  if (!reuseLab) {
    serviceLab = fs.mkdtempSync(path.join(os.tmpdir(), "apiarylens-win003-electron-service-"));
  }
  const readyFile = path.join(serviceLab, "ready.json");
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

const probeIndex = process.argv.indexOf("--win003-probe-output");
const bridgeProbeIndex = process.argv.indexOf("--win003-bridge-output");
const crashProbeIndex = process.argv.indexOf("--win003-crash-probe-output");
if (!hasSingleInstanceLock) {
  // The primary instance owns all application and embedded-service work.
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
    const apiAcceptance = await acceptanceModule.runApiAcceptance({
      endpoint: serviceEndpoint,
      controlToken,
      allowedOrigin,
      bootstrapToken,
      migrationVersions: serviceReady.migrationVersions,
      restartService: restartRealService
    });
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
    $bridgeResult.localStorageEntryCount -eq 0 -and
    $bridgeResult.sessionStorageEntryCount -eq 0
if (-not $bridgePassed) { throw 'Packaged Electron bridge isolation acceptance checks failed' }

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
if (-not $crashLab.StartsWith($runnerTemp, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Packaged Electron crash probe escaped the runner temporary directory'
}
if (-not $singleInstancePassed -or -not $serviceExitedAfterHostCrash) {
    Stop-Process -Id ([int] $crashState.serviceProcessId) -Force -ErrorAction SilentlyContinue
    throw "Packaged Electron single-instance or parent-death acceptance failed (singleInstance=$singleInstancePassed, serviceExited=$serviceExitedAfterHostCrash, readyFileRemoved=$readyFileRemovedAfterHostCrash)"
}
Remove-Item -LiteralPath $crashLab -Recurse -Force -ErrorAction SilentlyContinue

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
    packagedSingleInstancePassed = $singleInstancePassed
    packagedServiceExitedAfterHostCrash = $serviceExitedAfterHostCrash
    packagedReadyFileRemovedAfterHostCrash = $readyFileRemovedAfterHostCrash
    runs = $runs
    meanRendererReadyMs = [math]::Round(($runs.rendererReadyMs | Measure-Object -Average).Average, 1)
    medianRendererReadyMs = ($runs.rendererReadyMs | Sort-Object)[2]
    meanWorkingSetMiB = [math]::Round(($runs.workingSetMiB | Measure-Object -Average).Average, 1)
    meanPrivateMiB = [math]::Round(($runs.privateMiB | Measure-Object -Average).Average, 1)
    limitations = @(
        $(if ($env:WINDOWS_CERTIFICATE_FILE) { 'Ephemeral self-signed research identity; not a production trust chain or release artifact' } else { 'Unsigned research build; not a release artifact' }),
        'Hosted Windows runner, not a retail family computer',
        'Real packaged API/auth/org-isolation/media/export/restart lifecycle exercised; historical and failed migration transitions remain open',
        $(if ($readyFileRemovedAfterHostCrash) { 'Forced host termination removed readiness state' } else { 'Forced host termination killed the service but left stale readiness state; startup rejection and cleanup remain open' }),
        'Warm filesystem/runtime effects after the first launch'
    )
}

$measurement | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputPath 'measurement.json') -Encoding utf8NoBOM
Copy-Item -LiteralPath $installer.FullName -Destination (Join-Path $outputPath 'electron-research-setup.exe')
Copy-Item -LiteralPath $nupkg.FullName -Destination (Join-Path $outputPath $nupkg.Name)
Copy-Item -LiteralPath $releases -Destination (Join-Path $outputPath 'RELEASES')
Copy-Item -LiteralPath (Join-Path $labPath 'package-lock.json') -Destination (Join-Path $outputPath 'package-lock.json')

$measurement | ConvertTo-Json -Depth 8
