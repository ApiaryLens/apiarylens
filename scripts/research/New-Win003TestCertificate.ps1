[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$runnerTemp = [System.IO.Path]::GetFullPath($env:RUNNER_TEMP)
$pfxPath = Join-Path $runnerTemp 'win003-ephemeral-code-signing.pfx'
$cerPath = Join-Path $runnerTemp 'win003-ephemeral-code-signing.cer'
$passwordBytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($passwordBytes)
$passwordText = [Convert]::ToBase64String($passwordBytes)
$rsa = [System.Security.Cryptography.RSA]::Create(3072)
$request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
    'CN=ApiaryLens WIN-003 Ephemeral Test Signing',
    $rsa,
    [System.Security.Cryptography.HashAlgorithmName]::SHA256,
    [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
)
$oids = [System.Security.Cryptography.OidCollection]::new()
[void] $oids.Add([System.Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.3', 'Code Signing'))
$request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($oids, $false))
$request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
    [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature,
    $true
))
$certificate = $request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5), [DateTimeOffset]::UtcNow.AddDays(2))
[System.IO.File]::WriteAllBytes($pfxPath, $certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pkcs12, $passwordText))
[System.IO.File]::WriteAllBytes($cerPath, $certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))

$myStore = [System.Security.Cryptography.X509Certificates.X509Store]::new('My', [System.Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser)
try {
    $myStore.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    $myStore.Add($certificate)
} finally {
    $myStore.Close()
}

Write-Output "::add-mask::$passwordText"
@(
    "WINDOWS_CERTIFICATE_FILE=$pfxPath"
    "WINDOWS_CERTIFICATE_PASSWORD=$passwordText"
    "WIN003_CERT_THUMBPRINT=$($certificate.Thumbprint)"
) | Add-Content -LiteralPath $env:GITHUB_ENV -Encoding utf8

[ordered]@{
    subject = $certificate.Subject
    thumbprint = $certificate.Thumbprint
    notAfter = $certificate.NotAfter.ToUniversalTime().ToString('o')
    purpose = 'Ephemeral test signing only; private key is destroyed with the hosted runner'
} | ConvertTo-Json
