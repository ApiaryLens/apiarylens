[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $OutputDirectory
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
$runnerTemp = [System.IO.Path]::GetFullPath($env:RUNNER_TEMP)
if (-not $outputPath.StartsWith($runnerTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Research evidence must remain under the runner temporary directory: $runnerTemp"
}
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$fixture = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'win004-local-service-fixture.mjs')).Path
$orphanParentFixture = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'win004-orphan-parent-fixture.ps1')).Path
$node = (Get-Command node.exe -ErrorAction Stop).Source
$lab = Join-Path $runnerTemp 'win004-local-service-lab'
$dataDirectory = Join-Path $lab 'per-user-data'
$readyFile = Join-Path $lab 'ready.json'
$stdout = Join-Path $outputPath 'service.stdout.log'
$stderr = Join-Path $outputPath 'service.stderr.log'
$instanceName = "ApiaryLens-WIN004-$($env:GITHUB_RUN_ID)"
$allowedOrigin = 'http://apiarylens.localhost'
New-Item -ItemType Directory -Force -Path $lab, $dataDirectory | Out-Null

function New-ControlToken {
    $bytes = [byte[]]::new(32)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Start-ResearchService {
    param(
        [Parameter(Mandatory)] [string] $ControlToken,
        [Parameter(Mandatory)] [string] $ReadyPath,
        [Parameter(Mandatory)] [string] $OutLog,
        [Parameter(Mandatory)] [string] $ErrorLog
    )
    Remove-Item -LiteralPath $ReadyPath -Force -ErrorAction SilentlyContinue
    $env:APIARYLENS_CONTROL_TOKEN = $ControlToken
    $env:APIARYLENS_ALLOWED_ORIGIN = $allowedOrigin
    $env:APIARYLENS_DATA_DIRECTORY = $dataDirectory
    $env:APIARYLENS_READY_FILE = $ReadyPath
    $env:APIARYLENS_PARENT_PID = [string] $PID
    $env:APIARYLENS_INSTANCE_NAME = $instanceName
    try {
        return Start-Process -FilePath $node -ArgumentList @($fixture) -PassThru -WindowStyle Hidden -RedirectStandardOutput $OutLog -RedirectStandardError $ErrorLog
    } finally {
        Remove-Item Env:APIARYLENS_CONTROL_TOKEN, Env:APIARYLENS_ALLOWED_ORIGIN, Env:APIARYLENS_DATA_DIRECTORY, Env:APIARYLENS_READY_FILE, Env:APIARYLENS_PARENT_PID, Env:APIARYLENS_INSTANCE_NAME -ErrorAction SilentlyContinue
    }
}

function Wait-Ready {
    param([System.Diagnostics.Process] $Process, [string] $ReadyPath)
    foreach ($attempt in 1..80) {
        if (Test-Path -LiteralPath $ReadyPath) {
            return Get-Content -Raw -LiteralPath $ReadyPath | ConvertFrom-Json
        }
        if ($Process.HasExited) { throw "Research service exited before ready with code $($Process.ExitCode)" }
        Start-Sleep -Milliseconds 100
        $Process.Refresh()
    }
    throw 'Research service did not become ready'
}

function Invoke-ServiceRequest {
    param(
        [Parameter(Mandatory)] [int] $Port,
        [Parameter(Mandatory)] [string] $Path,
        [Parameter(Mandatory)] [string] $Token,
        [ValidateSet('GET', 'POST')] [string] $Method = 'GET',
        [string] $Origin = $allowedOrigin,
        [string] $Body
    )
    $headers = @{ Authorization = "Bearer $Token"; Origin = $Origin }
    $parameters = @{
        Uri = "http://127.0.0.1:$Port$Path"
        Method = $Method
        Headers = $headers
        SkipHttpErrorCheck = $true
    }
    if ($PSBoundParameters.ContainsKey('Body')) {
        $parameters.ContentType = 'application/json'
        $parameters.Body = $Body
    }
    return Invoke-WebRequest @parameters
}

$token1 = New-ControlToken
$service1 = Start-ResearchService -ControlToken $token1 -ReadyPath $readyFile -OutLog $stdout -ErrorLog $stderr
$ready1 = Wait-Ready -Process $service1 -ReadyPath $readyFile
$serviceCommandLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($service1.Id)" -ErrorAction Stop).CommandLine
$tokenPresentInChildArguments = $serviceCommandLine.Contains($token1)

$listeners = @(Get-NetTCPConnection -OwningProcess $service1.Id -State Listen -ErrorAction Stop)
$loopbackOnly = $listeners.Count -gt 0 -and @($listeners | Where-Object LocalAddress -notin @('127.0.0.1', '::1')).Count -eq 0
if (-not $loopbackOnly -or $ready1.address -ne '127.0.0.1') { throw 'Service opened a non-loopback listener' }

$missingAuth = Invoke-WebRequest -Uri "http://127.0.0.1:$($ready1.port)/health" -Headers @{ Origin = $allowedOrigin } -SkipHttpErrorCheck
$wrongAuth = Invoke-ServiceRequest -Port $ready1.port -Path '/health' -Token 'not-the-token'
$wrongOrigin = Invoke-ServiceRequest -Port $ready1.port -Path '/health' -Token $token1 -Origin 'https://untrusted.example'
$health = Invoke-ServiceRequest -Port $ready1.port -Path '/health' -Token $token1
if ($missingAuth.StatusCode -ne 401 -or $wrongAuth.StatusCode -ne 401 -or $wrongOrigin.StatusCode -ne 403 -or $health.StatusCode -ne 200) {
    throw 'Local authentication or origin boundary returned an unexpected status'
}

$recordId = [guid]::NewGuid().ToString('n')
$create = Invoke-ServiceRequest -Port $ready1.port -Path '/records' -Token $token1 -Method POST -Body (@{ id = $recordId; value = 'survives-crash-restart' } | ConvertTo-Json -Compress)
if ($create.StatusCode -ne 201) { throw 'Service did not persist the research record' }

$duplicateReady = Join-Path $lab 'duplicate-ready.json'
$duplicateOut = Join-Path $outputPath 'duplicate.stdout.log'
$duplicateError = Join-Path $outputPath 'duplicate.stderr.log'
$duplicateToken = New-ControlToken
$duplicate = Start-ResearchService -ControlToken $duplicateToken -ReadyPath $duplicateReady -OutLog $duplicateOut -ErrorLog $duplicateError
if (-not $duplicate.WaitForExit(10000)) {
    Stop-Process -Id $duplicate.Id -Force -ErrorAction SilentlyContinue
    throw 'Duplicate service instance did not reject ownership promptly'
}
if ($duplicate.ExitCode -ne 73 -or (Test-Path -LiteralPath $duplicateReady)) {
    throw "Duplicate service guard failed with exit code $($duplicate.ExitCode)"
}

Stop-Process -Id $service1.Id -Force
$service1.WaitForExit(5000) | Out-Null
$token2 = New-ControlToken
$readyFile2 = Join-Path $lab 'ready-restarted.json'
$stdout2 = Join-Path $outputPath 'service-restarted.stdout.log'
$stderr2 = Join-Path $outputPath 'service-restarted.stderr.log'
$service2 = Start-ResearchService -ControlToken $token2 -ReadyPath $readyFile2 -OutLog $stdout2 -ErrorLog $stderr2
$ready2 = Wait-Ready -Process $service2 -ReadyPath $readyFile2
$records = Invoke-ServiceRequest -Port $ready2.port -Path '/records' -Token $token2
$recordsBody = $records.Content | ConvertFrom-Json
$recordSurvived = $null -ne ($recordsBody.records | Where-Object id -eq $recordId)
if (-not $recordSurvived) { throw 'SQLite record did not survive forced service restart' }

$httpClient = [System.Net.Http.HttpClient]::new()
$concurrentRequests = [System.Collections.Generic.List[System.Net.Http.HttpRequestMessage]]::new()
$concurrentTasks = [System.Collections.Generic.List[System.Threading.Tasks.Task[System.Net.Http.HttpResponseMessage]]]::new()
foreach ($index in 1..8) {
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, "http://127.0.0.1:$($ready2.port)/health")
    $request.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $token2)
    $request.Headers.Add('Origin', $allowedOrigin)
    $concurrentRequests.Add($request)
    $concurrentTasks.Add($httpClient.SendAsync($request))
}
[System.Threading.Tasks.Task]::WaitAll([System.Threading.Tasks.Task[]] $concurrentTasks.ToArray())
$concurrentStatuses = @($concurrentTasks | ForEach-Object { [int] $_.Result.StatusCode })
$concurrentClientsPassed = @($concurrentStatuses | Where-Object { $_ -ne 200 }).Count -eq 0
$concurrentRequests | ForEach-Object Dispose
$concurrentTasks | ForEach-Object { $_.Result.Dispose() }
$httpClient.Dispose()
if (-not $concurrentClientsPassed) { throw 'Concurrent authorized clients did not all receive healthy responses' }

