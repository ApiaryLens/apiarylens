[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('electron', 'tauri')]
    [string] $Candidate,

    [Parameter(Mandatory)]
    [string] $BaselineEvidenceDirectory,

    [Parameter(Mandatory)]
    [string] $UpgradeEvidenceDirectory,

    [Parameter(Mandatory)]
    [string] $OutputDirectory
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# WIN-003 research automation only. This probe exercises the package manager's
# version transition behavior with disposable, ephemeral-test-signed candidates.
# It does not implement or select the ApiaryLens product updater.

$baselinePath = (Resolve-Path -LiteralPath $BaselineEvidenceDirectory).Path
$upgradePath = (Resolve-Path -LiteralPath $UpgradeEvidenceDirectory).Path
$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
$runnerTemp = [System.IO.Path]::GetFullPath($env:RUNNER_TEMP)
if (-not $outputPath.StartsWith($runnerTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Update evidence must remain under the runner temporary directory: $runnerTemp"
}
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$measurementName = 'measurement.json'
$installerName = if ($Candidate -eq 'electron') { 'electron-research-setup.exe' } else { 'tauri-research-setup.exe' }
$baselineMeasurement = Get-Content -Raw -LiteralPath (Join-Path $baselinePath $measurementName) | ConvertFrom-Json
$upgradeMeasurement = Get-Content -Raw -LiteralPath (Join-Path $upgradePath $measurementName) | ConvertFrom-Json
$baselineInstaller = Join-Path $baselinePath $installerName
$upgradeInstaller = Join-Path $upgradePath $installerName
$baselineExpectedHash = if ($Candidate -eq 'electron') { $baselineMeasurement.setupSha256 } else { $baselineMeasurement.nsisInstallerSha256 }
$upgradeExpectedHash = if ($Candidate -eq 'electron') { $upgradeMeasurement.setupSha256 } else { $upgradeMeasurement.nsisInstallerSha256 }

function Assert-ArtifactHash {
    param([string] $Path, [string] $Expected)
    $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    if ($actual -ne $Expected) { throw "Artifact SHA-256 mismatch for $Path" }
    return $actual
}

$baselineHash = Assert-ArtifactHash -Path $baselineInstaller -Expected $baselineExpectedHash
$upgradeHash = Assert-ArtifactHash -Path $upgradeInstaller -Expected $upgradeExpectedHash

function Get-UninstallEntry {
    $displayName = if ($Candidate -eq 'electron') { '*WIN-003 Electron Research*' } else { 'ApiaryLens WIN-003 Research' }
    $roots = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    return Get-ItemProperty -Path $roots -ErrorAction SilentlyContinue |
        Where-Object {
            $_.PSObject.Properties.Name -contains 'DisplayName' -and
            $_.DisplayName -like $displayName
        } |
        Select-Object -First 1
}

function Invoke-Installer {
    param([string] $Path)
    $arguments = if ($Candidate -eq 'electron') { '--silent' } else { '/S' }
    $process = Start-Process -FilePath $Path -ArgumentList $arguments -PassThru -WindowStyle Hidden
    if (-not $process.WaitForExit(90000)) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        throw "$Candidate installer exceeded 90 seconds"
    }
    if ($process.ExitCode -ne 0) { throw "$Candidate installer failed with exit code $($process.ExitCode)" }
    Start-Sleep -Seconds 2
    return $process.ExitCode
}

function Get-InstalledSnapshot {
    $entry = Get-UninstallEntry
    if (-not $entry) { return $null }
    $installDirectory = if ($Candidate -eq 'electron') {
        Join-Path $env:LOCALAPPDATA 'ApiaryLensElectronResearch'
    } elseif ($entry.PSObject.Properties.Name -contains 'InstallLocation' -and $entry.InstallLocation) {
        $entry.InstallLocation.Trim().Trim('"').TrimEnd([char]'\')
    } else {
        $null
    }
    $installedHost = if ($installDirectory -and (Test-Path -LiteralPath $installDirectory)) {
        $hostName = if ($Candidate -eq 'electron') { 'ApiaryLensElectronResearch.exe' } else { 'apiarylens_win003_tauri.exe' }
        Get-ChildItem -LiteralPath $installDirectory -Recurse -Filter $hostName -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending |
            Select-Object -First 1
    } else { $null }
    $signature = if ($installedHost) { Get-AuthenticodeSignature -LiteralPath $installedHost.FullName } else { $null }
    return [ordered]@{
        displayVersion = if ($entry.PSObject.Properties.Name -contains 'DisplayVersion') { [string] $entry.DisplayVersion } else { $null }
        installDirectory = $installDirectory
        hostPath = if ($installedHost) { $installedHost.FullName } else { $null }
        hostSignerThumbprint = if ($signature -and $signature.SignerCertificate) { $signature.SignerCertificate.Thumbprint } else { $null }
        appDirectories = if ($Candidate -eq 'electron' -and $installDirectory -and (Test-Path -LiteralPath $installDirectory)) {
            @(Get-ChildItem -LiteralPath $installDirectory -Directory -Filter 'app-*' | Select-Object -ExpandProperty Name)
        } else { @() }
    }
}

function Invoke-Uninstall {
    $entry = Get-UninstallEntry
    if (-not $entry) { return $null }
    if ($Candidate -eq 'electron') {
        $update = Join-Path $env:LOCALAPPDATA 'ApiaryLensElectronResearch\Update.exe'
        $process = Start-Process -FilePath $update -ArgumentList @('--uninstall', '-s') -PassThru -WindowStyle Hidden
    } else {
        $command = if ($entry.PSObject.Properties.Name -contains 'QuietUninstallString' -and $entry.QuietUninstallString) {
            $entry.QuietUninstallString
        } else { $entry.UninstallString }
        $executable = if ($command -match '^\s*"([^"]+)"') { $Matches[1] } else { ($command -split '\s+', 2)[0] }
        $process = Start-Process -FilePath $executable -ArgumentList '/S' -PassThru -WindowStyle Hidden
    }
    if (-not $process.WaitForExit(90000)) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        throw "$Candidate uninstall exceeded 90 seconds"
    }
    Start-Sleep -Seconds 3
    return $process.ExitCode
}

