[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $ProtectedDirectory
)

$ErrorActionPreference = 'Stop'
$readDenied = $false
$writeDenied = $false

try { Get-Content -Raw -LiteralPath (Join-Path $ProtectedDirectory 'private.txt') | Out-Null }
catch { $readDenied = $true }

try { Set-Content -LiteralPath (Join-Path $ProtectedDirectory 'different-user.txt') -Value 'unexpected' }
catch { $writeDenied = $true }

[ordered]@{ readDenied = $readDenied; writeDenied = $writeDenied } | ConvertTo-Json -Compress
if (-not $readDenied -or -not $writeDenied) { exit 1 }
