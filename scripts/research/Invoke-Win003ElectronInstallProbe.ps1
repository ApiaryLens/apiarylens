[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $EvidenceDirectory,

    [Parameter(Mandatory)]
    [string] $OutputDirectory,

    [string] $SbomToolPath,

    [string] $SbomOutputPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$evidencePath = (Resolve-Path -LiteralPath $EvidenceDirectory).Path
$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
$runnerTemp = [System.IO.Path]::GetFullPath($env:RUNNER_TEMP)
if (-not $outputPath.StartsWith($runnerTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Lifecycle evidence must remain under the runner temporary directory: $runnerTemp"
}
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$measurement = Get-Content -Raw -LiteralPath (Join-Path $evidencePath 'measurement.json') | ConvertFrom-Json
$installerPath = Join-Path $evidencePath 'electron-research-setup.exe'
$actualHash = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash
if ($actualHash -ne $measurement.setupSha256) { throw 'Electron setup SHA-256 mismatch' }

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
            $_.DisplayName -like '*WIN-003 Electron Research*'
        } |
        Select-Object -First 1
}

$install = Start-Process -FilePath $installerPath -ArgumentList '--silent' -PassThru -WindowStyle Hidden
if (-not $install.WaitForExit(60000)) {
    Stop-Process -Id $install.Id -Force -ErrorAction SilentlyContinue
    throw 'Electron Squirrel install exceeded 60 seconds'
}
if ($install.ExitCode -ne 0) { throw "Electron Squirrel install failed with exit code $($install.ExitCode)" }

$expectedInstallDirectory = Join-Path $env:LOCALAPPDATA 'ApiaryLensElectronResearch'
$entry = $null
foreach ($attempt in 1..40) {
    $entry = Get-UninstallEntry
    if ($entry -and (Test-Path -LiteralPath $expectedInstallDirectory)) { break }
    Start-Sleep -Milliseconds 250
}
$installDirectory = if (Test-Path -LiteralPath $expectedInstallDirectory) {
    $expectedInstallDirectory
} elseif ($entry -and $entry.UninstallString -match '"([^"]+\\Update\.exe)"') {
    Split-Path -Parent $Matches[1]
} else {
    throw 'Electron Squirrel install directory was not found'
}

# Squirrel can launch the application after setup. Stop only processes whose
# executable is inside this disposable research installation.
Get-Process -Name 'ApiaryLensElectronResearch' -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path.StartsWith($installDirectory, [System.StringComparison]::OrdinalIgnoreCase) } |
    Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

$appDirectory = Get-ChildItem -LiteralPath $installDirectory -Directory -Filter 'app-*' |
    Sort-Object Name -Descending |
    Select-Object -First 1
$installedHost = if ($appDirectory) {
    Get-ChildItem -LiteralPath $appDirectory.FullName -Filter 'ApiaryLensElectronResearch.exe' |
        Select-Object -First 1
} else { $null }
$updateExecutable = Join-Path $installDirectory 'Update.exe'
if (-not $installedHost -or -not (Test-Path -LiteralPath $updateExecutable)) {
    throw 'Electron installed host or Squirrel Update.exe was not found'
}
$installedSignature = Get-AuthenticodeSignature -LiteralPath $installedHost.FullName
if ($measurement.signingMode -eq 'ephemeral-test-signing' -and (
    -not $installedSignature.SignerCertificate -or
    $installedSignature.SignerCertificate.Thumbprint -ne $measurement.hostSignatureThumbprint
)) {
    throw 'Installed Electron host did not retain the expected Authenticode signer'
}

