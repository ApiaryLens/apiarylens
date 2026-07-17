[CmdletBinding()]
param(
    [string] $Version = '1.48.0',
    [string] $ExpectedArchiveSha256 = 'B46CB02A47C5B76A1656958757D62AC07D0CB7DE35F92E8A7E02D450CBB53097'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $env:RUNNER_TEMP) { throw 'This research installer is restricted to a hosted runner temporary directory' }
$root = Join-Path ([IO.Path]::GetFullPath($env:RUNNER_TEMP)) "win003-syft-$Version"
$archive = Join-Path $root 'syft.zip'
$expanded = Join-Path $root 'expanded'
New-Item -ItemType Directory -Force -Path $expanded | Out-Null
$uri = "https://github.com/anchore/syft/releases/download/v$Version/syft_${Version}_windows_amd64.zip"
Invoke-WebRequest -Uri $uri -OutFile $archive
$actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
if ($actualHash -ne $ExpectedArchiveSha256) {
    throw "Syft archive SHA-256 mismatch. Expected $ExpectedArchiveSha256; got $actualHash"
}
Expand-Archive -LiteralPath $archive -DestinationPath $expanded -Force
$executable = (Resolve-Path -LiteralPath (Join-Path $expanded 'syft.exe')).Path
$reportedVersion = (& $executable version -o json | ConvertFrom-Json).version
if ($reportedVersion -ne $Version) { throw "Syft reported version $reportedVersion; expected $Version" }

if ($env:GITHUB_ENV) {
    "WIN003_SYFT_PATH=$executable" | Add-Content -LiteralPath $env:GITHUB_ENV -Encoding utf8
    "WIN003_SYFT_VERSION=$reportedVersion" | Add-Content -LiteralPath $env:GITHUB_ENV -Encoding utf8
    "WIN003_SYFT_ARCHIVE_SHA256=$actualHash" | Add-Content -LiteralPath $env:GITHUB_ENV -Encoding utf8
}

[ordered]@{
    version = $reportedVersion
    archiveSha256 = $actualHash
    source = $uri
    executable = $executable
    purpose = 'Pinned disposable WIN-003 SBOM research tool; not a product runtime dependency'
} | ConvertTo-Json
