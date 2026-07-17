[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $WebDist,

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
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, ipcMain } = require("electron");

if (require("electron-squirrel-startup")) app.quit();

const indexPath = path.join(__dirname, "web", "index.html");
const trustedDocumentUrl = pathToFileURL(indexPath).toString();
const controlToken = crypto.randomBytes(32).toString("base64url");
let bridgeInvocationCount = 0;
let bridgeArgumentCount = 0;

ipcMain.handle("apiarylens:desktop-health", async (event, ...args) => {
  bridgeArgumentCount += args.length;
  if (event.senderFrame.url !== trustedDocumentUrl) throw new Error("untrusted-sender");
  bridgeInvocationCount += 1;

  // Models the main process attaching its process-scoped service credential. The
  // renderer sends no argument and receives only a typed, non-secret result.
  const attached = Buffer.from(controlToken, "utf8");
  const expected = Buffer.from(controlToken, "utf8");
  if (!crypto.timingSafeEqual(attached, expected)) throw new Error("internal-auth-failed");
  return Object.freeze({ status: 200, serviceProtocolVersion: 1 });
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
if (bridgeProbeIndex >= 0) {
  app.whenReady().then(async () => {
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
      localStorageEntryCount: rendererResult.localStorage.length,
      sessionStorageEntryCount: rendererResult.sessionStorage.length
    };
    fs.writeFileSync(process.argv[bridgeProbeIndex + 1], JSON.stringify(result));
    trustedWindow.destroy();
    untrustedWindow.destroy();
    app.quit();
  }).catch((error) => {
    console.error(`bridge-probe-failed:${error.message}`);
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

Push-Location $labPath
try {
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "Electron lab dependency install failed with exit code $LASTEXITCODE" }
    npx --no-install electron-forge make --arch=x64
    if ($LASTEXITCODE -ne 0) { throw "Electron Forge make failed with exit code $LASTEXITCODE" }
} finally {
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
if (-not $bridgeProbe.WaitForExit(15000)) {
    Stop-Process -Id $bridgeProbe.Id -Force -ErrorAction SilentlyContinue
    throw 'Packaged Electron bridge probe exceeded 15 seconds'
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
    $bridgeResult.localStorageEntryCount -eq 0 -and
    $bridgeResult.sessionStorageEntryCount -eq 0
if (-not $bridgePassed) { throw 'Packaged Electron bridge isolation acceptance checks failed' }

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
    packagedBridgeIsolationPassed = $bridgePassed
    bridgeSurfaceKeys = @($bridgeResult.exposedBridgeKeys)
    bridgeRendererToMainArgumentCount = $bridgeResult.rendererToMainArgumentCount
    bridgeUntrustedSenderRejected = $bridgeResult.untrustedSenderRejected
    bridgeTokenPresentInRendererStorageGlobalsConsoleOrArguments =
        $bridgeResult.tokenPresentInRendererSnapshot -or
        $bridgeResult.tokenPresentInConsoleMessages -or
        $bridgeResult.tokenPresentInArguments
    runs = $runs
    meanRendererReadyMs = [math]::Round(($runs.rendererReadyMs | Measure-Object -Average).Average, 1)
    medianRendererReadyMs = ($runs.rendererReadyMs | Sort-Object)[2]
    meanWorkingSetMiB = [math]::Round(($runs.workingSetMiB | Measure-Object -Average).Average, 1)
    meanPrivateMiB = [math]::Round(($runs.privateMiB | Measure-Object -Average).Average, 1)
    limitations = @(
        $(if ($env:WINDOWS_CERTIFICATE_FILE) { 'Ephemeral self-signed research identity; not a production trust chain or release artifact' } else { 'Unsigned research build; not a release artifact' }),
        'Hosted Windows runner, not a retail family computer',
        'No real embedded ApiaryLens service or user data',
        'Warm filesystem/runtime effects after the first launch'
    )
}

$measurement | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputPath 'measurement.json') -Encoding utf8NoBOM
Copy-Item -LiteralPath $installer.FullName -Destination (Join-Path $outputPath 'electron-research-setup.exe')
Copy-Item -LiteralPath $nupkg.FullName -Destination (Join-Path $outputPath $nupkg.Name)
Copy-Item -LiteralPath $releases -Destination (Join-Path $outputPath 'RELEASES')
Copy-Item -LiteralPath (Join-Path $labPath 'package-lock.json') -Destination (Join-Path $outputPath 'package-lock.json')

$measurement | ConvertTo-Json -Depth 8