$probePath = Join-Path $runnerTemp 'win003-electron-installed-probe.json'
$probeStdout = Join-Path $outputPath 'installed-probe.stdout.log'
$probeStderr = Join-Path $outputPath 'installed-probe.stderr.log'
$probeArguments = "--win003-probe-output `"$probePath`""
$probe = Start-Process -FilePath $installedHost.FullName -ArgumentList $probeArguments -WorkingDirectory $appDirectory.FullName -PassThru -WindowStyle Hidden -RedirectStandardOutput $probeStdout -RedirectStandardError $probeStderr
if (-not $probe.WaitForExit(15000)) {
    Stop-Process -Id $probe.Id -Force -ErrorAction SilentlyContinue
    throw 'Installed Electron sqlite probe exceeded 15 seconds'
}
$probeSucceeded = $probe.ExitCode -eq 0 -and (Test-Path -LiteralPath $probePath)
if (-not $probeSucceeded) {
    $diagnostic = [ordered]@{
        measuredAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
        installedHost = $installedHost.FullName
        appDirectory = $appDirectory.FullName
        arguments = $probeArguments
        exitCode = $probe.ExitCode
        probeFileExists = Test-Path -LiteralPath $probePath
        stdout = if (Test-Path -LiteralPath $probeStdout) { Get-Content -Raw -LiteralPath $probeStdout } else { $null }
        stderr = if (Test-Path -LiteralPath $probeStderr) { Get-Content -Raw -LiteralPath $probeStderr } else { $null }
        installedFiles = @(Get-ChildItem -LiteralPath $installDirectory -Recurse -File | ForEach-Object {
            $_.FullName.Substring($installDirectory.Length).TrimStart('\\')
        })
    }
    $diagnostic | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $outputPath 'probe-failure.json') -Encoding utf8NoBOM
    throw "Installed Electron sqlite probe failed (exit $($probe.ExitCode), output file: $(Test-Path -LiteralPath $probePath))"
}
$probeResult = Get-Content -Raw -LiteralPath $probePath | ConvertFrom-Json
if ($probeResult.sqlite -ne 'electron-node-sqlite-ok') { throw 'Installed Electron node:sqlite probe returned the wrong result' }

$bridgeProbePath = Join-Path $runnerTemp 'win003-electron-installed-bridge-probe.json'
$bridgeProbeStdout = Join-Path $outputPath 'installed-bridge-probe.stdout.log'
$bridgeProbeStderr = Join-Path $outputPath 'installed-bridge-probe.stderr.log'
$bridgeProbeArguments = "--win003-bridge-output `"$bridgeProbePath`""
$bridgeProbe = Start-Process -FilePath $installedHost.FullName -ArgumentList $bridgeProbeArguments -WorkingDirectory $appDirectory.FullName -PassThru -WindowStyle Hidden -RedirectStandardOutput $bridgeProbeStdout -RedirectStandardError $bridgeProbeStderr
if (-not $bridgeProbe.WaitForExit(30000)) {
    Stop-Process -Id $bridgeProbe.Id -Force -ErrorAction SilentlyContinue
    throw 'Installed Electron real-service bridge probe exceeded 30 seconds'
}
if ($bridgeProbe.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $bridgeProbePath)) {
    $bridgeDiagnostic = [ordered]@{
        measuredAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
        exitCode = $bridgeProbe.ExitCode
        probeFileExists = Test-Path -LiteralPath $bridgeProbePath
        stdout = if (Test-Path -LiteralPath $bridgeProbeStdout) { Get-Content -Raw -LiteralPath $bridgeProbeStdout } else { $null }
        stderr = if (Test-Path -LiteralPath $bridgeProbeStderr) { Get-Content -Raw -LiteralPath $bridgeProbeStderr } else { $null }
    }
    $bridgeDiagnostic | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $outputPath 'bridge-probe-failure.json') -Encoding utf8NoBOM
    throw 'Installed Electron real-service bridge probe failed'
}
$bridgeProbeResult = Get-Content -Raw -LiteralPath $bridgeProbePath | ConvertFrom-Json
$installedRealServiceBridgeProbePassed =
    $bridgeProbeResult.sandboxedRendererHasNoNodeProcess -and
    $bridgeProbeResult.sandboxedRendererHasNoRequire -and
    @($bridgeProbeResult.exposedBridgeKeys).Count -eq 1 -and
    $bridgeProbeResult.exposedBridgeKeys[0] -eq 'health' -and
    $bridgeProbeResult.typedHealthStatus -eq 200 -and
    $bridgeProbeResult.typedHealthProtocolVersion -eq 1 -and
    $bridgeProbeResult.bridgeInvocationCount -eq 1 -and
    $bridgeProbeResult.rendererToMainArgumentCount -eq 0 -and
    $bridgeProbeResult.untrustedSenderRejected -and
    -not $bridgeProbeResult.tokenPresentInRendererSnapshot -and
    -not $bridgeProbeResult.tokenPresentInConsoleMessages -and
    -not $bridgeProbeResult.tokenPresentInArguments -and
    -not $bridgeProbeResult.tokenPresentInServiceArguments -and
    -not $bridgeProbeResult.tokenPresentInReadinessOrServiceOutput -and
    $bridgeProbeResult.realServiceAddress -eq '127.0.0.1' -and
    $bridgeProbeResult.realServiceDatabaseCreated -and
    $bridgeProbeResult.realServiceMediaDirectoryCreated -and
    $bridgeProbeResult.realServiceExitCode -eq 0 -and
    $bridgeProbeResult.apiAcceptance.passed -and
    $bridgeProbeResult.apiAcceptance.checkCount -ge 40 -and
    @($bridgeProbeResult.apiAcceptance.migrationVersions).Count -eq 4 -and
    $bridgeProbeResult.apiAcceptance.bootstrapProtected -and
    $bridgeProbeResult.apiAcceptance.csrfAndDeduplicationPassed -and
    $bridgeProbeResult.apiAcceptance.organizationIsolationPassed -and
    $bridgeProbeResult.apiAcceptance.sessionRotationAndRecoveryPassed -and
    $bridgeProbeResult.apiAcceptance.viewerAuthorizationPassed -and
    $bridgeProbeResult.apiAcceptance.mediaOriginalThumbnailExportDeletePassed -and
    $bridgeProbeResult.apiAcceptance.restartPersistencePassed -and
    $bridgeProbeResult.forcedWriteRecovery.forcedExitWasNonZero -and
    $bridgeProbeResult.forcedWriteRecovery.integrityPassed -and
    $bridgeProbeResult.forcedWriteRecovery.committedMarkerRetained -and
    $bridgeProbeResult.forcedWriteRecovery.interruptedMarkerRolledBack -and
    $bridgeProbeResult.forcedWriteRecovery.restartedSameDataDirectory -and
    $bridgeProbeResult.forcedWriteRecovery.databaseFullRejected -and
    $bridgeProbeResult.forcedWriteRecovery.databaseFullTransactionRolledBack -and
    $bridgeProbeResult.forcedWriteRecovery.integrityAfterDatabaseFull -and
    $bridgeProbeResult.corruptDatabaseStartup.rejectedBeforeReadiness -and
    $bridgeProbeResult.nativeCredentialProtection.encryptionAvailable -and
    $bridgeProbeResult.nativeCredentialProtection.initialRoundTrip -and
    $bridgeProbeResult.nativeCredentialProtection.initialCiphertextExcludesPlaintext -and
    $bridgeProbeResult.nativeCredentialProtection.replacementRoundTrip -and
    $bridgeProbeResult.nativeCredentialProtection.replacementCiphertextExcludesPlaintext -and
    $bridgeProbeResult.nativeCredentialProtection.corruptCiphertextRejected -and
    $bridgeProbeResult.nativeCredentialProtection.credentialDeleted -and
    $bridgeProbeResult.serverSessionCredentialLifecyclePassed -and
    -not $bridgeProbeResult.credentialSecretPresentOutsideMain -and
    $bridgeProbeResult.localStorageEntryCount -eq 0 -and
    $bridgeProbeResult.sessionStorageEntryCount -eq 0
