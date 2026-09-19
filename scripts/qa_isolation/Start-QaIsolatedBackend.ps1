<#
.SYNOPSIS
    Start the isolated backend the QA flavour requires.

.DESCRIPTION
    Runs the Firebase emulator suite under the project id `demo-makanmana-qa`.
    The `demo-` prefix is load-bearing: the emulators treat such a project as
    emulator-only and the SDKs cannot reach a real backend with it, so a mistake
    here cannot become a production write.

    The repository's REAL firestore.rules and storage.rules are loaded, so QA
    behaviour matches production behaviour. An unauthenticated read is therefore
    denied - which the app's readiness gate correctly reads as "reachable".

    CONTROL_CENTER_MIRROR_URL_OVERRIDE is set to loopback so a mirror push made
    by a locally executed B5 function cannot reach the production Control
    Center. The function code accepts that override ONLY when it is running in
    the emulator AND the target is loopback (see
    functions/src/controlCenter/mirrorEventPush.ts).

    This script starts nothing that requires a credential and reads no secret.

.NOTES
    Leave this window running. Stop it with Ctrl+C.
#>
[CmdletBinding()]
param(
    [string] $ProjectId = 'demo-makanmana-qa',
    [string] $MirrorOverride = 'http://127.0.0.1:3000/api/internal/sync/mirror'
)

$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repo

if (-not $ProjectId.StartsWith('demo-')) {
    throw "Refusing to start: '$ProjectId' is not a demo- project, so it is not provably emulator-only."
}

Write-Host "Building functions so the emulator serves current code..." -ForegroundColor Cyan
npm --prefix functions run build
if ($LASTEXITCODE -ne 0) { throw 'functions build failed' }

$env:CONTROL_CENTER_MIRROR_URL_OVERRIDE = $MirrorOverride
Write-Host "Mirror pushes redirected to $MirrorOverride" -ForegroundColor Yellow
Write-Host "Starting emulators on project $ProjectId" -ForegroundColor Cyan

firebase emulators:start --project $ProjectId --only auth,firestore,functions,storage
