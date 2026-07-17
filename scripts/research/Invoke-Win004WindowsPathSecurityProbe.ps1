[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $OutputDirectory,
    [switch] $TestDifferentUser
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
$runnerTemp = [System.IO.Path]::GetFullPath($env:RUNNER_TEMP)
$runnerPrefix = $runnerTemp.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $outputPath.StartsWith($runnerPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Research evidence must remain under the runner temporary directory: $runnerTemp"
}
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

function Resolve-SafeChildPath {
    param(
        [Parameter(Mandatory)] [string] $Root,
        [Parameter(Mandatory)] [string] $RelativePath
    )

    if ([System.IO.Path]::IsPathRooted($RelativePath)) { throw 'rooted_path_rejected' }
    $segments = $RelativePath -split '[\\/]'
    if ($segments.Count -eq 0 -or @($segments | Where-Object { $_ -in @('', '.', '..') }).Count -gt 0) {
        throw 'unsafe_segment_rejected'
    }
    $rootFull = [System.IO.Path]::GetFullPath($Root)
    $rootPrefix = $rootFull.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $rootFull $RelativePath))
    if (-not $candidate.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'path_escape_rejected'
    }
    $cursor = $rootFull
    foreach ($segment in $segments) {
        $cursor = Join-Path $cursor $segment
        if (Test-Path -LiteralPath $cursor) {
            $attributes = [System.IO.File]::GetAttributes($cursor)
            if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw 'reparse_point_rejected'
            }
        }
    }
    return $candidate
}