if (-not $installedRealServiceBridgeProbePassed) {
    throw 'Installed Electron real-service bridge acceptance checks failed'
}

$readOnlyLab = Join-Path ([IO.Path]::GetTempPath()) "apiarylens-win003-readonly-$([guid]::NewGuid().ToString('N'))"
$readOnlyProbePath = Join-Path $runnerTemp 'win003-electron-installed-readonly-probe.json'
New-Item -ItemType Directory -Force -Path $readOnlyLab | Out-Null
$originalReadOnlySddl = (Get-Acl -LiteralPath $readOnlyLab).Sddl
$installedReadOnlyDirectoryRejectedBeforeReadiness = $false
try {
    $readOnlyAcl = Get-Acl -LiteralPath $readOnlyLab
    $denyWrite = [Security.AccessControl.FileSystemAccessRule]::new(
        [Security.Principal.WindowsIdentity]::GetCurrent().User,
        [Security.AccessControl.FileSystemRights]::Write,
        [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',
        [Security.AccessControl.PropagationFlags]::None,
        [Security.AccessControl.AccessControlType]::Deny
    )
    [void] $readOnlyAcl.AddAccessRule($denyWrite)
    Set-Acl -LiteralPath $readOnlyLab -AclObject $readOnlyAcl
    $readOnlyArguments = "--win003-service-directory-input `"$readOnlyLab`" --win003-service-directory-output `"$readOnlyProbePath`""
    $readOnlyProbe = Start-Process -FilePath $installedHost.FullName -ArgumentList $readOnlyArguments -WorkingDirectory $appDirectory.FullName -PassThru -WindowStyle Hidden
    if (-not $readOnlyProbe.WaitForExit(20000)) {
        Stop-Process -Id $readOnlyProbe.Id -Force -ErrorAction SilentlyContinue
        throw 'Installed Electron read-only directory probe exceeded 20 seconds'
    }
    if ($readOnlyProbe.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $readOnlyProbePath)) {
        throw 'Installed Electron read-only directory probe failed'
    }
    $readOnlyState = Get-Content -Raw -LiteralPath $readOnlyProbePath | ConvertFrom-Json
    $installedReadOnlyDirectoryRejectedBeforeReadiness = $readOnlyState.rejectedBeforeReadiness
} finally {
    $restoreAcl = [Security.AccessControl.DirectorySecurity]::new()
    $restoreAcl.SetSecurityDescriptorSddlForm($originalReadOnlySddl)
    Set-Acl -LiteralPath $readOnlyLab -AclObject $restoreAcl
    $resolvedReadOnlyLab = [IO.Path]::GetFullPath($readOnlyLab)
    $windowsTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolvedReadOnlyLab.StartsWith($windowsTemp, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedReadOnlyLab) -like 'apiarylens-win003-readonly-*') {
        Remove-Item -LiteralPath $resolvedReadOnlyLab -Recurse -Force
    }
}
if (-not $installedReadOnlyDirectoryRejectedBeforeReadiness) {
    throw 'Installed Electron did not reject a read-only data directory before readiness'
}

