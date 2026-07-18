# NOT PACKED FOR RELEASE, NOT PUSHED. Submission locked until GV4.
# Seeded at C2 (Phase P2 Track Release-eng) from the DIST-002 drafts.
# Placeholders {VERSION} and {SHA256_SETUP_X64} are substituted by the release
# workflow from the published release SHA256SUMS.
$ErrorActionPreference = 'Stop'

$packageArgs = @{
  packageName    = $env:ChocolateyPackageName
  fileType       = 'exe'
  # Squirrel per-user Setup published as an immutable GitHub release asset.
  # Asset name matches the release workflow's published subject
  # (ApiaryLensSetup.exe); the release tag pins the version.
  url64bit       = 'https://github.com/ApiaryLens/apiarylens/releases/download/v{VERSION}/ApiaryLensSetup.exe' # placeholder
  checksum64     = '{SHA256_SETUP_X64}' # placeholder
  checksumType64 = 'sha256'
  # Squirrel Setup silent switch (pattern proven by the github-desktop package).
  silentArgs     = '-s'
  validExitCodes = @(0)
  softwareName   = 'ApiaryLens*'
}

Install-ChocolateyPackage @packageArgs

# R3 dual-updater suppression (Design v2 section 6): record that this install
# is package-manager owned so the app's own Squirrel updater suppresses
# self-apply. Marker path/schema is finalized by the R3 design detail.
$markerDir = Join-Path $env:LOCALAPPDATA 'ApiaryLens\lifecycle'
New-Item -ItemType Directory -Force -Path $markerDir | Out-Null
@{ source = 'chocolatey'; packageVersion = '{VERSION}' } |
  ConvertTo-Json | Set-Content -Path (Join-Path $markerDir 'package-manager.json') -Encoding utf8

Write-Warning 'ApiaryLens installs per-user: it is available only to the Windows account that ran choco.'
