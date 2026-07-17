[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $WebDist,

    [Parameter(Mandatory)]
    [string] $IconPath,

    [Parameter(Mandatory)]
    [string] $OutputDirectory
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# WIN-003 research automation only. This script creates the framework prototype in
# the hosted runner's temporary directory. It must not create a product application
# scaffold in the checked-out repository or publish a release artifact.

$webDistPath = (Resolve-Path -LiteralPath $WebDist).Path
$iconPathResolved = (Resolve-Path -LiteralPath $IconPath).Path
$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
$runnerTemp = if ($env:RUNNER_TEMP) {
    [System.IO.Path]::GetFullPath($env:RUNNER_TEMP)
} else {
    [System.IO.Path]::GetTempPath()
}

if (-not $outputPath.StartsWith($runnerTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Research output must remain under the runner temporary directory: $runnerTemp"
}

$labPath = Join-Path $runnerTemp 'apiarylens-win003-tauri-lab'
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
New-Item -ItemType Directory -Force -Path (Join-Path $labPath 'src-tauri/src') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $labPath 'src-tauri/binaries') | Out-Null

Copy-Item -Path (Join-Path $webDistPath '*') -Destination (Join-Path $labPath 'web') -Recurse -Force

$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
$sidecarName = 'apiarylens-node-sidecar-x86_64-pc-windows-msvc.exe'
$sidecarPath = Join-Path $labPath "src-tauri/binaries/$sidecarName"
Copy-Item -LiteralPath $nodeExecutable -Destination $sidecarPath -Force

$packageJson = @'
{
  "name": "apiarylens-win003-tauri-lab",
  "version": "0.0.0",
  "private": true,
  "license": "UNLICENSED",
  "devDependencies": {
    "@tauri-apps/cli": "2.11.4"
  }
}
'@

$cargoToml = @'
[package]
name = "apiarylens_win003_tauri"
version = "0.0.0"
edition = "2021"
publish = false

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
'@

$buildRs = @'
fn main() {
    tauri_build::build()
}
'@

$mainRs = @'
fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("WIN-003 Tauri research host failed");
}
'@

$tauriConfig = @'
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "ApiaryLens WIN-003 Research",
  "version": "0.0.0",
  "identifier": "org.apiarylens.research.win003",
  "build": {
    "frontendDist": "../web"
  },
  "app": {
    "windows": [
      {
        "title": "ApiaryLens WIN-003 Research",
        "width": 1280,
        "height": 800,
        "visible": false
      }
    ],
    "security": {
      "csp": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' https: http://127.0.0.1:* ws://127.0.0.1:*"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "externalBin": ["binaries/apiarylens-node-sidecar"],
    "windows": {
      "webviewInstallMode": {
        "type": "downloadBootstrapper"
      }
    }
  }
}
'@

if ($env:WIN003_CERT_THUMBPRINT) {
    $configObject = $tauriConfig | ConvertFrom-Json
    $configObject.bundle.windows | Add-Member -NotePropertyName certificateThumbprint -NotePropertyValue $env:WIN003_CERT_THUMBPRINT
    $configObject.bundle.windows | Add-Member -NotePropertyName digestAlgorithm -NotePropertyValue 'sha256'
    $tauriConfig = $configObject | ConvertTo-Json -Depth 12
}

Set-Content -LiteralPath (Join-Path $labPath 'package.json') -Value $packageJson -Encoding utf8NoBOM
Set-Content -LiteralPath (Join-Path $labPath 'src-tauri/Cargo.toml') -Value $cargoToml -Encoding utf8NoBOM
Set-Content -LiteralPath (Join-Path $labPath 'src-tauri/build.rs') -Value $buildRs -Encoding utf8NoBOM
Set-Content -LiteralPath (Join-Path $labPath 'src-tauri/src/main.rs') -Value $mainRs -Encoding utf8NoBOM
Set-Content -LiteralPath (Join-Path $labPath 'src-tauri/tauri.conf.json') -Value $tauriConfig -Encoding utf8NoBOM