$credentialCrashPath = Join-Path $runnerTemp 'win003-electron-installed-credential-crash.json'
$credentialRecoveryPath = Join-Path $runnerTemp 'win003-electron-installed-credential-recovery.json'
$credentialCrashArguments = "--win003-credential-crash-output `"$credentialCrashPath`""
$credentialCrash = Start-Process -FilePath $installedHost.FullName -ArgumentList $credentialCrashArguments -WorkingDirectory $appDirectory.FullName -PassThru -WindowStyle Hidden
if (-not $credentialCrash.WaitForExit(15000)) {
    Stop-Process -Id $credentialCrash.Id -Force -ErrorAction SilentlyContinue
    throw 'Installed Electron credential crash probe exceeded 15 seconds'
}
if ($credentialCrash.ExitCode -ne 76 -or -not (Test-Path -LiteralPath $credentialCrashPath)) {
    throw "Installed Electron credential crash probe failed with exit $($credentialCrash.ExitCode)"
}
$credentialRecoveryArguments = "--win003-credential-recovery-input `"$credentialCrashPath`" --win003-credential-recovery-output `"$credentialRecoveryPath`""
$credentialRecovery = Start-Process -FilePath $installedHost.FullName -ArgumentList $credentialRecoveryArguments -WorkingDirectory $appDirectory.FullName -PassThru -WindowStyle Hidden
if (-not $credentialRecovery.WaitForExit(15000)) {
    Stop-Process -Id $credentialRecovery.Id -Force -ErrorAction SilentlyContinue
    throw 'Installed Electron credential recovery probe exceeded 15 seconds'
}
if ($credentialRecovery.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $credentialRecoveryPath)) {
    throw "Installed Electron credential recovery probe failed with exit $($credentialRecovery.ExitCode)"
}
$credentialRecoveryState = Get-Content -Raw -LiteralPath $credentialRecoveryPath | ConvertFrom-Json
$installedCredentialCrashRecoveryPassed =
    $credentialRecoveryState.interruptedRotationDetected -and
    $credentialRecoveryState.replacementPromoted -and
    $credentialRecoveryState.revokedSessionDeleted -and
    $credentialRecoveryState.signOutRetainedHiveData -and
    $credentialRecoveryState.keepDataPreservedProtectedRootAndHiveData -and
    $credentialRecoveryState.removeAllDeletedCredentialAndHiveData
if (-not $installedCredentialCrashRecoveryPassed) { throw 'Installed Electron credential crash/recovery acceptance failed' }

$crashProbePath = Join-Path $runnerTemp 'win003-electron-installed-crash-probe.json'
$duplicateProbePath = Join-Path $runnerTemp 'win003-electron-installed-duplicate-probe.json'
$crashProbeArguments = "--win003-crash-probe-output `"$crashProbePath`""
$crashProbe = Start-Process -FilePath $installedHost.FullName -ArgumentList $crashProbeArguments -WorkingDirectory $appDirectory.FullName -PassThru -WindowStyle Hidden
$crashDeadline = [DateTimeOffset]::UtcNow.AddSeconds(15)
while (-not $crashProbe.HasExited -and -not (Test-Path -LiteralPath $crashProbePath) -and [DateTimeOffset]::UtcNow -lt $crashDeadline) {
    Start-Sleep -Milliseconds 50
    $crashProbe.Refresh()
}
if (-not (Test-Path -LiteralPath $crashProbePath)) {
    Stop-Process -Id $crashProbe.Id -Force -ErrorAction SilentlyContinue
    throw 'Installed Electron crash probe did not become ready'
}
$crashState = Get-Content -Raw -LiteralPath $crashProbePath | ConvertFrom-Json
$duplicateProbeArguments = "--win003-probe-output `"$duplicateProbePath`""
$duplicateProbe = Start-Process -FilePath $installedHost.FullName -ArgumentList $duplicateProbeArguments -WorkingDirectory $appDirectory.FullName -PassThru -WindowStyle Hidden
if (-not $duplicateProbe.WaitForExit(10000)) {
    Stop-Process -Id $duplicateProbe.Id -Force -ErrorAction SilentlyContinue
    throw 'Installed Electron duplicate instance did not exit'
}
$installedSingleInstancePassed = -not (Test-Path -LiteralPath $duplicateProbePath)
Stop-Process -Id ([int] $crashState.hostProcessId) -Force -ErrorAction Stop
$installedServiceExitedAfterHostCrash = $false
foreach ($attempt in 1..100) {
    if (-not (Get-Process -Id ([int] $crashState.serviceProcessId) -ErrorAction SilentlyContinue)) {
        $installedServiceExitedAfterHostCrash = $true
        break
    }
    Start-Sleep -Milliseconds 100
}
$installedReadyFileRemovedAfterHostCrash = -not (Test-Path -LiteralPath ([string] $crashState.serviceReadyFile))
$crashLab = [IO.Path]::GetFullPath((Split-Path -Parent ([string] $crashState.serviceReadyFile)))
$windowsTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
if (-not $crashLab.StartsWith($windowsTemp, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Installed Electron crash probe escaped the Windows temporary directory'
}
if (-not $installedSingleInstancePassed -or -not $installedServiceExitedAfterHostCrash) {
    Stop-Process -Id ([int] $crashState.serviceProcessId) -Force -ErrorAction SilentlyContinue
    throw "Installed Electron single-instance or parent-death acceptance failed (singleInstance=$installedSingleInstancePassed, serviceExited=$installedServiceExitedAfterHostCrash, readyFileRemoved=$installedReadyFileRemovedAfterHostCrash)"
}
$recoveryProbePath = Join-Path $runnerTemp 'win003-electron-installed-recovery-probe.json'
$recoveryProbeArguments = "--win003-recovery-probe-input `"$crashProbePath`" --win003-recovery-probe-output `"$recoveryProbePath`""
$recoveryProbe = Start-Process -FilePath $installedHost.FullName -ArgumentList $recoveryProbeArguments -WorkingDirectory $appDirectory.FullName -PassThru -WindowStyle Hidden
if (-not $recoveryProbe.WaitForExit(15000)) {
    Stop-Process -Id $recoveryProbe.Id -Force -ErrorAction SilentlyContinue
    throw 'Installed Electron stale-readiness recovery probe exceeded 15 seconds'
}
if ($recoveryProbe.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $recoveryProbePath)) {
    throw 'Installed Electron stale-readiness recovery probe failed'
}
$recoveryState = Get-Content -Raw -LiteralPath $recoveryProbePath | ConvertFrom-Json
$installedStaleReadinessRecoveryPassed =
    $recoveryState.staleReadinessRemovedBeforeRestart -and
    $recoveryState.readinessReplacedForRecoveredService -and
    $recoveryState.recoveredServiceExitCode -eq 0 -and
    $recoveryState.readyFileRemovedAfterRecoveryShutdown
