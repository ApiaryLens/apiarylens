[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $EvidenceDirectory,

    [Parameter(Mandatory)]
    [string] $OutputDirectory
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# WIN-003 research automation only. This probe consumes the exact artifact built by
# the preceding job, performs a current-user install in a fresh hosted runner, and
# removes it. It does not publish or bless the unsigned artifact.

$evidencePath = (Resolve-Path -LiteralPath $EvidenceDirectory).Path
$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
$runnerTemp = [System.IO.Path]::GetFullPath($env:RUNNER_TEMP)
if (-not $outputPath.StartsWith($runnerTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Lifecycle evidence must remain under the runner temporary directory: $runnerTemp"
}
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$measurementPath = Join-Path $evidencePath 'measurement.json'
$installerPath = Join-Path $evidencePath 'tauri-research-setup.exe'
$buildMeasurement = Get-Content -Raw -LiteralPath $measurementPath | ConvertFrom-Json
if (-not (Test-Path -LiteralPath $installerPath)) { throw "Research installer not found: $installerPath" }

$actualHash = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash
if ($actualHash -ne $buildMeasurement.nsisInstallerSha256) {
    throw "Research installer hash mismatch. Expected $($buildMeasurement.nsisInstallerSha256); got $actualHash"
}

$originalPath = $env:PATH
$env:PATH = @(
    "$env:SystemRoot\System32",
    "$env:SystemRoot",
    "$env:SystemRoot\System32\WindowsPowerShell\v1.0"
) -join ';'
$externalNodeAvailable = $null -ne (Get-Command node.exe -ErrorAction SilentlyContinue)
$externalRustAvailable = $null -ne (Get-Command rustc.exe -ErrorAction SilentlyContinue)
$externalDotNetAvailable = $null -ne (Get-Command dotnet.exe -ErrorAction SilentlyContinue)

function Get-UninstallEntry {
    $roots = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    return Get-ItemProperty -Path $roots -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -eq 'ApiaryLens WIN-003 Research' } |
        Select-Object -First 1
}

function Get-CommandExecutable {
    param([Parameter(Mandatory)][string] $CommandLine)
    if ($CommandLine -match '^\s*"([^"]+)"') { return $Matches[1] }
    return ($CommandLine -split '\s+', 2)[0]
}

$install = Start-Process -FilePath $installerPath -ArgumentList '/S' -PassThru -Wait -WindowStyle Hidden
if ($install.ExitCode -ne 0) { throw "Silent research install failed with exit code $($install.ExitCode)" }

$entry = $null
foreach ($attempt in 1..20) {
    $entry = Get-UninstallEntry
    if ($entry) { break }
    Start-Sleep -Milliseconds 250
}
if (-not $entry) { throw 'Research installation did not register an uninstall entry' }

$quietUninstall = if ($entry.PSObject.Properties.Name -contains 'QuietUninstallString') { $entry.QuietUninstallString } else { $null }
$uninstallCommand = if ($quietUninstall) { $quietUninstall } else { $entry.UninstallString }
if (-not $uninstallCommand) { throw 'Research installation has no uninstall command' }
$uninstallExecutable = Get-CommandExecutable -CommandLine $uninstallCommand
$registeredInstallLocation = if ($entry.PSObject.Properties.Name -contains 'InstallLocation') { $entry.InstallLocation } else { $null }
$installDirectory = if ($registeredInstallLocation) {
    $registeredInstallLocation.TrimEnd([char]'\')
} else {
    Split-Path -Parent $uninstallExecutable
}
if (-not (Test-Path -LiteralPath $installDirectory)) { throw "Installed directory not found: $installDirectory" }

$displayIcon = if ($entry.PSObject.Properties.Name -contains 'DisplayIcon') { $entry.DisplayIcon } else { $null }
$displayIconPath = if ($displayIcon) { ($displayIcon -replace ',\d+$', '').Trim('"') } else { $null }
$installedHost = if ($displayIconPath -and (Test-Path -LiteralPath $displayIconPath)) {
    Get-Item -LiteralPath $displayIconPath
} else {
    Get-ChildItem -LiteralPath $installDirectory -Recurse -Filter '*.exe' |
        Where-Object { $_.Name -notmatch '^(uninstall|apiarylens-node-sidecar)' } |
        Select-Object -First 1
}
$installedSidecar = Get-ChildItem -LiteralPath $installDirectory -Recurse -Filter 'apiarylens-node-sidecar*.exe' | Select-Object -First 1
if (-not $installedHost) { throw 'Installed Tauri host executable not found' }
if (-not $installedSidecar) { throw 'Installed packaged Node sidecar not found' }

$sqliteProbe = & $installedSidecar.FullName -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(':memory:'); db.exec('create table probe(value text)'); db.close(); process.stdout.write('installed-node-sqlite-ok')"
if ($LASTEXITCODE -ne 0 -or $sqliteProbe -ne 'installed-node-sqlite-ok') {
    throw "Installed packaged Node sidecar sqlite probe failed: $sqliteProbe"
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
    $process = Start-Process -FilePath $installedHost.FullName -PassThru -WindowStyle Hidden
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

$installedFiles = Get-ChildItem -LiteralPath $installDirectory -Recurse -File
$installedBytes = ($installedFiles | Measure-Object Length -Sum).Sum
$installedFileCount = $installedFiles.Count

$uninstall = Start-Process -FilePath $uninstallExecutable -ArgumentList '/S' -PassThru -Wait -WindowStyle Hidden
if ($uninstall.ExitCode -ne 0) { throw "Silent research uninstall failed with exit code $($uninstall.ExitCode)" }
foreach ($attempt in 1..20) {
    if (-not (Test-Path -LiteralPath $installDirectory) -and -not (Get-UninstallEntry)) { break }
    Start-Sleep -Milliseconds 250
}
$installDirectoryRemains = Test-Path -LiteralPath $installDirectory
$uninstallEntryRemains = $null -ne (Get-UninstallEntry)

$result = [ordered]@{
    measuredAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    sourceCommit = $env:GITHUB_SHA
    sourceRunId = $env:GITHUB_RUN_ID
    artifactSha256 = $actualHash
    restrictedPath = $env:PATH
    externalNodeAvailable = $externalNodeAvailable
    externalRustAvailable = $externalRustAvailable
    externalDotNetAvailable = $externalDotNetAvailable
    installExitCode = $install.ExitCode
    installDirectory = $installDirectory
    installedBytes = $installedBytes
    installedFileCount = $installedFileCount
    installedHostBytes = $installedHost.Length
    installedNodeSidecarBytes = $installedSidecar.Length
    installedNodeSqliteProbe = $sqliteProbe
    runs = $runs
    meanWebViewProcessReadyMs = [math]::Round(($runs.webViewProcessReadyMs | Measure-Object -Average).Average, 1)
    medianWebViewProcessReadyMs = ($runs.webViewProcessReadyMs | Sort-Object)[2]
    meanPeakWorkingSetMiB = [math]::Round(($runs.peakWorkingSetMiB | Measure-Object -Average).Average, 1)
    meanPeakPrivateMiB = [math]::Round(($runs.peakPrivateMiB | Measure-Object -Average).Average, 1)
    uninstallExitCode = $uninstall.ExitCode
    installDirectoryRemains = $installDirectoryRemains
    uninstallEntryRemains = $uninstallEntryRemains
    limitations = @(
        'Fresh hosted runner profile, not a retail Windows image',
        'Unsigned research artifact',
        'WebView2 was already present on the runner',
        'No real ApiaryLens local service or user data was installed',
        'WebView process creation is a startup proxy, not a DOM-ready event'
    )
}

$env:PATH = $originalPath
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputPath 'lifecycle.json') -Encoding utf8NoBOM
$result | ConvertTo-Json -Depth 8

if ($installDirectoryRemains -or $uninstallEntryRemains) {
    throw 'Research uninstall left the install directory or uninstall registration behind'
}
