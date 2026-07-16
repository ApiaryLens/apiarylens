$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$node = $env:WIN004_NODE_PATH
$fixture = $env:WIN004_FIXTURE_PATH
$childPidFile = $env:WIN004_CHILD_PID_FILE
$readyFile = $env:APIARYLENS_READY_FILE
if (-not $node -or -not $fixture -or -not $childPidFile -or -not $readyFile) {
    throw 'Orphan-parent fixture environment is incomplete'
}

$env:APIARYLENS_PARENT_PID = [string] $PID
$child = Start-Process -FilePath $node -ArgumentList @($fixture) -PassThru -WindowStyle Hidden
Set-Content -LiteralPath $childPidFile -Value $child.Id -Encoding ascii
foreach ($attempt in 1..80) {
    if (Test-Path -LiteralPath $readyFile) { exit 0 }
    if ($child.HasExited) { throw "Orphan child exited before ready with code $($child.ExitCode)" }
    Start-Sleep -Milliseconds 100
    $child.Refresh()
}
throw 'Orphan child did not become ready'
