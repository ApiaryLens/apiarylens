[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $HostPath,

    [Parameter(Mandatory)]
    [string] $HostWorkingDirectory,

    [Parameter(Mandatory)]
    [string] $LabDirectory,

    [Parameter(Mandatory)]
    [string] $ResultPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$userProfile = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
$localAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
$roamingAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)
$commonDocuments = [Environment]::GetFolderPath([Environment+SpecialFolder]::CommonDocuments)
if (-not $userProfile -or -not $localAppData -or -not $roamingAppData -or -not $commonDocuments) {
    throw 'Disposable user profile directories were unavailable'
}

$env:USERPROFILE = $userProfile
$env:LOCALAPPDATA = $localAppData
$env:APPDATA = $roamingAppData
$env:PUBLIC = Split-Path -Parent $commonDocuments
$env:TEMP = Join-Path $localAppData 'Temp'
$env:TMP = $env:TEMP
$env:HOMEDRIVE = [IO.Path]::GetPathRoot($userProfile).TrimEnd('\')
$env:HOMEPATH = $userProfile.Substring([IO.Path]::GetPathRoot($userProfile).Length - 1)
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null

$arguments = "--win003-cross-user-lab `"$LabDirectory`" --win003-cross-user-action verify-denied --win003-cross-user-output `"$ResultPath`""
$hostProcess = Start-Process -FilePath $HostPath -ArgumentList $arguments -WorkingDirectory $HostWorkingDirectory -PassThru -WindowStyle Hidden
if (-not $hostProcess.WaitForExit(30000)) {
    Stop-Process -Id $hostProcess.Id -Force -ErrorAction SilentlyContinue
    throw 'Alternate-user Electron host exceeded 30 seconds'
}
exit $hostProcess.ExitCode
