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

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$serverEntry = Join-Path $repositoryRoot 'apps/api/dist/server.js'
if (-not (Test-Path -LiteralPath $serverEntry)) {
    throw 'Build @apiarylens/server before running the real-process probe'
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
$lab = Join-Path $runnerTemp "win004-real-api-$([guid]::NewGuid().ToString('n'))"
$databasePath = Join-Path $lab 'data/apiarylens.sqlite'
$mediaPath = Join-Path $lab 'data/media'
$stdout1 = Join-Path $outputPath 'first-start.stdout.log'
$stderr1 = Join-Path $outputPath 'first-start.stderr.log'
$stdout2 = Join-Path $outputPath 'restart.stdout.log'
$stderr2 = Join-Path $outputPath 'restart.stderr.log'
New-Item -ItemType Directory -Force -Path $lab | Out-Null

function New-Secret([int] $ByteCount = 32) {
    $bytes = [byte[]]::new($ByteCount)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

$bootstrapToken = New-Secret
$authRootSecret = New-Secret 48
$password = "Win004-$((New-Secret 24))"

function Start-RealApi {
    param([string] $OutLog, [string] $ErrorLog)

    $env:PORT = '0'
    $env:APIARYLENS_DATABASE = $databasePath
    $env:APIARYLENS_MEDIA = $mediaPath
    $env:BOOTSTRAP_TOKEN = $bootstrapToken
    $env:AUTH_ROOT_SECRET = $authRootSecret
    try {
        return Start-Process -FilePath $node -ArgumentList @($serverEntry) -WorkingDirectory $repositoryRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $OutLog -RedirectStandardError $ErrorLog
    } finally {
        Remove-Item Env:PORT, Env:APIARYLENS_DATABASE, Env:APIARYLENS_MEDIA, Env:BOOTSTRAP_TOKEN, Env:AUTH_ROOT_SECRET -ErrorAction SilentlyContinue
    }
}

function Wait-Listener([System.Diagnostics.Process] $Process, [string] $ErrorLog) {
    foreach ($attempt in 1..100) {
        $listeners = @(Get-NetTCPConnection -OwningProcess $Process.Id -State Listen -ErrorAction SilentlyContinue)
        if ($listeners.Count -gt 0) { return $listeners }
        $Process.Refresh()
        if ($Process.HasExited) {
            throw "Real API exited before listening with code $($Process.ExitCode): $(Get-Content -Raw -LiteralPath $ErrorLog -ErrorAction SilentlyContinue)"
        }
        Start-Sleep -Milliseconds 100
    }
    throw 'Real API did not open a listener within ten seconds'
}

function Stop-RealApi([System.Diagnostics.Process] $Process) {
    if (-not $Process.HasExited) {
        Stop-Process -Id $Process.Id -Force
        $Process.WaitForExit(5000) | Out-Null
    }
}

$service1 = Start-RealApi -OutLog $stdout1 -ErrorLog $stderr1
try {
    $listeners1 = @(Wait-Listener -Process $service1 -ErrorLog $stderr1)
    $port1 = [int] $listeners1[0].LocalPort
    $baseUri1 = "http://127.0.0.1:$port1"
    $health1 = Invoke-WebRequest -Uri "$baseUri1/health" -SkipHttpErrorCheck
    $bootstrapStatus1 = Invoke-WebRequest -Uri "$baseUri1/api/v1/bootstrap/status" -SkipHttpErrorCheck

    $wrongBootstrapBody = @{
        identifier = 'owner@example.test'
        displayName = 'Research Owner'
        password = $password
        organizationName = 'WIN-004 Family'
        timezone = 'America/New_York'
        bootstrapToken = ('x' * 32)
    } | ConvertTo-Json -Compress
    $wrongBootstrap = Invoke-WebRequest -Uri "$baseUri1/api/v1/bootstrap" -Method Post -ContentType 'application/json' -Body $wrongBootstrapBody -SkipHttpErrorCheck

    $bootstrapBody = @{
        identifier = 'owner@example.test'
        displayName = 'Research Owner'
        password = $password
        organizationName = 'WIN-004 Family'
        timezone = 'America/New_York'
        bootstrapToken = $bootstrapToken
    } | ConvertTo-Json -Compress
    $bootstrap = Invoke-WebRequest -Uri "$baseUri1/api/v1/bootstrap" -Method Post -ContentType 'application/json' -Body $bootstrapBody -SessionVariable ownerSession -SkipHttpErrorCheck
    $bootstrapPayload = $bootstrap.Content | ConvertFrom-Json
    if ($health1.StatusCode -ne 200 -or $wrongBootstrap.StatusCode -ne 403 -or $bootstrap.StatusCode -ne 201) {
        throw 'The real API health or bootstrap lifecycle returned an unexpected status'
    }
    $session1 = Invoke-WebRequest -Uri "$baseUri1/api/v1/session" -WebSession $ownerSession -SkipHttpErrorCheck
    if ($session1.StatusCode -ne 200) { throw 'The real API did not accept its newly created session' }
} finally {
    Stop-RealApi -Process $service1
}

$service2 = Start-RealApi -OutLog $stdout2 -ErrorLog $stderr2
try {
    $listeners2 = @(Wait-Listener -Process $service2 -ErrorLog $stderr2)
    $port2 = [int] $listeners2[0].LocalPort
    $baseUri2 = "http://127.0.0.1:$port2"
    $bootstrapStatus2 = Invoke-WebRequest -Uri "$baseUri2/api/v1/bootstrap/status" -SkipHttpErrorCheck
    $signInBody = @{ identifier = 'owner@example.test'; password = $password } | ConvertTo-Json -Compress
    $signIn = Invoke-WebRequest -Uri "$baseUri2/api/v1/auth/sign-in" -Method Post -ContentType 'application/json' -Body $signInBody -SessionVariable restartedSession -SkipHttpErrorCheck
    if ($bootstrapStatus2.StatusCode -ne 200 -or ($bootstrapStatus2.Content | ConvertFrom-Json).available -ne $false -or $signIn.StatusCode -ne 200) {
        throw 'Owner state or authentication did not survive forced process restart'
    }
    $session2 = Invoke-WebRequest -Uri "$baseUri2/api/v1/session" -WebSession $restartedSession -SkipHttpErrorCheck
    if ($session2.StatusCode -ne 200) { throw 'Restarted session check failed' }
} finally {
    Stop-RealApi -Process $service2
}

$listenerAddresses = @($listeners1.LocalAddress | Sort-Object -Unique)
$loopbackOnly = $listenerAddresses.Count -gt 0 -and @($listenerAddresses | Where-Object { $_ -notin @('127.0.0.1', '::1') }).Count -eq 0
$advertisedLoopback = (Get-Content -Raw -LiteralPath $stdout1).Contains("http://127.0.0.1:$port1")
$databaseExists = Test-Path -LiteralPath $databasePath
$logFiles = @($stdout1, $stderr1, $stdout2, $stderr2)
$secretFound = $false
foreach ($logFile in $logFiles) {
    $content = Get-Content -Raw -LiteralPath $logFile -ErrorAction SilentlyContinue
    if ($content -and ($content.Contains($bootstrapToken) -or $content.Contains($authRootSecret) -or $content.Contains($password))) {
        $secretFound = $true
    }
}
if ($secretFound) { throw 'A credential entered the real-process research logs' }

$result = [ordered]@{
    measuredAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    sourceCommit = $env:GITHUB_SHA
    sourceRunId = $env:GITHUB_RUN_ID
    nodeVersion = (& $node --version)
    exactServerEntry = 'apps/api/dist/server.js'
    listenerAddresses = $listenerAddresses
    desktopLoopbackRequirementPassed = $loopbackOnly
    consoleAdvertisedLoopback = $advertisedLoopback
    consoleAddressMatchesActualListener = $advertisedLoopback -and $loopbackOnly
    firstPort = $port1
    restartPort = $port2
    restartedWithDifferentPort = $port1 -ne $port2
    healthStatus = $health1.StatusCode
    bootstrapStatusBefore = ($bootstrapStatus1.Content | ConvertFrom-Json)
    wrongBootstrapTokenStatus = $wrongBootstrap.StatusCode
    ownerBootstrapStatus = $bootstrap.StatusCode
    createdSessionStatus = $session1.StatusCode
    bootstrapStatusAfterRestart = ($bootstrapStatus2.Content | ConvertFrom-Json)
    signInAfterForcedRestartStatus = $signIn.StatusCode
    restartedSessionStatus = $session2.StatusCode
    organizationIdRetained = ($bootstrapPayload.organization.id -eq ($session2.Content | ConvertFrom-Json).organization.id)
    databaseExistsAfterRestart = $databaseExists
    secretFoundInEvidence = $secretFound
    limitations = @(
        'GitHub-hosted Windows Server runner rather than a retail Windows profile',
        'The exact portable server has no desktop control-token or parent-supervision wrapper',
        'Organization-isolation negatives run in the adjacent exact-commit API test step'
    )
}
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputPath 'measurement.json') -Encoding utf8NoBOM
$result | ConvertTo-Json -Depth 8

