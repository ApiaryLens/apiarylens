[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $OutputDirectory
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
$runnerTemp = [System.IO.Path]::GetFullPath($env:RUNNER_TEMP)
$runnerPrefix = $runnerTemp.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $outputPath.StartsWith($runnerPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Research evidence must remain under the runner temporary directory: $runnerTemp"
}
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$fixture = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'win004-real-api-wrapper-fixture.mjs')).Path
$orphanParentFixture = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'win004-orphan-parent-fixture.ps1')).Path
$node = (Get-Command node.exe -ErrorAction Stop).Source
$lab = Join-Path $runnerTemp "win004-real-wrapper-$([guid]::NewGuid().ToString('n'))"
$dataDirectory = Join-Path $lab 'per-user-data'
$readyFile = Join-Path $lab 'ready.json'
$instanceName = "ApiaryLens-WIN004-Real-$($env:GITHUB_RUN_ID)"
$allowedOrigin = 'http://apiarylens.localhost'
New-Item -ItemType Directory -Force -Path $lab, $dataDirectory | Out-Null

function New-Secret([int] $ByteCount = 32) {
    $bytes = [byte[]]::new($ByteCount)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

$bootstrapToken = New-Secret
$authRootSecret = New-Secret 48
$password = "Win004-$((New-Secret 24))"
$controlTokens = [System.Collections.Generic.List[string]]::new()

function Start-Wrapper {
    param(
        [Parameter(Mandatory)] [string] $ControlToken,
        [Parameter(Mandatory)] [string] $ReadyPath,
        [Parameter(Mandatory)] [string] $OutLog,
        [Parameter(Mandatory)] [string] $ErrorLog,
        [string] $DataPath = $dataDirectory,
        [string] $Name = $instanceName
    )

    Remove-Item -LiteralPath $ReadyPath -Force -ErrorAction SilentlyContinue
    $controlTokens.Add($ControlToken)
    $env:APIARYLENS_CONTROL_TOKEN = $ControlToken
    $env:APIARYLENS_ALLOWED_ORIGIN = $allowedOrigin
    $env:APIARYLENS_DATA_DIRECTORY = $DataPath
    $env:APIARYLENS_READY_FILE = $ReadyPath
    $env:APIARYLENS_PARENT_PID = [string] $PID
    $env:APIARYLENS_INSTANCE_NAME = $Name
    $env:APIARYLENS_BOOTSTRAP_TOKEN = $bootstrapToken
    $env:APIARYLENS_AUTH_ROOT_SECRET = $authRootSecret
    try {
        return Start-Process -FilePath $node -ArgumentList @($fixture) -PassThru -WindowStyle Hidden -RedirectStandardOutput $OutLog -RedirectStandardError $ErrorLog
    } finally {
        Remove-Item Env:APIARYLENS_CONTROL_TOKEN, Env:APIARYLENS_ALLOWED_ORIGIN, Env:APIARYLENS_DATA_DIRECTORY, Env:APIARYLENS_READY_FILE, Env:APIARYLENS_PARENT_PID, Env:APIARYLENS_INSTANCE_NAME, Env:APIARYLENS_BOOTSTRAP_TOKEN, Env:APIARYLENS_AUTH_ROOT_SECRET -ErrorAction SilentlyContinue
    }
}

function Wait-Ready([System.Diagnostics.Process] $Process, [string] $ReadyPath, [string] $ErrorLog) {
    foreach ($attempt in 1..100) {
        if (Test-Path -LiteralPath $ReadyPath) {
            return Get-Content -Raw -LiteralPath $ReadyPath | ConvertFrom-Json
        }
        $Process.Refresh()
        if ($Process.HasExited) {
            throw "Real API wrapper exited before ready with code $($Process.ExitCode): $(Get-Content -Raw -LiteralPath $ErrorLog -ErrorAction SilentlyContinue)"
        }
        Start-Sleep -Milliseconds 100
    }
    throw 'Real API wrapper did not become ready within ten seconds'
}

function Invoke-WrapperRequest {
    param(
        [Parameter(Mandatory)] [int] $Port,
        [Parameter(Mandatory)] [string] $Path,
        [Parameter(Mandatory)] [string] $Token,
        [ValidateSet('GET', 'POST')] [string] $Method = 'GET',
        [string] $Origin = $allowedOrigin,
        [string] $Body,
        [Microsoft.PowerShell.Commands.WebRequestSession] $Session
    )

    $parameters = @{
        Uri = "http://127.0.0.1:$Port$Path"
        Method = $Method
        Headers = @{ Authorization = "Bearer $Token"; Origin = $Origin }
        SkipHttpErrorCheck = $true
    }
    if ($PSBoundParameters.ContainsKey('Body')) {
        $parameters.ContentType = 'application/json'
        $parameters.Body = $Body
    }
    if ($Session) { $parameters.WebSession = $Session }
    return Invoke-WebRequest @parameters
}

$stdout1 = Join-Path $outputPath 'wrapper-first.stdout.log'
$stderr1 = Join-Path $outputPath 'wrapper-first.stderr.log'
$token1 = New-Secret
$service1 = Start-Wrapper -ControlToken $token1 -ReadyPath $readyFile -OutLog $stdout1 -ErrorLog $stderr1
$ready1 = Wait-Ready -Process $service1 -ReadyPath $readyFile -ErrorLog $stderr1
$serviceCommandLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($service1.Id)" -ErrorAction Stop).CommandLine
$tokenPresentInArguments = $serviceCommandLine.Contains($token1)
$listeners1 = @(Get-NetTCPConnection -OwningProcess $service1.Id -State Listen -ErrorAction Stop)
$loopbackOnly = $listeners1.Count -gt 0 -and @($listeners1 | Where-Object { $_.LocalAddress -notin @('127.0.0.1', '::1') }).Count -eq 0
if (-not $loopbackOnly -or $ready1.address -ne '127.0.0.1') { throw 'Real API wrapper opened a non-loopback listener' }

$missingAuth = Invoke-WebRequest -Uri "http://127.0.0.1:$($ready1.port)/health" -Headers @{ Origin = $allowedOrigin } -SkipHttpErrorCheck
$wrongAuth = Invoke-WrapperRequest -Port $ready1.port -Path '/health' -Token 'not-the-token'
$wrongOrigin = Invoke-WrapperRequest -Port $ready1.port -Path '/health' -Token $token1 -Origin 'https://untrusted.example'
$health = Invoke-WrapperRequest -Port $ready1.port -Path '/health' -Token $token1
if ($missingAuth.StatusCode -ne 401 -or $wrongAuth.StatusCode -ne 401 -or $wrongOrigin.StatusCode -ne 403 -or $health.StatusCode -ne 200) {
    throw 'Wrapper authentication, origin, or health response was unexpected'
}

$ownerSession = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$wrongBootstrapBody = @{
    identifier = 'owner@example.test'; displayName = 'Research Owner'; password = $password
    organizationName = 'WIN-004 Family'; timezone = 'America/New_York'; bootstrapToken = ('x' * 32)
} | ConvertTo-Json -Compress
$wrongBootstrap = Invoke-WrapperRequest -Port $ready1.port -Path '/api/v1/bootstrap' -Token $token1 -Method POST -Body $wrongBootstrapBody -Session $ownerSession
$bootstrapBody = @{
    identifier = 'owner@example.test'; displayName = 'Research Owner'; password = $password
    organizationName = 'WIN-004 Family'; timezone = 'America/New_York'; bootstrapToken = $bootstrapToken
} | ConvertTo-Json -Compress
$bootstrap = Invoke-WrapperRequest -Port $ready1.port -Path '/api/v1/bootstrap' -Token $token1 -Method POST -Body $bootstrapBody -Session $ownerSession
$bootstrapPayload = $bootstrap.Content | ConvertFrom-Json
$session1 = Invoke-WrapperRequest -Port $ready1.port -Path '/api/v1/session' -Token $token1 -Session $ownerSession
if ($wrongBootstrap.StatusCode -ne 403 -or $bootstrap.StatusCode -ne 201 -or $session1.StatusCode -ne 200) {
    throw 'Protected real API bootstrap or session failed through the wrapper'
}

$duplicateReady = Join-Path $lab 'duplicate-ready.json'
$duplicateOut = Join-Path $outputPath 'wrapper-duplicate.stdout.log'
$duplicateError = Join-Path $outputPath 'wrapper-duplicate.stderr.log'
$duplicateToken = New-Secret
$duplicate = Start-Wrapper -ControlToken $duplicateToken -ReadyPath $duplicateReady -OutLog $duplicateOut -ErrorLog $duplicateError
if (-not $duplicate.WaitForExit(10000)) {
    Stop-Process -Id $duplicate.Id -Force -ErrorAction SilentlyContinue
    throw 'Duplicate real API wrapper did not reject ownership promptly'
}
if ($duplicate.ExitCode -ne 73 -or (Test-Path -LiteralPath $duplicateReady)) {
    throw "Duplicate real API wrapper guard failed with exit code $($duplicate.ExitCode)"
}

Stop-Process -Id $service1.Id -Force
$service1.WaitForExit(5000) | Out-Null
$stdout2 = Join-Path $outputPath 'wrapper-restart.stdout.log'
$stderr2 = Join-Path $outputPath 'wrapper-restart.stderr.log'
$readyFile2 = Join-Path $lab 'ready-restarted.json'
$token2 = New-Secret
$service2 = Start-Wrapper -ControlToken $token2 -ReadyPath $readyFile2 -OutLog $stdout2 -ErrorLog $stderr2
$ready2 = Wait-Ready -Process $service2 -ReadyPath $readyFile2 -ErrorLog $stderr2
$restartedSession = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$signInBody = @{ identifier = 'owner@example.test'; password = $password } | ConvertTo-Json -Compress
$signIn = Invoke-WrapperRequest -Port $ready2.port -Path '/api/v1/auth/sign-in' -Token $token2 -Method POST -Body $signInBody -Session $restartedSession
$session2 = Invoke-WrapperRequest -Port $ready2.port -Path '/api/v1/session' -Token $token2 -Session $restartedSession
$retainedOrganization = $bootstrapPayload.organization.id -eq ($session2.Content | ConvertFrom-Json).organization.id
if ($signIn.StatusCode -ne 200 -or $session2.StatusCode -ne 200 -or -not $retainedOrganization) {
    throw 'Real API wrapper did not recover owner state after forced restart'
}
$shutdown = Invoke-WrapperRequest -Port $ready2.port -Path '/__desktop/shutdown' -Token $token2 -Method POST
if ($shutdown.StatusCode -ne 202 -or -not $service2.WaitForExit(10000) -or $service2.ExitCode -ne 0) {
    Stop-Process -Id $service2.Id -Force -ErrorAction SilentlyContinue
    throw 'Real API wrapper graceful shutdown failed'
}

$orphanData = Join-Path $lab 'orphan-data'
$orphanReady = Join-Path $lab 'orphan-ready.json'
$orphanPidFile = Join-Path $lab 'orphan-child.pid'
$orphanToken = New-Secret
$controlTokens.Add($orphanToken)
New-Item -ItemType Directory -Force -Path $orphanData | Out-Null
$env:APIARYLENS_CONTROL_TOKEN = $orphanToken
$env:APIARYLENS_ALLOWED_ORIGIN = $allowedOrigin
$env:APIARYLENS_DATA_DIRECTORY = $orphanData
$env:APIARYLENS_READY_FILE = $orphanReady
$env:APIARYLENS_INSTANCE_NAME = "${instanceName}-orphan"
$env:APIARYLENS_BOOTSTRAP_TOKEN = $bootstrapToken
$env:APIARYLENS_AUTH_ROOT_SECRET = $authRootSecret
$env:WIN004_NODE_PATH = $node
$env:WIN004_FIXTURE_PATH = $fixture
$env:WIN004_CHILD_PID_FILE = $orphanPidFile
try {
    $orphanParent = Start-Process -FilePath (Get-Command pwsh.exe -ErrorAction Stop).Source -ArgumentList @('-NoProfile', '-File', $orphanParentFixture) -PassThru -WindowStyle Hidden
} finally {
    Remove-Item Env:APIARYLENS_CONTROL_TOKEN, Env:APIARYLENS_ALLOWED_ORIGIN, Env:APIARYLENS_DATA_DIRECTORY, Env:APIARYLENS_READY_FILE, Env:APIARYLENS_INSTANCE_NAME, Env:APIARYLENS_BOOTSTRAP_TOKEN, Env:APIARYLENS_AUTH_ROOT_SECRET, Env:WIN004_NODE_PATH, Env:WIN004_FIXTURE_PATH, Env:WIN004_CHILD_PID_FILE -ErrorAction SilentlyContinue
}
if (-not $orphanParent.WaitForExit(10000) -or $orphanParent.ExitCode -ne 0) {
    Stop-Process -Id $orphanParent.Id -Force -ErrorAction SilentlyContinue
    throw 'Orphan-parent wrapper fixture did not start its child'
}
$orphanChildPid = [int] (Get-Content -Raw -LiteralPath $orphanPidFile)
$orphanExited = $false
foreach ($attempt in 1..60) {
    if (-not (Get-Process -Id $orphanChildPid -ErrorAction SilentlyContinue)) { $orphanExited = $true; break }
    Start-Sleep -Milliseconds 250
}
if (-not $orphanExited) {
    Stop-Process -Id $orphanChildPid -Force -ErrorAction SilentlyContinue
    throw 'Real API wrapper did not exit when its supervising parent disappeared'
}

$readySecretFree = -not (Get-Content -Raw -LiteralPath $readyFile).Contains($token1)
$readyRemoved = -not (Test-Path -LiteralPath $readyFile2)
$orphanReadyRemoved = -not (Test-Path -LiteralPath $orphanReady)
$firewallRuleCount = @(Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object DisplayName -like "*$instanceName*").Count
$databasePath = Join-Path $dataDirectory 'apiarylens.sqlite'
$databaseExists = Test-Path -LiteralPath $databasePath
$logFiles = @(Get-ChildItem -LiteralPath $outputPath -File)
$secretFound = $false
foreach ($logFile in $logFiles) {
    $content = Get-Content -Raw -LiteralPath $logFile.FullName -ErrorAction SilentlyContinue
    foreach ($secret in @($controlTokens) + @($bootstrapToken, $authRootSecret, $password)) {
        if ($content -and $content.Contains($secret)) { $secretFound = $true }
    }
}
if ($secretFound -or $tokenPresentInArguments -or -not $readySecretFree) {
    throw 'A credential escaped the wrapper process-environment boundary'
}

$result = [ordered]@{
    measuredAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    sourceCommit = $env:GITHUB_SHA
    sourceRunId = $env:GITHUB_RUN_ID
    nodeVersion = (& $node --version)
    listenerAddresses = @($listeners1.LocalAddress | Sort-Object -Unique)
    desktopLoopbackRequirementPassed = $loopbackOnly
    missingControlAuthenticationStatus = $missingAuth.StatusCode
    wrongControlAuthenticationStatus = $wrongAuth.StatusCode
    wrongOriginStatus = $wrongOrigin.StatusCode
    authorizedRealHealthStatus = $health.StatusCode
    wrongBootstrapTokenStatus = $wrongBootstrap.StatusCode
    ownerBootstrapStatus = $bootstrap.StatusCode
    createdSessionStatus = $session1.StatusCode
    duplicateInstanceExitCode = $duplicate.ExitCode
    forcedTerminationExitCode = $service1.ExitCode
    signInAfterForcedRestartStatus = $signIn.StatusCode
    restartedSessionStatus = $session2.StatusCode
    organizationIdRetained = $retainedOrganization
    restartedWithDifferentPort = $ready1.port -ne $ready2.port
    gracefulShutdownExitCode = $service2.ExitCode
    readyFileRemovedOnGracefulShutdown = $readyRemoved
    childExitedAfterParentDeath = $orphanExited
    orphanReadyFileRemoved = $orphanReadyRemoved
    matchingFirewallRuleCount = $firewallRuleCount
    databaseExistsAfterShutdown = $databaseExists
    tokenPresentInChildArguments = $tokenPresentInArguments
    readyFileContainsSecret = -not $readySecretFree
    secretFoundInEvidence = $secretFound
    limitations = @(
        'Disposable research wrapper, not the selected Electron or Tauri host bridge',
        'GitHub-hosted Windows Server runner rather than a retail Windows profile',
        'Windows credential protection, per-user ACLs, and Job Objects are not exercised'
    )
}
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputPath 'measurement.json') -Encoding utf8NoBOM
$result | ConvertTo-Json -Depth 8

