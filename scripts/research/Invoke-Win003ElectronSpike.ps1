[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $WebDist,

    [Parameter(Mandatory)]
    [string] $OutputDirectory
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

$forgeConfig = @'
module.exports = {
  packagerConfig: {
    asar: true,
    executableName: "ApiaryLensElectronResearch"
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

$main = @'
const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

if (require("electron-squirrel-startup")) app.quit();

function sqliteProbe() {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(":memory:");
  db.exec("create table probe(value text)");
  db.close();
  return "electron-node-sqlite-ok";
}

const probeIndex = process.argv.indexOf("--win003-probe-output");
if (probeIndex >= 0) {
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
    window.loadFile(path.join(__dirname, "web", "index.html"));
  });
}

app.on("window-all-closed", () => app.quit());
'@

Set-Content -LiteralPath (Join-Path $labPath 'package.json') -Value $packageJson -Encoding utf8NoBOM
Set-Content -LiteralPath (Join-Path $labPath 'forge.config.js') -Value $forgeConfig -Encoding utf8NoBOM
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
    packagedNodeSqliteProbe = $probeResult.sqlite
    runs = $runs
    meanRendererReadyMs = [math]::Round(($runs.rendererReadyMs | Measure-Object -Average).Average, 1)
    medianRendererReadyMs = ($runs.rendererReadyMs | Sort-Object)[2]
    meanWorkingSetMiB = [math]::Round(($runs.workingSetMiB | Measure-Object -Average).Average, 1)
    meanPrivateMiB = [math]::Round(($runs.privateMiB | Measure-Object -Average).Average, 1)
    limitations = @(
        'Unsigned research build; not a release artifact',
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
