<#
.SYNOPSIS
    Build the isolated QA debug APK.

.DESCRIPTION
    The dart-define is what supplies MM_QA_BACKEND_HOST. Without it the QA build
    BLOCKS at startup - it does not fall back to production - so there is no
    "forgot the flag" build that quietly writes real events.

    Debug only. A release build is refused by the gate itself, because a release
    build cannot be verified as isolated.
#>
[CmdletBinding()]
param(
    [string] $Host_ = '127.0.0.1',
    [switch] $Clean
)

$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repo

$sha = (& git rev-parse HEAD).Trim()
Write-Host "Building QA debug APK from commit $sha" -ForegroundColor Cyan

if ($Clean) { flutter clean; if ($LASTEXITCODE -ne 0) { throw 'flutter clean failed' } }

flutter build apk --debug --flavor qa "--dart-define=MM_QA_BACKEND_HOST=$Host_"
if ($LASTEXITCODE -ne 0) { throw 'flutter build apk failed' }

$apk = 'build\app\outputs\flutter-apk\app-qa-debug.apk'
if (-not (Test-Path $apk)) { throw "Expected APK not found at $apk" }

$hash = (Get-FileHash $apk -Algorithm SHA256).Hash
Write-Host "APK:    $apk"
Write-Host "SHA256: $hash"
Write-Host "Commit: $sha"