function Set-CurrentUserOnlyDirectoryAcl([string] $Path) {
    $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $systemSid = [System.Security.Principal.SecurityIdentifier]::new(
        [System.Security.Principal.WellKnownSidType]::LocalSystemSid,
        $null
    )
    $acl = [System.Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    $inheritance = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
    $propagation = [System.Security.AccessControl.PropagationFlags]::None
    $rights = [System.Security.AccessControl.FileSystemRights]::FullControl
    foreach ($sid in @($currentSid, $systemSid)) {
        $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
            $sid,
            $rights,
            $inheritance,
            $propagation,
            [System.Security.AccessControl.AccessControlType]::Allow
        )
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}

$publicRoot = [System.IO.Path]::GetFullPath([Environment]::GetFolderPath([Environment+SpecialFolder]::CommonDocuments))
$publicPrefix = $publicRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$lab = [System.IO.Path]::GetFullPath((Join-Path $publicRoot "ApiaryLens-WIN004-Path-$([guid]::NewGuid().ToString('n'))"))
if (-not $lab.StartsWith($publicPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Path-security lab escaped Public Documents'
}

$protected = Join-Path $lab 'protected-data'
$outside = Join-Path $lab 'outside-data'
$publicChild = Join-Path $lab 'child'
$temporaryUserName = $null
$temporaryPasswordText = $null
$temporaryPassword = $null
$differentUserDenied = $null
$differentUserCleanupPassed = $null

try {
    New-Item -ItemType Directory -Force -Path $protected, $outside, $publicChild | Out-Null
    Set-Content -LiteralPath (Join-Path $protected 'private.txt') -Value 'private-path-probe' -Encoding utf8NoBOM
    Set-Content -LiteralPath (Join-Path $outside 'sentinel.txt') -Value 'outside-unchanged' -Encoding utf8NoBOM
    Set-CurrentUserOnlyDirectoryAcl $protected

    $acl = Get-Acl -LiteralPath $protected
    $currentSidValue = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $systemSidValue = [System.Security.Principal.SecurityIdentifier]::new(
        [System.Security.Principal.WellKnownSidType]::LocalSystemSid,
        $null
    ).Value
    $explicitAllowSids = @(
        $acl.Access |
            Where-Object { -not $_.IsInherited -and $_.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow } |
            ForEach-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value } |
            Sort-Object -Unique
    )
    $aclPrincipalsRestricted = [bool] $acl.AreAccessRulesProtected -and
        @($explicitAllowSids | Where-Object { $_ -notin @($currentSidValue, $systemSidValue) }).Count -eq 0 -and
        $currentSidValue -in $explicitAllowSids -and $systemSidValue -in $explicitAllowSids
    if (-not $aclPrincipalsRestricted) { throw 'Protected directory ACL contains an unexpected principal' }

    $normalDirectory = Join-Path $protected 'media'
    New-Item -ItemType Directory -Path $normalDirectory | Out-Null
    $normalPath = Resolve-SafeChildPath -Root $protected -RelativePath 'media\asset.bin'
    $normalPathAccepted = $normalPath.StartsWith($protected, [System.StringComparison]::OrdinalIgnoreCase)

    $traversalRejected = $false
    try { Resolve-SafeChildPath -Root $protected -RelativePath '..\outside-data\sentinel.txt' | Out-Null }
    catch { $traversalRejected = $_.Exception.Message -match 'unsafe_segment|path_escape' }

    $junction = Join-Path $protected 'redirect'
    New-Item -ItemType Junction -Path $junction -Target $outside | Out-Null
    $reparseRejected = $false
    try { Resolve-SafeChildPath -Root $protected -RelativePath 'redirect\sentinel.txt' | Out-Null }
    catch { $reparseRejected = $_.Exception.Message -eq 'reparse_point_rejected' }
    $outsideSentinelUnchanged = (Get-Content -Raw -LiteralPath (Join-Path $outside 'sentinel.txt')).Trim() -eq 'outside-unchanged'

    if ($TestDifferentUser) {
        $temporaryUserName = "alw4$([guid]::NewGuid().ToString('n').Substring(0, 8))"
        $randomBytes = [byte[]]::new(24)
        [System.Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
        $temporaryPasswordText = "W4-$(([Convert]::ToHexString($randomBytes)))!"
        [System.Array]::Clear($randomBytes, 0, $randomBytes.Length)
        $temporaryPassword = ConvertTo-SecureString -String $temporaryPasswordText -AsPlainText -Force
        try {
            New-LocalUser -Name $temporaryUserName -Password $temporaryPassword -AccountNeverExpires -PasswordNeverExpires -UserMayNotChangePassword | Out-Null
            $childScript = Join-Path $publicChild 'path-access-child.ps1'
            Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'win004-path-access-child.ps1') -Destination $childScript
            $childOutput = Join-Path $publicChild 'child.stdout.log'
            $childError = Join-Path $publicChild 'child.stderr.log'
            $credential = [pscredential]::new("$env:COMPUTERNAME\$temporaryUserName", $temporaryPassword)
            $child = Start-Process -FilePath (Get-Command pwsh.exe -ErrorAction Stop).Source -Credential $credential -ArgumentList @('-NoProfile', '-File', $childScript, '-ProtectedDirectory', $protected) -WorkingDirectory $publicChild -PassThru -WindowStyle Hidden -RedirectStandardOutput $childOutput -RedirectStandardError $childError
            if (-not $child.WaitForExit(30000) -or $child.ExitCode -ne 0) {
                Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue
                throw "Different-user ACL child failed: $(Get-Content -Raw -LiteralPath $childError -ErrorAction SilentlyContinue)"
            }
            $childResult = Get-Content -Raw -LiteralPath $childOutput | ConvertFrom-Json
            $differentUserDenied = [bool] $childResult.readDenied -and [bool] $childResult.writeDenied
        } finally {
            $temporaryPasswordText = $null
            $credential = $null
            $temporaryPassword = $null
            if ($temporaryUserName) { Remove-LocalUser -Name $temporaryUserName -ErrorAction SilentlyContinue }
            $differentUserCleanupPassed = $null -eq (Get-LocalUser -Name $temporaryUserName -ErrorAction SilentlyContinue)
        }
    }

    if (-not $normalPathAccepted -or -not $traversalRejected -or -not $reparseRejected -or -not $outsideSentinelUnchanged -or ($TestDifferentUser -and (-not $differentUserDenied -or -not $differentUserCleanupPassed))) {
        throw 'One or more Windows path-security acceptance checks failed'
    }

    $result = [ordered]@{
        measuredAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
        sourceCommit = $env:GITHUB_SHA
        sourceRunId = $env:GITHUB_RUN_ID
        aclInheritanceDisabled = [bool] $acl.AreAccessRulesProtected
        aclExplicitPrincipalsRestrictedToCurrentUserAndSystem = $aclPrincipalsRestricted
        normalChildPathAccepted = $normalPathAccepted
        traversalPathRejected = $traversalRejected
        junctionReparsePathRejected = $reparseRejected
        outsideSentinelUnchanged = $outsideSentinelUnchanged
        differentUserTestRequested = [bool] $TestDifferentUser
        differentUserReadAndWriteDenied = $differentUserDenied
        disposableDifferentUserCleanupPassed = $differentUserCleanupPassed
        usernameOrSidWrittenToEvidence = $false
        passwordWrittenToArgumentsOrEvidence = $false
        limitations = @(
            'Hosted Windows profile and disposable directories, not the selected signed host package',
            'Tests current-user and SYSTEM ACL ownership; roaming, RDP, and locked-workstation behavior remain open',
            'Safe path resolver is research evidence and is not product implementation'
        )
    }
    $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputPath 'measurement.json') -Encoding utf8NoBOM
    $result | ConvertTo-Json -Depth 8
} finally {
    $temporaryPasswordText = $null
    $temporaryPassword = $null
    if ($temporaryUserName) { Remove-LocalUser -Name $temporaryUserName -ErrorAction SilentlyContinue }
    Remove-Item -LiteralPath $lab -Recurse -Force -ErrorAction SilentlyContinue
}