if (-not $installedStaleReadinessRecoveryPassed) { throw 'Installed Electron stale-readiness recovery acceptance failed' }

$process = Start-Process -FilePath $installedHost.FullName -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3
$process.Refresh()
$hostStayedRunning = -not $process.HasExited
$all = @(Get-CimInstance Win32_Process)
$ids = [System.Collections.Generic.HashSet[int]]::new()
[void] $ids.Add($process.Id)
do {
    $added = $false
    foreach ($candidate in $all) {
        if ($ids.Contains([int] $candidate.ParentProcessId) -and -not $ids.Contains([int] $candidate.ProcessId)) {
            [void] $ids.Add([int] $candidate.ProcessId)
            $added = $true
        }
    }
} while ($added)
$processes = @(Get-Process -Id @($ids) -ErrorAction SilentlyContinue)
$hostSmoke = [ordered]@{
    stayedRunningForThreeSeconds = $hostStayedRunning
    processCount = $processes.Count
    workingSetMiB = [math]::Round((($processes | Measure-Object WorkingSet64 -Sum).Sum) / 1MB, 1)
    privateMiB = [math]::Round((($processes | Measure-Object PrivateMemorySize64 -Sum).Sum) / 1MB, 1)
}
Get-Process -Id (@($ids) | Sort-Object -Descending) -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
$process.WaitForExit(5000) | Out-Null
if (-not $hostStayedRunning) { throw 'Installed Electron host exited during smoke test' }

