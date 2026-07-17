[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $FixtureDirectory,
    [Parameter(Mandatory)]
    [string] $OutputDirectory
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$runnerTemp = [System.IO.Path]::GetFullPath($env:RUNNER_TEMP)
$runnerPrefix = $runnerTemp.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$fixturePath = [System.IO.Path]::GetFullPath($FixtureDirectory)
$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
foreach ($path in @($fixturePath, $outputPath)) {
    if (-not $path.StartsWith($runnerPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Research paths must remain under the runner temporary directory: $runnerTemp"
    }
}
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$ciphertext = [System.IO.File]::ReadAllBytes((Join-Path $fixturePath 'protected.bin'))
$entropy = [System.IO.File]::ReadAllBytes((Join-Path $fixturePath 'entropy.bin'))
$differentComputerDenied = $false

try {
    try {
        $unexpected = [System.Security.Cryptography.ProtectedData]::Unprotect(
            $ciphertext,
            $entropy,
            [System.Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($unexpected)
    } catch [System.Security.Cryptography.CryptographicException] {
        $differentComputerDenied = $true
    }
    if (-not $differentComputerDenied) { throw 'A separate hosted Windows runner decrypted the source runner DPAPI fixture' }

    $localSecret = [byte[]]::new(64)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($localSecret)
    $localCiphertext = [System.Security.Cryptography.ProtectedData]::Protect(
        $localSecret,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    $localRoundTripValue = [System.Security.Cryptography.ProtectedData]::Unprotect(
        $localCiphertext,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    $destinationDpapiRoundTrip =
        $localSecret.Length -eq $localRoundTripValue.Length -and
        [System.Security.Cryptography.CryptographicOperations]::FixedTimeEquals($localSecret, $localRoundTripValue)
    if (-not $destinationDpapiRoundTrip) { throw 'Destination runner DPAPI control round-trip failed' }

    $result = [ordered]@{
        measuredAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
        sourceCommit = $env:GITHUB_SHA
        sourceRunId = $env:GITHUB_RUN_ID
        separateHostedWindowsJob = $true
        syntheticFixture = $true
        dpapiScope = 'CurrentUser'
        differentComputerDecryptionDenied = $differentComputerDenied
        destinationDpapiControlRoundTrip = $destinationDpapiRoundTrip
        usernameOrSidWrittenToEvidence = $false
        plaintextCiphertextEntropyOrHashWrittenToEvidence = $false
        limitation = 'Fresh GitHub-hosted Windows jobs, not two supported retail Windows computers'
    }
    $result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $outputPath 'measurement.json') -Encoding utf8NoBOM
    $result | ConvertTo-Json -Depth 6
} finally {
    [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($ciphertext)
    [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($entropy)
    foreach ($name in @('localSecret', 'localCiphertext', 'localRoundTripValue')) {
        $buffer = Get-Variable -Name $name -ValueOnly -ErrorAction SilentlyContinue
        if ($buffer -is [byte[]]) { [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($buffer) }
    }
}
