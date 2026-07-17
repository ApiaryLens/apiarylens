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

$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$profileRecord = Get-ItemProperty -LiteralPath "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$currentSid" -ErrorAction Stop
$userProfile = [Environment]::ExpandEnvironmentVariables([string] $profileRecord.ProfileImagePath)
$localAppData = Join-Path $userProfile 'AppData\Local'
$roamingAppData = Join-Path $userProfile 'AppData\Roaming'
$commonDocuments = Join-Path $env:SystemDrive 'Users\Public\Documents'
if (-not (Test-Path -LiteralPath $userProfile) -or -not (Test-Path -LiteralPath $commonDocuments)) {
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
$env:USERNAME = [Security.Principal.WindowsIdentity]::GetCurrent().Name.Split('\')[-1]
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null

$arguments = "--win003-cross-user-lab `"$LabDirectory`" --win003-cross-user-action verify-denied --win003-cross-user-output `"$ResultPath`""
$hostProcess = Start-Process -FilePath $HostPath -ArgumentList $arguments -WorkingDirectory $HostWorkingDirectory -PassThru -WindowStyle Hidden
if (-not $hostProcess.WaitForExit(30000)) {
    Stop-Process -Id $hostProcess.Id -Force -ErrorAction SilentlyContinue
    throw 'Alternate-user Electron host exceeded 30 seconds'
}
exit $hostProcess.ExitCode