$retentionStatePath = Join-Path $runnerTemp 'win003-electron-installed-retention-state.json'
$retentionPrepareArguments = "--win003-retention-prepare-output `"$retentionStatePath`""
$retentionPrepare = Start-Process -FilePath $installedHost.FullName -ArgumentList $retentionPrepareArguments -WorkingDirectory $appDirectory.FullName -PassThru -WindowStyle Hidden
if (-not $retentionPrepare.WaitForExit(15000)) {
    Stop-Process -Id $retentionPrepare.Id -Force -ErrorAction SilentlyContinue
    throw 'Installed Electron retention preparation exceeded 15 seconds'
}
if ($retentionPrepare.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $retentionStatePath)) {
    throw 'Installed Electron retention preparation failed'
}
$retentionState = Get-Content -Raw -LiteralPath $retentionStatePath | ConvertFrom-Json
$retentionRoot = [IO.Path]::GetFullPath([string] $retentionState.retentionRoot)
$expectedRetentionRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'ApiaryLens\WIN003-Retention-Research'))
if (-not $retentionRoot.Equals($expectedRetentionRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Installed Electron retention root was outside the exact research location'
}

# Electron/Squirrel can re-parent a process outside the launcher's original process
# tree. Quiesce every executable whose resolved image remains inside this exact
# installation root before asking Squirrel to remove files.
$installPrefix = [IO.Path]::GetFullPath($installDirectory).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
foreach ($attempt in 1..20) {
    $installedProcesses = @(
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.ExecutablePath -and
                [IO.Path]::GetFullPath($_.ExecutablePath).StartsWith($installPrefix, [StringComparison]::OrdinalIgnoreCase)
            }
    )
    if ($installedProcesses.Count -eq 0) { break }
    Get-Process -Id @($installedProcesses.ProcessId) -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 250
}
$installedProcessCountBeforeUninstall = @(
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.ExecutablePath -and
            [IO.Path]::GetFullPath($_.ExecutablePath).StartsWith($installPrefix, [StringComparison]::OrdinalIgnoreCase)
        }
).Count
if ($installedProcessCountBeforeUninstall -ne 0) {
    throw 'Electron host did not fully quiesce before uninstall'
}

$installedFiles = Get-ChildItem -LiteralPath $installDirectory -Recurse -File
$installedBytes = ($installedFiles | Measure-Object Length -Sum).Sum
$installedFileCount = $installedFiles.Count
$installedHostBytes = $installedHost.Length
$licenseNoticeFiles = @($installedFiles | Where-Object Name -Match '(?i)(license|notice|copying)' | ForEach-Object {
    $_.FullName.Substring($installDirectory.Length).TrimStart('\')
})
$runtimeSbom = $null
if ($SbomToolPath -or $SbomOutputPath) {
    if (-not $SbomToolPath -or -not $SbomOutputPath) { throw 'Both SbomToolPath and SbomOutputPath are required together' }
    $resolvedSbomTool = (Resolve-Path -LiteralPath $SbomToolPath).Path
    $resolvedSbomOutput = [IO.Path]::GetFullPath($SbomOutputPath)
    if (-not $resolvedSbomOutput.StartsWith($runnerTemp, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Runtime SBOM output must remain under the runner temporary directory'
    }
    & $resolvedSbomTool scan "dir:$installDirectory" -o "cyclonedx-json=$resolvedSbomOutput"
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $resolvedSbomOutput)) { throw 'Electron runtime SBOM generation failed' }
    $runtimeSbom = [ordered]@{
        path = $resolvedSbomOutput
        sha256 = (Get-FileHash -LiteralPath $resolvedSbomOutput -Algorithm SHA256).Hash
        componentCount = @((Get-Content -Raw -LiteralPath $resolvedSbomOutput | ConvertFrom-Json).components).Count
    }
}

$uninstall = Start-Process -FilePath $updateExecutable -ArgumentList @('--uninstall', '-s') -PassThru -WindowStyle Hidden
if (-not $uninstall.WaitForExit(60000)) {
    Stop-Process -Id $uninstall.Id -Force -ErrorAction SilentlyContinue
    throw 'Electron Squirrel uninstall exceeded 60 seconds'
}
if ($uninstall.ExitCode -ne 0) { throw "Electron Squirrel uninstall failed with exit code $($uninstall.ExitCode)" }
$uninstallConvergenceMs = $null
$uninstallClock = [Diagnostics.Stopwatch]::StartNew()
foreach ($attempt in 1..60) {
    $entryRemains = $null -ne (Get-UninstallEntry)
    $hostRemains = $null -ne (Get-ChildItem -LiteralPath $installDirectory -Recurse -Filter 'ApiaryLensElectronResearch.exe' -ErrorAction SilentlyContinue | Select-Object -First 1)
    if (-not $entryRemains -and -not $hostRemains) {
        $uninstallConvergenceMs = $uninstallClock.ElapsedMilliseconds
        break
    }
    Start-Sleep -Milliseconds 500
}
$entryRemains = $null -ne (Get-UninstallEntry)
$hostRemains = $null -ne (Get-ChildItem -LiteralPath $installDirectory -Recurse -Filter 'ApiaryLensElectronResearch.exe' -ErrorAction SilentlyContinue | Select-Object -First 1)
$directoryRemains = Test-Path -LiteralPath $installDirectory
$residualBytes = if ($directoryRemains) {
    (Get-ChildItem -LiteralPath $installDirectory -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
} else { 0 }

$defaultUninstallKeptProtectedCredentialAndHiveData =
    (Test-Path -LiteralPath (Join-Path $retentionRoot 'standalone-root.bin')) -and
    (Test-Path -LiteralPath (Join-Path $retentionRoot 'apiarylens.sqlite.fixture'))
if (-not $defaultUninstallKeptProtectedCredentialAndHiveData) {
    throw 'Default uninstall did not retain the protected credential and hive data'
}

$reinstall = Start-Process -FilePath $installerPath -ArgumentList '--silent' -PassThru -WindowStyle Hidden
if (-not $reinstall.WaitForExit(60000)) {
    Stop-Process -Id $reinstall.Id -Force -ErrorAction SilentlyContinue
    throw 'Electron reinstall exceeded 60 seconds'
}
if ($reinstall.ExitCode -ne 0) { throw "Electron reinstall failed with exit code $($reinstall.ExitCode)" }
foreach ($attempt in 1..40) {
    if ((Get-UninstallEntry) -and (Test-Path -LiteralPath $installDirectory)) { break }
    Start-Sleep -Milliseconds 250
}
Get-Process -Name 'ApiaryLensElectronResearch' -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path.StartsWith($installDirectory, [StringComparison]::OrdinalIgnoreCase) } |
    Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500
$reinstalledAppDirectory = Get-ChildItem -LiteralPath $installDirectory -Directory -Filter 'app-*' |
    Sort-Object Name -Descending |
    Select-Object -First 1
$reinstalledHost = if ($reinstalledAppDirectory) {
    Get-ChildItem -LiteralPath $reinstalledAppDirectory.FullName -Filter 'ApiaryLensElectronResearch.exe' |
        Select-Object -First 1
} else { $null }
$reinstalledUpdate = Join-Path $installDirectory 'Update.exe'
if (-not $reinstalledHost -or -not (Test-Path -LiteralPath $reinstalledUpdate)) {
    throw 'Electron reinstalled host or updater was not found'
}

$retentionVerifyPath = Join-Path $runnerTemp 'win003-electron-installed-retention-verify.json'
$retentionVerifyArguments = "--win003-retention-verify-input `"$retentionStatePath`" --win003-retention-verify-output `"$retentionVerifyPath`""
$retentionVerify = Start-Process -FilePath $reinstalledHost.FullName -ArgumentList $retentionVerifyArguments -WorkingDirectory $reinstalledAppDirectory.FullName -PassThru -WindowStyle Hidden
if (-not $retentionVerify.WaitForExit(15000)) {
    Stop-Process -Id $retentionVerify.Id -Force -ErrorAction SilentlyContinue
    throw 'Installed Electron retention verification exceeded 15 seconds'
}
if ($retentionVerify.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $retentionVerifyPath)) {
    throw 'Installed Electron retention verification failed'
}
$retentionVerifyState = Get-Content -Raw -LiteralPath $retentionVerifyPath | ConvertFrom-Json
$reinstallReadProtectedCredentialAndHiveData =
    $retentionVerifyState.protectedRootReadableAfterReinstall -and
    $retentionVerifyState.hiveDataReadableAfterReinstall -and
    $retentionVerifyState.protectedBackupRestoredAfterReinstall