$shutdown = Invoke-ServiceRequest -Port $ready2.port -Path '/shutdown' -Token $token2 -Method POST
if ($shutdown.StatusCode -ne 202 -or -not $service2.WaitForExit(10000) -or $service2.ExitCode -ne 0) {
    Stop-Process -Id $service2.Id -Force -ErrorAction SilentlyContinue
    throw 'Authenticated graceful shutdown failed'
}

$orphanToken = New-ControlToken
$orphanData = Join-Path $lab 'orphan-data'
$orphanReady = Join-Path $lab 'orphan-ready.json'
$orphanChildPidFile = Join-Path $lab 'orphan-child.pid'
New-Item -ItemType Directory -Force -Path $orphanData | Out-Null
$env:APIARYLENS_CONTROL_TOKEN = $orphanToken
$env:APIARYLENS_ALLOWED_ORIGIN = $allowedOrigin
$env:APIARYLENS_DATA_DIRECTORY = $orphanData
$env:APIARYLENS_READY_FILE = $orphanReady
$env:APIARYLENS_INSTANCE_NAME = "${instanceName}-orphan"
$env:WIN004_NODE_PATH = $node
$env:WIN004_FIXTURE_PATH = $fixture
$env:WIN004_CHILD_PID_FILE = $orphanChildPidFile
try {
    $orphanParent = Start-Process -FilePath (Get-Command pwsh.exe -ErrorAction Stop).Source -ArgumentList @('-NoProfile', '-File', $orphanParentFixture) -PassThru -WindowStyle Hidden
} finally {
    Remove-Item Env:APIARYLENS_CONTROL_TOKEN, Env:APIARYLENS_ALLOWED_ORIGIN, Env:APIARYLENS_DATA_DIRECTORY, Env:APIARYLENS_READY_FILE, Env:APIARYLENS_INSTANCE_NAME, Env:WIN004_NODE_PATH, Env:WIN004_FIXTURE_PATH, Env:WIN004_CHILD_PID_FILE -ErrorAction SilentlyContinue
}
if (-not $orphanParent.WaitForExit(10000) -or $orphanParent.ExitCode -ne 0) {
    Stop-Process -Id $orphanParent.Id -Force -ErrorAction SilentlyContinue
    throw 'Orphan-parent fixture did not start its child successfully'
}
$orphanChildPid = [int] (Get-Content -Raw -LiteralPath $orphanChildPidFile)
$orphanExited = $false
foreach ($attempt in 1..60) {
    if (-not (Get-Process -Id $orphanChildPid -ErrorAction SilentlyContinue)) {
        $orphanExited = $true
        break
    }
    Start-Sleep -Milliseconds 250
}
if (-not $orphanExited) {
    Stop-Process -Id $orphanChildPid -Force -ErrorAction SilentlyContinue
    throw 'Service did not exit when its supervising parent disappeared'
}
$orphanReadyRemoved = -not (Test-Path -LiteralPath $orphanReady)
$firewallRuleCount = @(Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object DisplayName -like "*$instanceName*").Count