Push-Location $labPath
try {
    pnpm install --frozen-lockfile=false
    if ($LASTEXITCODE -ne 0) { throw "Tauri lab dependency install failed with exit code $LASTEXITCODE" }

    pnpm exec tauri icon $iconPathResolved --output (Join-Path $labPath 'src-tauri/icons')
    if ($LASTEXITCODE -ne 0) { throw "Tauri icon generation failed with exit code $LASTEXITCODE" }

    pnpm exec tauri build --bundles nsis
    if ($LASTEXITCODE -ne 0) { throw "Tauri build failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

$releasePath = Join-Path $labPath 'src-tauri/target/release'
$hostExecutable = Join-Path $releasePath 'apiarylens_win003_tauri.exe'
$installer = Get-ChildItem -LiteralPath (Join-Path $releasePath 'bundle/nsis') -Filter '*setup.exe' | Select-Object -First 1
if (-not (Test-Path -LiteralPath $hostExecutable)) { throw "Tauri host executable not found: $hostExecutable" }
if (-not $installer) { throw 'Tauri NSIS installer was not generated' }

$hostSignature = Get-AuthenticodeSignature -LiteralPath $hostExecutable
$installerSignature = Get-AuthenticodeSignature -LiteralPath $installer.FullName
if ($env:WIN003_CERT_THUMBPRINT -and (
    -not $installerSignature.SignerCertificate -or
    $installerSignature.SignerCertificate.Thumbprint -ne $env:WIN003_CERT_THUMBPRINT
)) {
    $hostThumbprint = if ($hostSignature.SignerCertificate) { $hostSignature.SignerCertificate.Thumbprint } else { '<none>' }
    $installerThumbprint = if ($installerSignature.SignerCertificate) { $installerSignature.SignerCertificate.Thumbprint } else { '<none>' }
    throw "Tauri installer signature mismatch: expected $env:WIN003_CERT_THUMBPRINT; loose host $hostThumbprint ($($hostSignature.Status)); installer $installerThumbprint ($($installerSignature.Status))"
}

$sqliteProbe = & $sidecarPath -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(':memory:'); db.exec('create table probe(value text)'); db.close(); process.stdout.write('node-sqlite-ok')"
if ($LASTEXITCODE -ne 0 -or $sqliteProbe -ne 'node-sqlite-ok') {
    throw "Packaged Node sidecar sqlite probe failed: $sqliteProbe"
}

function Get-DescendantProcessIds {
    param([int] $RootId)

    $all = @(Get-CimInstance Win32_Process)
    $ids = [System.Collections.Generic.HashSet[int]]::new()
    [void] $ids.Add($RootId)
    do {
        $added = $false
        foreach ($process in $all) {
            if ($ids.Contains([int] $process.ParentProcessId) -and -not $ids.Contains([int] $process.ProcessId)) {
                [void] $ids.Add([int] $process.ProcessId)
                $added = $true
            }
        }
    } while ($added)
    return @($ids)
}

$runs = @()
foreach ($run in 1..5) {
    $started = [System.Diagnostics.Stopwatch]::StartNew()
    $process = Start-Process -FilePath $hostExecutable -PassThru -WindowStyle Hidden
    $webViewReadyMs = $null
    $peakWorkingSet = 0L
    $peakPrivate = 0L
    $peakCount = 0

    try {
        $deadline = [DateTimeOffset]::UtcNow.AddSeconds(15)
        while (-not $process.HasExited -and [DateTimeOffset]::UtcNow -lt $deadline) {
            $ids = Get-DescendantProcessIds -RootId $process.Id
            $processes = @(Get-Process -Id $ids -ErrorAction SilentlyContinue)
            $workingSet = ($processes | Measure-Object WorkingSet64 -Sum).Sum
            $private = ($processes | Measure-Object PrivateMemorySize64 -Sum).Sum
            if ($workingSet -gt $peakWorkingSet) { $peakWorkingSet = $workingSet }
            if ($private -gt $peakPrivate) { $peakPrivate = $private }
            if ($processes.Count -gt $peakCount) { $peakCount = $processes.Count }

            if ($null -eq $webViewReadyMs) {
                $hasWebView = $processes | Where-Object { $_.ProcessName -eq 'msedgewebview2' }
                if ($hasWebView) { $webViewReadyMs = $started.ElapsedMilliseconds }
            }

            if ($null -ne $webViewReadyMs -and $started.ElapsedMilliseconds -ge ($webViewReadyMs + 1500)) { break }
            Start-Sleep -Milliseconds 50
            $process.Refresh()
        }
    } finally {
        $ids = Get-DescendantProcessIds -RootId $process.Id
        Get-Process -Id ($ids | Sort-Object -Descending) -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        $process.WaitForExit(5000) | Out-Null
    }

    $runs += [pscustomobject]@{
        run = $run
        webViewProcessReadyMs = $webViewReadyMs
        peakProcessCount = $peakCount
        peakWorkingSetMiB = [math]::Round($peakWorkingSet / 1MB, 1)
        peakPrivateMiB = [math]::Round($peakPrivate / 1MB, 1)
    }
}

$releaseFiles = Get-ChildItem -LiteralPath $releasePath -File
$measurement = [ordered]@{
    measuredAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    sourceCommit = $env:GITHUB_SHA
    runnerImage = $env:ImageOS
    runnerImageVersion = $env:ImageVersion
    nodeVersion = (& node --version)
    rustVersion = (& rustc --version)
    cargoVersion = (& cargo --version)
    tauriCliVersion = (& pnpm --dir $labPath exec tauri --version)
    webBundleBytes = (Get-ChildItem -LiteralPath (Join-Path $labPath 'web') -Recurse -File | Measure-Object Length -Sum).Sum
    nodeSidecarBytes = (Get-Item -LiteralPath $sidecarPath).Length
    nodeSqliteProbe = $sqliteProbe
    hostExecutableBytes = (Get-Item -LiteralPath $hostExecutable).Length
    nsisInstallerBytes = $installer.Length
    nsisInstallerSha256 = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash
    signingMode = if ($env:WIN003_CERT_THUMBPRINT) { 'ephemeral-test-signing' } else { 'unsigned' }
    hostSignatureStatus = [string] $hostSignature.Status
    hostSignatureSubject = if ($hostSignature.SignerCertificate) { $hostSignature.SignerCertificate.Subject } else { $null }
    hostSignatureThumbprint = if ($hostSignature.SignerCertificate) { $hostSignature.SignerCertificate.Thumbprint } else { $null }
    installerSignatureStatus = [string] $installerSignature.Status
    installerSignatureSubject = if ($installerSignature.SignerCertificate) { $installerSignature.SignerCertificate.Subject } else { $null }
    installerSignatureThumbprint = if ($installerSignature.SignerCertificate) { $installerSignature.SignerCertificate.Thumbprint } else { $null }
    releaseLooseFileBytes = ($releaseFiles | Measure-Object Length -Sum).Sum
    releaseLooseFileCount = $releaseFiles.Count
    runs = $runs
    meanWebViewProcessReadyMs = [math]::Round(($runs.webViewProcessReadyMs | Measure-Object -Average).Average, 1)
    medianWebViewProcessReadyMs = ($runs.webViewProcessReadyMs | Sort-Object)[2]
    meanPeakWorkingSetMiB = [math]::Round(($runs.peakWorkingSetMiB | Measure-Object -Average).Average, 1)
    meanPeakPrivateMiB = [math]::Round(($runs.peakPrivateMiB | Measure-Object -Average).Average, 1)
    limitations = @(
        $(if ($env:WIN003_CERT_THUMBPRINT) { 'Ephemeral self-signed research identity; not a production trust chain or release artifact' } else { 'Unsigned research build; not a release artifact' }),
        'WebView process creation is a startup proxy, not a DOM-ready event',
        'Hosted runner has a warm shared WebView2 runtime',
        'Installer was built but not installed in this pass',
        'Node sidecar sqlite was probed directly; authenticated IPC and supervision belong to WIN-004'
    )
}

$measurement | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputPath 'measurement.json') -Encoding utf8NoBOM
Copy-Item -LiteralPath (Join-Path $labPath 'src-tauri/Cargo.lock') -Destination (Join-Path $outputPath 'Cargo.lock')
Copy-Item -LiteralPath (Join-Path $labPath 'pnpm-lock.yaml') -Destination (Join-Path $outputPath 'pnpm-lock.yaml')
Copy-Item -LiteralPath $installer.FullName -Destination (Join-Path $outputPath 'tauri-research-setup.exe')

$measurement | ConvertTo-Json -Depth 8
