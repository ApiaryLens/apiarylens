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
$securePassword = ConvertTo-SecureString -String $passwordText -AsPlainText -Force
$certificate = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject 'CN=ApiaryLens WIN-003 Ephemeral Test Signing' `
    -CertStoreLocation 'Cert:\CurrentUser\My' `
    -KeyAlgorithm RSA `
    -KeyLength 3072 `
    -HashAlgorithm SHA256 `
    -NotAfter ([DateTimeOffset]::UtcNow.AddDays(2).UtcDateTime)

Export-PfxCertificate -Cert $certificate -FilePath $pfxPath -Password $securePassword | Out-Null
Export-Certificate -Cert $certificate -FilePath $cerPath -Type CERT | Out-Null
Import-Certificate -FilePath $cerPath -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null

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