if (-not $reinstallReadProtectedCredentialAndHiveData) {
    throw 'Reinstalled Electron host could not read retained protected state'
}

$retentionRemovePath = Join-Path $runnerTemp 'win003-electron-installed-retention-remove.json'
$retentionRemoveArguments = "--win003-retention-remove-input `"$retentionStatePath`" --win003-retention-remove-output `"$retentionRemovePath`""
$retentionRemove = Start-Process -FilePath $reinstalledHost.FullName -ArgumentList $retentionRemoveArguments -WorkingDirectory $reinstalledAppDirectory.FullName -PassThru -WindowStyle Hidden
if (-not $retentionRemove.WaitForExit(15000)) {
    Stop-Process -Id $retentionRemove.Id -Force -ErrorAction SilentlyContinue
    throw 'Installed Electron remove-all verification exceeded 15 seconds'
}
if ($retentionRemove.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $retentionRemovePath)) {
    throw 'Installed Electron remove-all verification failed'
}
$retentionRemoveState = Get-Content -Raw -LiteralPath $retentionRemovePath | ConvertFrom-Json
$explicitRemoveAllDeletedCredentialAndHiveData =
    $retentionRemoveState.removeAllDeletedCredentialAndHiveData -and
    -not (Test-Path -LiteralPath $retentionRoot)
if (-not $explicitRemoveAllDeletedCredentialAndHiveData) {
    throw 'Installed Electron remove-all left protected credential or hive data'
}

