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

if (-not ('Win005.CredentialManager' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

namespace Win005 {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    internal struct Credential {
        internal UInt32 Flags;
        internal UInt32 Type;
        internal string TargetName;
        internal string Comment;
        internal System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        internal UInt32 CredentialBlobSize;
        internal IntPtr CredentialBlob;
        internal UInt32 Persist;
        internal UInt32 AttributeCount;
        internal IntPtr Attributes;
        internal string TargetAlias;
        internal string UserName;
    }

    public static class CredentialManager {
        private const UInt32 Generic = 1;
        private const UInt32 PersistLocalMachine = 2;

        [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool CredWrite(ref Credential credential, UInt32 flags);

        [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credential);

        [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool CredDelete(string target, UInt32 type, UInt32 flags);

        [DllImport("advapi32.dll", EntryPoint = "CredFree", SetLastError = false)]
        private static extern void CredFree(IntPtr buffer);

        public static int Write(string target, byte[] secret) {
            IntPtr blob = Marshal.AllocHGlobal(secret.Length);
            try {
                Marshal.Copy(secret, 0, blob, secret.Length);
                var credential = new Credential {
                    Type = Generic,
                    TargetName = target,
                    CredentialBlobSize = (UInt32)secret.Length,
                    CredentialBlob = blob,
                    Persist = PersistLocalMachine,
                    UserName = Environment.UserName
                };
                return CredWrite(ref credential, 0) ? 0 : Marshal.GetLastWin32Error();
            } finally {
                for (int index = 0; index < secret.Length; index++) Marshal.WriteByte(blob, index, 0);
                Marshal.FreeHGlobal(blob);
            }
        }

        public static byte[] Read(string target, out int error) {
            IntPtr pointer;
            if (!CredRead(target, Generic, 0, out pointer)) {
                error = Marshal.GetLastWin32Error();
                return null;
            }
            try {
                var credential = Marshal.PtrToStructure<Credential>(pointer);
                var result = new byte[credential.CredentialBlobSize];
                Marshal.Copy(credential.CredentialBlob, result, 0, result.Length);
                error = 0;
                return result;
            } finally {
                CredFree(pointer);
            }
        }

        public static int Delete(string target) {
            return CredDelete(target, Generic, 0) ? 0 : Marshal.GetLastWin32Error();
        }
    }
}
'@
}

function New-RandomBytes([int] $Length) {
    $bytes = [byte[]]::new($Length)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return $bytes
}

function Test-EqualBytes([byte[]] $Left, [byte[]] $Right) {
    return $Left.Length -eq $Right.Length -and [System.Security.Cryptography.CryptographicOperations]::FixedTimeEquals($Left, $Right)
}

function Test-UnprotectRejected([byte[]] $Ciphertext, [byte[]] $Entropy) {
    try {
        $unexpected = [System.Security.Cryptography.ProtectedData]::Unprotect(
            $Ciphertext,
            $Entropy,
            [System.Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($unexpected)
        return $false
    } catch [System.Security.Cryptography.CryptographicException] {
        return $true
    }
}

$target = "ApiaryLens/WIN005/$([guid]::NewGuid().ToString('n'))/connected-session"
$firstSecret = New-RandomBytes 64
$replacementSecret = New-RandomBytes 64
$oversizedSecret = New-RandomBytes 2561
$dpapiSecret = New-RandomBytes 96
$entropy = New-RandomBytes 32
$lab = Join-Path $runnerTemp "win005-dpapi-$([guid]::NewGuid().ToString('n'))"
$ciphertextPath = Join-Path $lab 'protected.bin'
$entropyPath = Join-Path $lab 'entropy.bin'
$differentUserDenied = $null
$differentUserCleanupPassed = $null
$temporaryUserName = $null
$differentUserLab = $null
New-Item -ItemType Directory -Force -Path $lab | Out-Null

try {
    $writeError = [Win005.CredentialManager]::Write($target, $firstSecret)
    $readError = -1
    $readSecret = [Win005.CredentialManager]::Read($target, [ref] $readError)
    $initialRoundTrip = $writeError -eq 0 -and $readError -eq 0 -and (Test-EqualBytes $firstSecret $readSecret)

    $replaceError = [Win005.CredentialManager]::Write($target, $replacementSecret)
    $replacementReadError = -1
    $replacementRead = [Win005.CredentialManager]::Read($target, [ref] $replacementReadError)
    $replacementRoundTrip = $replaceError -eq 0 -and $replacementReadError -eq 0 -and (Test-EqualBytes $replacementSecret $replacementRead)

    $oversizedError = [Win005.CredentialManager]::Write($target, $oversizedSecret)
    $postOversizeReadError = -1
    $postOversizeRead = [Win005.CredentialManager]::Read($target, [ref] $postOversizeReadError)
    $oversizedRejectedWithoutReplacement = $oversizedError -ne 0 -and $postOversizeReadError -eq 0 -and (Test-EqualBytes $replacementSecret $postOversizeRead)

    $deleteError = [Win005.CredentialManager]::Delete($target)
    $missingReadError = -1
    $missingRead = [Win005.CredentialManager]::Read($target, [ref] $missingReadError)
    $deleteAndMissingPassed = $deleteError -eq 0 -and $null -eq $missingRead -and $missingReadError -ne 0

    $ciphertext = [System.Security.Cryptography.ProtectedData]::Protect(
        $dpapiSecret,
        $entropy,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    $unprotected = [System.Security.Cryptography.ProtectedData]::Unprotect(
        $ciphertext,
        $entropy,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    $dpapiRoundTrip = Test-EqualBytes $dpapiSecret $unprotected
    $wrongEntropy = New-RandomBytes 32
    $wrongEntropyRejected = Test-UnprotectRejected $ciphertext $wrongEntropy
    $missingEntropyRejected = Test-UnprotectRejected $ciphertext $null
    $corruptCiphertext = [byte[]] $ciphertext.Clone()
    $corruptCiphertext[[math]::Floor($corruptCiphertext.Length / 2)] = $corruptCiphertext[[math]::Floor($corruptCiphertext.Length / 2)] -bxor 0xff
    $corruptCiphertextRejected = Test-UnprotectRejected $corruptCiphertext $entropy
    $ciphertextContainsPlaintext = [Convert]::ToHexString($ciphertext).Contains([Convert]::ToHexString($dpapiSecret))

    [System.IO.File]::WriteAllBytes($ciphertextPath, $ciphertext)
    [System.IO.File]::WriteAllBytes($entropyPath, $entropy)
    $childScript = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'win005-dpapi-child.ps1')).Path
    $childOut = Join-Path $lab 'child.stdout.log'
    $childError = Join-Path $lab 'child.stderr.log'
    $child = Start-Process -FilePath (Get-Command pwsh.exe -ErrorAction Stop).Source -ArgumentList @('-NoProfile', '-File', $childScript, '-CiphertextPath', $ciphertextPath, '-EntropyPath', $entropyPath) -PassThru -WindowStyle Hidden -RedirectStandardOutput $childOut -RedirectStandardError $childError
    if (-not $child.WaitForExit(15000) -or $child.ExitCode -ne 0) {
        Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue
        throw "Same-user DPAPI child failed: $(Get-Content -Raw -LiteralPath $childError -ErrorAction SilentlyContinue)"
    }
    $expectedHash = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($dpapiSecret))
    $crossProcessSameUserPassed = (Get-Content -Raw -LiteralPath $childOut).Trim() -eq $expectedHash

    if ($TestDifferentUser) {
        $temporaryUserName = "alw5$([guid]::NewGuid().ToString('n').Substring(0, 8))"
        $temporaryPasswordText = "W5-$((New-RandomBytes 24 | ForEach-Object { $_.ToString('x2') }) -join '')!"
        $temporaryPassword = ConvertTo-SecureString -String $temporaryPasswordText -AsPlainText -Force
        try {
            New-LocalUser -Name $temporaryUserName -Password $temporaryPassword -AccountNeverExpires -PasswordNeverExpires -UserMayNotChangePassword | Out-Null
            $publicRoot = [System.IO.Path]::GetFullPath([Environment]::GetFolderPath([Environment+SpecialFolder]::CommonDocuments))
            $publicPrefix = $publicRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
            $differentUserLab = [System.IO.Path]::GetFullPath((Join-Path $publicRoot "ApiaryLens-WIN005-$([guid]::NewGuid().ToString('n'))"))
            if (-not $differentUserLab.StartsWith($publicPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Different-user lab escaped the Public Documents root' }
            New-Item -ItemType Directory -Force -Path $differentUserLab | Out-Null
            $differentCiphertext = Join-Path $differentUserLab 'protected.bin'
            $differentEntropy = Join-Path $differentUserLab 'entropy.bin'
            $differentChildScript = Join-Path $differentUserLab 'dpapi-child.ps1'
            [System.IO.File]::WriteAllBytes($differentCiphertext, $ciphertext)
            [System.IO.File]::WriteAllBytes($differentEntropy, $entropy)
            Copy-Item -LiteralPath $childScript -Destination $differentChildScript
            $differentOut = Join-Path $differentUserLab 'child.stdout.log'
            $differentError = Join-Path $differentUserLab 'child.stderr.log'
            $credential = [pscredential]::new("$env:COMPUTERNAME\$temporaryUserName", $temporaryPassword)
            $differentChild = Start-Process -FilePath (Get-Command pwsh.exe -ErrorAction Stop).Source -Credential $credential -ArgumentList @('-NoProfile', '-File', $differentChildScript, '-CiphertextPath', $differentCiphertext, '-EntropyPath', $differentEntropy, '-ExpectDenied') -WorkingDirectory $differentUserLab -PassThru -WindowStyle Hidden -RedirectStandardOutput $differentOut -RedirectStandardError $differentError
            if (-not $differentChild.WaitForExit(30000) -or $differentChild.ExitCode -ne 0) {
                Stop-Process -Id $differentChild.Id -Force -ErrorAction SilentlyContinue
                throw "Different-user DPAPI child failed: $(Get-Content -Raw -LiteralPath $differentError -ErrorAction SilentlyContinue)"
            }
            $differentUserDenied = (Get-Content -Raw -LiteralPath $differentOut).Trim() -eq 'denied'
            if (-not $differentUserDenied) { throw 'A different Windows user was not denied DPAPI decryption' }
        } finally {
            $temporaryPasswordText = $null
            $credential = $null
            $temporaryPassword = $null
            if ($differentUserLab) { Remove-Item -LiteralPath $differentUserLab -Recurse -Force -ErrorAction SilentlyContinue }
            if ($temporaryUserName) { Remove-LocalUser -Name $temporaryUserName -ErrorAction SilentlyContinue }
            $differentUserCleanupPassed = $null -eq (Get-LocalUser -Name $temporaryUserName -ErrorAction SilentlyContinue) -and (-not $differentUserLab -or -not (Test-Path -LiteralPath $differentUserLab))
        }
    }

    if (-not $initialRoundTrip -or -not $replacementRoundTrip -or -not $oversizedRejectedWithoutReplacement -or -not $deleteAndMissingPassed -or -not $dpapiRoundTrip -or -not $wrongEntropyRejected -or -not $missingEntropyRejected -or -not $corruptCiphertextRejected -or $ciphertextContainsPlaintext -or -not $crossProcessSameUserPassed -or ($TestDifferentUser -and (-not $differentUserDenied -or -not $differentUserCleanupPassed))) {
        throw 'One or more Windows credential-protection acceptance checks failed'
    }

    $result = [ordered]@{
        measuredAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
        sourceCommit = $env:GITHUB_SHA
        sourceRunId = $env:GITHUB_RUN_ID
        windowsIdentityScope = 'current-runner-user'
        credentialType = 'CRED_TYPE_GENERIC'
        credentialPersistence = 'CRED_PERSIST_LOCAL_MACHINE'
        credentialInitialRoundTrip = $initialRoundTrip
        credentialReplacementRoundTrip = $replacementRoundTrip
        credentialOversizedBlobBytes = $oversizedSecret.Length
        credentialOversizedWriteRejected = $oversizedError -ne 0
        credentialOversizedWriteError = $oversizedError
        credentialRetainedPriorValueAfterOversizedWrite = $oversizedRejectedWithoutReplacement
        credentialDeletePassed = $deleteError -eq 0
        credentialMissingReadError = $missingReadError
        dpapiScope = 'CurrentUser'
        dpapiRoundTrip = $dpapiRoundTrip
        dpapiWrongEntropyRejected = $wrongEntropyRejected
        dpapiMissingEntropyRejected = $missingEntropyRejected
        dpapiCorruptCiphertextRejected = $corruptCiphertextRejected
        dpapiCiphertextContainsPlaintext = $ciphertextContainsPlaintext
        dpapiCrossProcessSameUserRoundTrip = $crossProcessSameUserPassed
        dpapiDifferentUserTestRequested = [bool] $TestDifferentUser
        dpapiDifferentUserDenied = $differentUserDenied
        disposableDifferentUserCleanupPassed = $differentUserCleanupPassed
        secretsWrittenToArguments = $false
        secretsWrittenToEvidence = $false
        cleanupCredentialDeleted = $deleteError -eq 0
        limitations = @(
            'Direct Windows API research through PowerShell P/Invoke, not a product runtime dependency',
            $(if ($TestDifferentUser) { 'Different-computer DPAPI denial is not exercised' } else { 'Different-user and different-computer DPAPI denial are not exercised' }),
            'Electron and Tauri host bridges are not exercised'
        )
    }
    $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputPath 'measurement.json') -Encoding utf8NoBOM
    $result | ConvertTo-Json -Depth 8
} finally {
    [Win005.CredentialManager]::Delete($target) | Out-Null
    foreach ($variableName in @('firstSecret', 'replacementSecret', 'oversizedSecret', 'dpapiSecret', 'entropy', 'readSecret', 'replacementRead', 'postOversizeRead', 'unprotected', 'wrongEntropy', 'corruptCiphertext')) {
        $buffer = Get-Variable -Name $variableName -ValueOnly -ErrorAction SilentlyContinue
        if ($buffer -is [System.Array]) { [System.Array]::Clear($buffer, 0, $buffer.Length) }
    }
    Remove-Item -LiteralPath $lab -Recurse -Force -ErrorAction SilentlyContinue
    if ($differentUserLab) { Remove-Item -LiteralPath $differentUserLab -Recurse -Force -ErrorAction SilentlyContinue }
    if ($temporaryUserName) { Remove-LocalUser -Name $temporaryUserName -ErrorAction SilentlyContinue }
}
