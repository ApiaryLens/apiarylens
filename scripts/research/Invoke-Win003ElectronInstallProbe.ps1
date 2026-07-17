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
    $bridgeProbeResult.localStorageEntryCount -eq 0 -and
    $bridgeProbeResult.sessionStorageEntryCount -eq 0
if (-not $installedRealServiceBridgeProbePassed) {
    throw 'Installed Electron real-service bridge acceptance checks failed'
}

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
    limitations = @(
        'Fresh hosted runner profile, not a retail Windows image',
        $(if ($measurement.signingMode -eq 'ephemeral-test-signing') { 'Ephemeral self-signed research identity; not a production trust chain or release artifact' } else { 'Unsigned research artifact' }),
        'Real ApiaryLens service health and disposable database/media creation were exercised; full typed API and user lifecycle remain open'
    )
}

$env:PATH = $originalPath
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputPath 'lifecycle.json') -Encoding utf8NoBOM
$result | ConvertTo-Json -Depth 8

if ($entryRemains -or $hostRemains) {
    throw 'Electron uninstall left its registration or installed host behind'
}
