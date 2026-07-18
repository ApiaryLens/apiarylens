# NOT PACKED FOR RELEASE, NOT PUSHED. Submission locked until GV4.
# Seeded at C2 (Phase P2 Track Release-eng) from the DIST-002 drafts.
# Silent Squirrel uninstall keeps hive data (app keep-data default, ADR 0016);
# permanent data removal is only available through the in-app removal flow.
$ErrorActionPreference = 'Stop'

# Squirrel registers a per-user uninstall entry under HKCU. Because choco runs
# elevated as the same interactive admin user in the supported scenario, the
# HKCU hive matches the installing user (per-user caveat documented in nuspec).
$uninstallKey = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ApiaryLens' -ErrorAction SilentlyContinue

if ($null -eq $uninstallKey) {
  Write-Warning 'ApiaryLens per-user uninstall entry not found for this user; nothing to do.'
  return
}

# QuietUninstallString is "<localappdata>\ApiaryLens\Update.exe --uninstall -s"
$quiet = $uninstallKey.QuietUninstallString
if (-not $quiet) { $quiet = "$($uninstallKey.UninstallString) -s" }

$exe, $args = $quiet -split ' ', 2
Start-ChocolateyProcessAsAdmin -ExeToRun $exe.Trim('"') -Statements $args -ValidExitCodes @(0)

# Remove the package-manager marker; hive data is intentionally retained.
Remove-Item -Path (Join-Path $env:LOCALAPPDATA 'ApiaryLens\lifecycle\package-manager.json') -Force -ErrorAction SilentlyContinue
