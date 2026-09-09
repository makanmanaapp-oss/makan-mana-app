$ErrorActionPreference = "Stop"

$ExpectedBranch = "hotfix/restaurant-menu-scroll-build17-20260909"
$ExpectedPackage = "com.makanmana.apps.qa"
$ExpectedDevice = "R93W904ASMH"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$EvidenceRoot = Join-Path $RepoRoot "qa_evidence\restaurant_menu_scroll"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$EvidenceDir = Join-Path $EvidenceRoot $Stamp
$Apk = Join-Path $RepoRoot "build\app\outputs\flutter-apk\app-qa-release.apk"

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )

    Write-Host ""
    Write-Host "[$Label]" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " MAKANMANA - RESTAURANT MENU SCROLL - REAL DEVICE GATE" -ForegroundColor Cyan
Write-Host " BUILD 17 LINEAGE / QA ONLY / NO PRODUCTION DEPLOY" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $RepoRoot
New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null

$currentBranch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Unable to read current Git branch."
}
if ($currentBranch -ne $ExpectedBranch) {
    throw "Wrong branch. Expected '$ExpectedBranch' but current branch is '$currentBranch'."
}

$dirty = @(git status --porcelain)
if ($LASTEXITCODE -ne 0) {
    throw "Unable to read Git status."
}
if ($dirty.Count -gt 0) {
    Write-Host "Working tree is not clean:" -ForegroundColor Red
    $dirty | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    throw "Abort: commit/stash local changes first so the device proof is reproducible."
}

$head = (git rev-parse HEAD).Trim()
$versionLine = (Select-String -Path (Join-Path $RepoRoot "pubspec.yaml") -Pattern '^version:\s*(.+)$').Matches.Groups[1].Value.Trim()

Write-Host "Branch : $currentBranch" -ForegroundColor Green
Write-Host "HEAD   : $head" -ForegroundColor Green
Write-Host "Version: $versionLine" -ForegroundColor Green
Write-Host "Device : $ExpectedDevice" -ForegroundColor Green
Write-Host "Package: $ExpectedPackage" -ForegroundColor Green

Invoke-Checked -Label "Flutter version" -Command { flutter --version }
Invoke-Checked -Label "ADB version" -Command { adb version }

$deviceState = (& adb -s $ExpectedDevice get-state 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $deviceState -ne "device") {
    Write-Host "adb devices:" -ForegroundColor Yellow
    & adb devices -l
    throw "Samsung QA device '$ExpectedDevice' is not online/authorized."
}

$deviceInfo = @(
    "serial=$ExpectedDevice",
    "model=$((& adb -s $ExpectedDevice shell getprop ro.product.model) -join '' | ForEach-Object { $_.Trim() })",
    "android=$((& adb -s $ExpectedDevice shell getprop ro.build.version.release) -join '' | ForEach-Object { $_.Trim() })",
    "sdk=$((& adb -s $ExpectedDevice shell getprop ro.build.version.sdk) -join '' | ForEach-Object { $_.Trim() })",
    "wm_size=$((& adb -s $ExpectedDevice shell wm size) -join ' ' | ForEach-Object { $_.Trim() })",
    "wm_density=$((& adb -s $ExpectedDevice shell wm density) -join ' ' | ForEach-Object { $_.Trim() })"
)
$deviceInfo | Set-Content -Path (Join-Path $EvidenceDir "device.txt") -Encoding UTF8
$deviceInfo | ForEach-Object { Write-Host $_ }

Invoke-Checked -Label "flutter clean" -Command { flutter clean }
Invoke-Checked -Label "flutter pub get" -Command { flutter pub get }
Invoke-Checked -Label "Targeted Menu vertical-scroll tests" -Command {
    flutter test test/restaurant_detail_menu_scroll_regression_test.dart
}
Invoke-Checked -Label "Restaurant Detail tab contract" -Command {
    flutter test test/restaurant_detail_tabs_test.dart
}
Invoke-Checked -Label "Clean QA RELEASE APK build" -Command {
    flutter build apk --release --flavor qa
}

if (-not (Test-Path $Apk)) {
    throw "Expected QA release APK not found: $Apk"
}

$apkHash = (Get-FileHash -Path $Apk -Algorithm SHA256).Hash.ToLowerInvariant()
$apkSize = (Get-Item $Apk).Length
@(
    "head=$head",
    "branch=$currentBranch",
    "version=$versionLine",
    "apk=$Apk",
    "apk_size=$apkSize",
    "apk_sha256=$apkHash"
) | Set-Content -Path (Join-Path $EvidenceDir "build.txt") -Encoding UTF8

