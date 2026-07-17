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
    throw "Research fixture must remain under the runner temporary directory: $runnerTemp"
}
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$secret = [byte[]]::new(96)
$entropy = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($secret)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($entropy)
$ciphertext = $null

try {
    $ciphertext = [System.Security.Cryptography.ProtectedData]::Protect(
        $secret,
        $entropy,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    $roundTrip = [System.Security.Cryptography.ProtectedData]::Unprotect(
        $ciphertext,
        $entropy,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    $sameMachineRoundTrip =
        $roundTrip.Length -eq $secret.Length -and
        [System.Security.Cryptography.CryptographicOperations]::FixedTimeEquals($secret, $roundTrip)
    [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($roundTrip)
    if (-not $sameMachineRoundTrip) { throw 'Source runner DPAPI round-trip failed' }

    $ciphertextContainsPlaintext = [Convert]::ToHexString($ciphertext).Contains([Convert]::ToHexString($secret))
    if ($ciphertextContainsPlaintext) { throw 'DPAPI fixture contains the synthetic plaintext sequence' }

    [System.IO.File]::WriteAllBytes((Join-Path $outputPath 'protected.bin'), $ciphertext)
    [System.IO.File]::WriteAllBytes((Join-Path $outputPath 'entropy.bin'), $entropy)

    [ordered]@{
        syntheticFixture = $true
        dpapiScope = 'CurrentUser'
        sourceSameMachineRoundTrip = $sameMachineRoundTrip
        ciphertextContainsPlaintext = $ciphertextContainsPlaintext
        plaintextOrIdentityWrittenToFixture = $false
    } | ConvertTo-Json -Compress
} finally {
    [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($secret)
    [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($entropy)
    if ($ciphertext) { [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($ciphertext) }
}