foreach ($attempt in 1..20) {
    $reinstalledProcesses = @(
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.ExecutablePath -and
                [IO.Path]::GetFullPath($_.ExecutablePath).StartsWith($installPrefix, [StringComparison]::OrdinalIgnoreCase)
            }
    )
    if ($reinstalledProcesses.Count -eq 0) { break }
    Get-Process -Id @($reinstalledProcesses.ProcessId) -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 250
}
$secondUninstall = Start-Process -FilePath $reinstalledUpdate -ArgumentList @('--uninstall', '-s') -PassThru -WindowStyle Hidden
if (-not $secondUninstall.WaitForExit(60000)) {
    Stop-Process -Id $secondUninstall.Id -Force -ErrorAction SilentlyContinue
    throw 'Electron second uninstall exceeded 60 seconds'
}
if ($secondUninstall.ExitCode -ne 0) { throw "Electron second uninstall failed with exit code $($secondUninstall.ExitCode)" }
foreach ($attempt in 1..60) {
    $secondEntryRemains = $null -ne (Get-UninstallEntry)
    $secondHostRemains = $null -ne (Get-ChildItem -LiteralPath $installDirectory -Recurse -Filter 'ApiaryLensElectronResearch.exe' -ErrorAction SilentlyContinue | Select-Object -First 1)
    if (-not $secondEntryRemains -and -not $secondHostRemains) { break }
    Start-Sleep -Milliseconds 500
}
$secondEntryRemains = $null -ne (Get-UninstallEntry)
$secondHostRemains = $null -ne (Get-ChildItem -LiteralPath $installDirectory -Recurse -Filter 'ApiaryLensElectronResearch.exe' -ErrorAction SilentlyContinue | Select-Object -First 1)

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
    installedHostBytes = $installedHostBytes
    licenseNoticeFiles = $licenseNoticeFiles
    runtimeSbom = $runtimeSbom
    installedHostSignatureStatus = [string] $installedSignature.Status
    installedHostSignatureSubject = if ($installedSignature.SignerCertificate) { $installedSignature.SignerCertificate.Subject } else { $null }
    installedHostSignatureThumbprint = if ($installedSignature.SignerCertificate) { $installedSignature.SignerCertificate.Thumbprint } else { $null }
    installedNodeSqliteProbe = $probeResult.sqlite
    bundledElectronVersion = $probeResult.electron
    bundledNodeVersion = $probeResult.node
    installedRealServiceBridgeProbePassed = $installedRealServiceBridgeProbePassed
    installedRealServiceAddress = $bridgeProbeResult.realServiceAddress
    installedRealServiceDatabaseCreated = $bridgeProbeResult.realServiceDatabaseCreated
    installedRealServiceMediaDirectoryCreated = $bridgeProbeResult.realServiceMediaDirectoryCreated
    installedRealServiceExitCode = $bridgeProbeResult.realServiceExitCode
    installedBridgeUntrustedSenderRejected = $bridgeProbeResult.untrustedSenderRejected
    installedApiAcceptancePassed = $bridgeProbeResult.apiAcceptance.passed
    installedApiAcceptanceCheckCount = $bridgeProbeResult.apiAcceptance.checkCount
    installedApiAcceptanceMigrationVersions = @($bridgeProbeResult.apiAcceptance.migrationVersions)
    installedApiOrganizationIsolationPassed = $bridgeProbeResult.apiAcceptance.organizationIsolationPassed
    installedApiMediaLifecyclePassed = $bridgeProbeResult.apiAcceptance.mediaOriginalThumbnailExportDeletePassed
    installedApiRestartPersistencePassed = $bridgeProbeResult.apiAcceptance.restartPersistencePassed
    installedForcedWriteRecoveryPassed =
        $bridgeProbeResult.forcedWriteRecovery.forcedExitWasNonZero -and
        $bridgeProbeResult.forcedWriteRecovery.integrityPassed -and
        $bridgeProbeResult.forcedWriteRecovery.committedMarkerRetained -and
        $bridgeProbeResult.forcedWriteRecovery.interruptedMarkerRolledBack -and
        $bridgeProbeResult.forcedWriteRecovery.restartedSameDataDirectory -and
        $bridgeProbeResult.forcedWriteRecovery.databaseFullRejected -and
        $bridgeProbeResult.forcedWriteRecovery.databaseFullTransactionRolledBack -and
        $bridgeProbeResult.forcedWriteRecovery.integrityAfterDatabaseFull
    installedCorruptDatabaseRejectedBeforeReadiness = $bridgeProbeResult.corruptDatabaseStartup.rejectedBeforeReadiness
    installedReadOnlyDirectoryRejectedBeforeReadiness = $installedReadOnlyDirectoryRejectedBeforeReadiness
    installedNativeCredentialProtectionPassed =
        $bridgeProbeResult.nativeCredentialProtection.encryptionAvailable -and
        $bridgeProbeResult.nativeCredentialProtection.initialRoundTrip -and
        $bridgeProbeResult.nativeCredentialProtection.initialCiphertextExcludesPlaintext -and
        $bridgeProbeResult.nativeCredentialProtection.replacementRoundTrip -and
        $bridgeProbeResult.nativeCredentialProtection.replacementCiphertextExcludesPlaintext -and
        $bridgeProbeResult.nativeCredentialProtection.corruptCiphertextRejected -and
        $bridgeProbeResult.nativeCredentialProtection.credentialDeleted -and
        $bridgeProbeResult.serverSessionCredentialLifecyclePassed -and
        -not $bridgeProbeResult.credentialSecretPresentOutsideMain
    installedServerSessionCredentialLifecyclePassed = $bridgeProbeResult.serverSessionCredentialLifecyclePassed
    installedCredentialCrashRecoveryPassed = $installedCredentialCrashRecoveryPassed
    installedSingleInstancePassed = $installedSingleInstancePassed
    installedServiceExitedAfterHostCrash = $installedServiceExitedAfterHostCrash
    installedReadyFileRemovedAfterHostCrash = $installedReadyFileRemovedAfterHostCrash
    installedStaleReadinessRecoveryPassed = $installedStaleReadinessRecoveryPassed
    installedBridgeTokenPresentInRendererStorageGlobalsConsoleArgumentsReadinessOrServiceOutput =
        $bridgeProbeResult.tokenPresentInRendererSnapshot -or
        $bridgeProbeResult.tokenPresentInConsoleMessages -or
        $bridgeProbeResult.tokenPresentInArguments -or
        $bridgeProbeResult.tokenPresentInServiceArguments -or
        $bridgeProbeResult.tokenPresentInReadinessOrServiceOutput
    hostSmoke = $hostSmoke
    installedProcessCountBeforeUninstall = $installedProcessCountBeforeUninstall
    uninstallExitCode = $uninstall.ExitCode
    uninstallConvergenceMs = $uninstallConvergenceMs
    uninstallEntryRemains = $entryRemains
    installedHostRemains = $hostRemains
    installDirectoryRemains = $directoryRemains
    residualBytes = $residualBytes
    defaultUninstallKeptProtectedCredentialAndHiveData = $defaultUninstallKeptProtectedCredentialAndHiveData
    reinstallExitCode = $reinstall.ExitCode
    reinstallReadProtectedCredentialAndHiveData = $reinstallReadProtectedCredentialAndHiveData
    reinstallRestoredProtectedCredentialBackup = $retentionVerifyState.protectedBackupRestoredAfterReinstall
    explicitRemoveAllDeletedCredentialAndHiveData = $explicitRemoveAllDeletedCredentialAndHiveData
    secondUninstallExitCode = $secondUninstall.ExitCode
    secondUninstallEntryRemains = $secondEntryRemains
    secondInstalledHostRemains = $secondHostRemains
    limitations = @(
        'Fresh hosted runner profile, not a retail Windows image',
        $(if ($measurement.signingMode -eq 'ephemeral-test-signing') { 'Ephemeral self-signed research identity; not a production trust chain or release artifact' } else { 'Unsigned research artifact' }),
        'Real API/auth/org-isolation/media/export/restart lifecycle exercised; historical and failed migration transitions remain open',
        $(if ($installedReadyFileRemovedAfterHostCrash) { 'Forced host termination removed readiness state' } else { 'Forced host termination left stale readiness state; the next host rejected, replaced, and removed it during verified recovery' })
    )
}

$env:PATH = $originalPath
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputPath 'lifecycle.json') -Encoding utf8NoBOM
$result | ConvertTo-Json -Depth 8

if ($entryRemains -or $hostRemains -or $secondEntryRemains -or $secondHostRemains) {
    throw 'Electron uninstall left its registration or installed host behind'
}
