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
        Where-Object {
            $_.PSObject.Properties.Name -contains 'DisplayName' -and
            $_.DisplayName -eq 'ApiaryLens WIN-003 Research'
        } |
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
    $registeredInstallLocation.Trim().Trim('"').TrimEnd([char]'\')
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

$process = Start-Process -FilePath $installedHost.FullName -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3
$process.Refresh()
$hostStayedRunning = -not $process.HasExited
$ids = Get-DescendantProcessIds -RootId $process.Id
$processes = @(Get-Process -Id $ids -ErrorAction SilentlyContinue)
$hostSmoke = [ordered]@{
    stayedRunningForThreeSeconds = $hostStayedRunning
    processCount = $processes.Count
    workingSetMiB = [math]::Round((($processes | Measure-Object WorkingSet64 -Sum).Sum) / 1MB, 1)
    privateMiB = [math]::Round((($processes | Measure-Object PrivateMemorySize64 -Sum).Sum) / 1MB, 1)
    webViewDescendantObserved = $null -ne ($processes | Where-Object { $_.ProcessName -eq 'msedgewebview2' } | Select-Object -First 1)
}
Get-Process -Id ($ids | Sort-Object -Descending) -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
$process.WaitForExit(5000) | Out-Null
if (-not $hostStayedRunning) { throw 'Installed Tauri host exited during the three-second smoke test' }

$installedFiles = Get-ChildItem -LiteralPath $installDirectory -Recurse -File
$installedBytes = ($installedFiles | Measure-Object Length -Sum).Sum
$installedFileCount = $installedFiles.Count

$uninstall = Start-Process -FilePath $uninstallExecutable -ArgumentList '/S' -PassThru -WindowStyle Hidden
if (-not $uninstall.WaitForExit(60000)) {
    Stop-Process -Id $uninstall.Id -Force -ErrorAction SilentlyContinue
    throw 'Silent research uninstall exceeded the 60-second limit'
}
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
    hostSmoke = $hostSmoke
    uninstallExitCode = $uninstall.ExitCode
    installDirectoryRemains = $installDirectoryRemains
    uninstallEntryRemains = $uninstallEntryRemains
    limitations = @(
        'Fresh hosted runner profile, not a retail Windows image',
        'Unsigned research artifact',
        'WebView2 was already present on the runner',
        'No real ApiaryLens local service or user data was installed',
        'Detailed startup and memory sampling comes from the build job; this job only verifies a three-second installed-host smoke test'
    )
}

$env:PATH = $originalPath
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputPath 'lifecycle.json') -Encoding utf8NoBOM
$result | ConvertTo-Json -Depth 8

if ($installDirectoryRemains -or $uninstallEntryRemains) {
    throw 'Research uninstall left the install directory or uninstall registration behind'
}