Write-Host ""
Write-Host "QA release APK SHA256: $apkHash" -ForegroundColor Green
Write-Host "QA release APK bytes : $apkSize" -ForegroundColor Green

Write-Host ""
Write-Host "Installing with -r only (preserves QA app data)." -ForegroundColor Cyan
Write-Host "The script will NOT uninstall the app automatically." -ForegroundColor Yellow
$installOutput = (& adb -s $ExpectedDevice install -r $Apk 2>&1 | Out-String).Trim()
$installOutput | Set-Content -Path (Join-Path $EvidenceDir "adb-install.txt") -Encoding UTF8
Write-Host $installOutput
if ($LASTEXITCODE -ne 0 -or $installOutput -notmatch '(?m)^Success\s*$') {
    throw "QA APK install failed. If Android reports a signature mismatch, stop here; do NOT uninstall the existing QA app yet."
}

Invoke-Checked -Label "Force-stop QA" -Command {
    adb -s $ExpectedDevice shell am force-stop $ExpectedPackage
}
Invoke-Checked -Label "Launch QA" -Command {
    adb -s $ExpectedDevice shell monkey -p $ExpectedPackage -c android.intent.category.LAUNCHER 1
}

Start-Sleep -Seconds 2

$packageDump = (& adb -s $ExpectedDevice shell dumpsys package $ExpectedPackage | Out-String)
$packageDump | Select-String -Pattern 'versionCode=|versionName=|firstInstallTime=|lastUpdateTime=' -AllMatches |
    ForEach-Object { $_.Line.Trim() } |
    Set-Content -Path (Join-Path $EvidenceDir "package-version.txt") -Encoding UTF8

Write-Host ""
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host " DEVICE ACTION NEEDED" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "1. Dalam MakanMana QA, buka Restaurant Detail yang ada banyak menu." -ForegroundColor White
Write-Host "2. Tekan tab Menu." -ForegroundColor White
Write-Host "3. Jangan swipe lagi." -ForegroundColor White
Write-Host "4. Kembali ke PowerShell dan tekan ENTER." -ForegroundColor White
Write-Host "5. Selepas recording bermula, cuba swipe Menu naik/turun berulang kali." -ForegroundColor White
Write-Host ""
Read-Host "Tekan ENTER bila sudah berada pada tab Menu"

Invoke-Checked -Label "Clear logcat immediately before reproduction" -Command {
    adb -s $ExpectedDevice logcat -c
}

$remoteVideo = "/sdcard/makanmana-menu-scroll-$Stamp.mp4"
Write-Host ""
Write-Host "RECORDING 30 SAAT BERMULA SEKARANG — cuba scroll Menu naik/turun." -ForegroundColor Magenta
Invoke-Checked -Label "30-second device screen recording" -Command {
    adb -s $ExpectedDevice shell screenrecord --time-limit 30 --bit-rate 8000000 $remoteVideo
}

$localVideo = Join-Path $EvidenceDir "menu-scroll-device.mp4"
Invoke-Checked -Label "Pull device recording" -Command {
    adb -s $ExpectedDevice pull $remoteVideo $localVideo
}

& adb -s $ExpectedDevice shell rm $remoteVideo | Out-Null
& adb -s $ExpectedDevice logcat -d -v threadtime |
    Set-Content -Path (Join-Path $EvidenceDir "logcat.txt") -Encoding UTF8

& adb -s $ExpectedDevice shell dumpsys window windows |
    Set-Content -Path (Join-Path $EvidenceDir "window.txt") -Encoding UTF8

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " REAL-DEVICE EVIDENCE CAPTURE COMPLETE" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "Evidence folder:" -ForegroundColor Cyan
Write-Host $EvidenceDir -ForegroundColor White
Write-Host ""
Write-Host "Files:" -ForegroundColor Cyan
Get-ChildItem $EvidenceDir | ForEach-Object {
    Write-Host (" - {0} ({1} bytes)" -f $_.Name, $_.Length)
}
Write-Host ""
Write-Host "Jangan merge/deploy apa-apa lagi. Hantar menu-scroll-device.mp4 kepada chat untuk frame-by-frame diagnosis." -ForegroundColor Yellow