$databasePath = Join-Path $dataDirectory 'apiarylens-research.sqlite3'
$databaseExists = Test-Path -LiteralPath $databasePath
$readyRemoved = -not (Test-Path -LiteralPath $readyFile2)
$logFiles = @(Get-ChildItem -LiteralPath $outputPath -File)
$leakedSecret = $false
foreach ($logFile in $logFiles) {
    $content = Get-Content -Raw -LiteralPath $logFile.FullName -ErrorAction SilentlyContinue
    if ($content -and ($content.Contains($token1) -or $content.Contains($token2) -or $content.Contains($duplicateToken) -or $content.Contains($orphanToken))) {
        $leakedSecret = $true
    }
}
if ($leakedSecret) { throw 'A control token entered research evidence' }

$result = [ordered]@{
    measuredAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    sourceCommit = $env:GITHUB_SHA
    sourceRunId = $env:GITHUB_RUN_ID
    nodeVersion = (& $node --version)
    sqliteVersion = ($health.Content | ConvertFrom-Json).schemaVersion
    readyFileContainsSecret = (Get-Content -Raw -LiteralPath $readyFile).Contains($token1)
    tokenPresentInChildArguments = $tokenPresentInChildArguments
    loopbackOnly = $loopbackOnly
    listenerAddresses = @($listeners.LocalAddress | Sort-Object -Unique)
    missingAuthenticationStatus = $missingAuth.StatusCode
    wrongAuthenticationStatus = $wrongAuth.StatusCode
    wrongOriginStatus = $wrongOrigin.StatusCode
    authorizedHealthStatus = $health.StatusCode
    schemaVersion = ($health.Content | ConvertFrom-Json).schemaVersion
    duplicateInstanceExitCode = $duplicate.ExitCode
    forcedCrashExitCode = $service1.ExitCode
    recordSurvivedForcedRestart = $recordSurvived
    restartedWithDifferentPort = $ready1.port -ne $ready2.port
    concurrentAuthorizedClientCount = $concurrentStatuses.Count
    concurrentAuthorizedClientsPassed = $concurrentClientsPassed
    gracefulShutdownExitCode = $service2.ExitCode
    readyFileRemovedOnGracefulShutdown = $readyRemoved
    childExitedAfterParentDeath = $orphanExited
    orphanReadyFileRemoved = $orphanReadyRemoved
    matchingFirewallRuleCount = $firewallRuleCount
    databaseExistsAfterShutdown = $databaseExists
    secretFoundInEvidence = $leakedSecret
    dataDirectory = 'runner-temporary per-user research directory'
    limitations = @(
        'Hosted Windows Server runner rather than a retail Windows profile',
        'Research fixture rather than the ApiaryLens production server',
        'Credential Manager storage and host-to-renderer secret transfer were not exercised'
    )
}
if ($result.readyFileContainsSecret -or $result.tokenPresentInChildArguments) { throw 'Control token escaped the process environment boundary' }
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputPath 'measurement.json') -Encoding utf8NoBOM
$result | ConvertTo-Json -Depth 8
