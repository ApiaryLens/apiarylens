[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $WebDist,

    [Parameter(Mandatory)]
    [string] $OutputDirectory
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $env:RUNNER_TEMP) { throw 'This research probe is restricted to a hosted runner temporary directory' }
$runnerTemp = [IO.Path]::GetFullPath($env:RUNNER_TEMP)
$webDistPath = (Resolve-Path -LiteralPath $WebDist).Path
$outputPath = [IO.Path]::GetFullPath($OutputDirectory)
if (-not $outputPath.StartsWith($runnerTemp, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Accessibility evidence must remain under the hosted runner temporary directory'
}

$labPath = Join-Path $runnerTemp 'win003-shared-accessibility-lab'
New-Item -ItemType Directory -Force -Path $labPath, $outputPath | Out-Null
$packageJson = @'
{
  "name": "win003-shared-accessibility-research",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "license": "UNLICENSED",
  "dependencies": {
    "axe-core": "4.12.1",
    "playwright": "1.61.1"
  }
}
'@
Set-Content -LiteralPath (Join-Path $labPath 'package.json') -Value $packageJson -Encoding utf8NoBOM
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'win003-shared-accessibility-probe.mjs') -Destination $labPath

Push-Location $labPath
try {
    npm install --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Accessibility lab dependency installation failed' }
    npx playwright install chromium
    if ($LASTEXITCODE -ne 0) { throw 'Playwright Chromium installation failed' }
    node ./win003-shared-accessibility-probe.mjs --web-dist $webDistPath --output (Join-Path $outputPath 'accessibility.json')
    if ($LASTEXITCODE -ne 0) { throw 'Shared UI accessibility probe failed' }
    Copy-Item -LiteralPath (Join-Path $labPath 'package-lock.json') -Destination $outputPath
} finally {
    Pop-Location
}
