[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $CiphertextPath,
    [Parameter(Mandatory)] [string] $EntropyPath
)

$ErrorActionPreference = 'Stop'
$ciphertext = [System.IO.File]::ReadAllBytes($CiphertextPath)
$entropy = [System.IO.File]::ReadAllBytes($EntropyPath)
$plaintext = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $ciphertext,
    $entropy,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)
try {
    [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($plaintext))
} finally {
    [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($plaintext)
}