$stateDirectory = Join-Path $env:APPDATA "ApiaryLens-WIN003-$Candidate-update-state"
$statePath = Join-Path $stateDirectory 'state.json'
$result = [ordered]@{
    measuredAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    sourceCommit = $env:GITHUB_SHA
    sourceRunId = $env:GITHUB_RUN_ID
    candidate = $Candidate
    baselineVersion = $baselineMeasurement.researchVersion
    upgradeVersion = $upgradeMeasurement.researchVersion
    baselineSha256 = $baselineHash
    upgradeSha256 = $upgradeHash
    expectedSignerThumbprint = if ($Candidate -eq 'electron') { $upgradeMeasurement.setupSignatureThumbprint } else { $upgradeMeasurement.installerSignatureThumbprint }
}

try {
    $result['baselineInstallExitCode'] = Invoke-Installer -Path $baselineInstaller
    $result['afterBaselineInstall'] = Get-InstalledSnapshot
    if (-not $result.afterBaselineInstall) { throw 'Baseline installation was not detected' }

    New-Item -ItemType Directory -Force -Path $stateDirectory | Out-Null
    @{ sentinel = 'preserve-across-package-transitions'; createdAtUtc = [DateTimeOffset]::UtcNow.ToString('o') } |
        ConvertTo-Json |
        Set-Content -LiteralPath $statePath -Encoding utf8NoBOM

    $truncatedPath = Join-Path $runnerTemp "$Candidate-truncated-update.exe"
    $bytes = [System.IO.File]::ReadAllBytes($upgradeInstaller)
    $truncatedBytes = [byte[]]::new([math]::Floor($bytes.Length / 2))
    [System.Array]::Copy($bytes, $truncatedBytes, $truncatedBytes.Length)
    [System.IO.File]::WriteAllBytes($truncatedPath, $truncatedBytes)
    $truncatedHash = (Get-FileHash -LiteralPath $truncatedPath -Algorithm SHA256).Hash
    $result['invalidArtifact'] = [ordered]@{
        truncatedSha256 = $truncatedHash
        rejectedBeforeExecution = $truncatedHash -ne $upgradeExpectedHash
        installedSnapshotUnchanged = (Get-InstalledSnapshot).displayVersion -eq $result.afterBaselineInstall.displayVersion
    }
    if (-not $result.invalidArtifact.rejectedBeforeExecution) { throw 'Truncated update unexpectedly matched the release hash' }

    $result['upgradeInstallExitCode'] = Invoke-Installer -Path $upgradeInstaller
    $result['afterUpgrade'] = Get-InstalledSnapshot
    $result['stateRetainedAfterUpgrade'] = Test-Path -LiteralPath $statePath
    $result['signerRetainedAfterUpgrade'] = $result.afterUpgrade.hostSignerThumbprint -eq $result.expectedSignerThumbprint
    if (-not $result.afterUpgrade -or -not $result.stateRetainedAfterUpgrade -or -not $result.signerRetainedAfterUpgrade) {
        throw 'Upgrade did not preserve state and signer continuity'
    }

    $result['downgradeInstallExitCode'] = Invoke-Installer -Path $baselineInstaller
    $result['afterDowngradeAttempt'] = Get-InstalledSnapshot
    $result['stateRetainedAfterDowngradeAttempt'] = Test-Path -LiteralPath $statePath

    $result['repairUpgradeExitCode'] = Invoke-Installer -Path $upgradeInstaller
    $result['afterRepairUpgrade'] = Get-InstalledSnapshot
    $result['stateRetainedAfterRepairUpgrade'] = Test-Path -LiteralPath $statePath
    $result['signerRetainedAfterRepairUpgrade'] = $result.afterRepairUpgrade.hostSignerThumbprint -eq $result.expectedSignerThumbprint
    if (-not $result.afterRepairUpgrade -or -not $result.stateRetainedAfterRepairUpgrade -or -not $result.signerRetainedAfterRepairUpgrade) {
        throw 'Repair upgrade did not preserve state and signer continuity'
    }
} finally {
    try { $result['uninstallExitCode'] = Invoke-Uninstall } catch { $result['uninstallError'] = $_.Exception.Message }
    $result['registrationRemainsAfterUninstall'] = $null -ne (Get-UninstallEntry)
    $result['syntheticStateRetainedAfterUninstall'] = Test-Path -LiteralPath $statePath
    $result['limitations'] = @(
        'Hosted Windows Server runner, not a retail Windows profile',
        'Ephemeral self-signed identities are not production publisher trust',
        'Synthetic state proves package transition retention only; real SQLite backup, migration, health, and rollback remain product lifecycle requirements',
        'Truncation validates reject-before-execution acquisition behavior, not a power loss during an installer commit'
    )
    $result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $outputPath 'update-lifecycle.json') -Encoding utf8NoBOM
}

$result | ConvertTo-Json -Depth 10
if ($result.registrationRemainsAfterUninstall -or $result.Contains('uninstallError')) {
    throw "$Candidate update probe cleanup was incomplete"
}
