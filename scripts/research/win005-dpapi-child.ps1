[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $CiphertextPath,
    [Parameter(Mandatory)] [string] $EntropyPath,
    [switch] $ExpectDenied
)

$ErrorActionPreference = 'Stop'
$ciphertext = [System.IO.File]::ReadAllBytes($CiphertextPath)
$entropy = [System.IO.File]::ReadAllBytes($EntropyPath)
try {
    $plaintext = [System.Security.Cryptography.ProtectedData]::Unprotect(
        $ciphertext,
        $entropy,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    try {
        if ($ExpectDenied) { exit 2 }
        [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($plaintext))
    } finally {
        [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($plaintext)
    }
} catch [System.Security.Cryptography.CryptographicException] {
    if ($ExpectDenied) { 'denied'; exit 0 }
    throw
}
