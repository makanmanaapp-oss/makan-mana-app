# Membuktikan bahawa artifak keluaran BENAR-BENAR mengandungi sumber yang
# dikatakan dibina daripadanya.
#
# MENGAPA INI WUJUD. `flutter build` boleh melaporkan "√ Built" sambil
# menghasilkan binari LAMA. Dibuktikan pada repo ini (21 Sep 2026): selepas
# satu rentetan sumber diubah, `flutter build appbundle --release` menulis
# AAB baharu yang masih membawa `libapp.so` binaan sebelumnya - Flutter
# mengkompil semula AOT (perantaraan `jniLibs/.../libapp.so` MEMANG berubah)
# tetapi tugas pembungkusan Gradle memakai salinan lama. Binaan "berjaya",
# ujian lulus, dan tiada apa-apa dalam log menunjukkan masalah. Kelas
# kegagalan yang sama pernah menghantar build-12 ke Play tanpa pembaikannya.
#
# Skrip ini tidak mempercayai log binaan. Ia membaca BAIT dalam artifak.
#
# Contoh:
#   pwsh scripts/release_provenance/Verify-ReleaseProvenance.ps1 `
#        -Flavor prod -Artifact aab -Markers 'Bahagian ini tidak dapat dimuatkan sekarang.'
#
# Keluar 0 hanya jika SETIAP penanda dijumpai dan kawalan negatif TIADA.

[CmdletBinding()]
param(
    [ValidateSet('prod', 'qa')]
    [string]$Flavor = 'prod',

    [ValidateSet('aab', 'apk')]
    [string]$Artifact = 'aab',

    # Rentetan sumber yang MESTI wujud dalam binari. Pilih rentetan yang
    # diperkenalkan oleh perubahan yang sedang dikeluarkan - itulah gunanya.
    [string[]]$Markers = @('Bahagian ini tidak dapat dimuatkan sekarang.'),

    [string]$Target = 'lib/main.dart',

    # Langkau binaan dan sahkan artifak yang sudah ada. Gunakan HANYA apabila
    # artifak itu baru sahaja dihasilkan oleh larian bersih.
    [switch]$SkipBuild,

    [string]$OutFile
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repo

function Fail($msg) { Write-Host "GAGAL: $msg" -ForegroundColor Red; exit 1 }
function Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

# --- 1. Pokok mesti bersih: artifak yang tidak boleh dipetakan kepada satu
#        commit tidak boleh dibuktikan provenansnya.
Step 'Memeriksa pokok kerja'
$dirty = git status --porcelain
if ($dirty) {
    Write-Host $dirty
    Fail 'pokok kerja tidak bersih - commit atau buang perubahan dahulu'
}
$commit = (git rev-parse HEAD).Trim()
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Host "    commit $commit ($branch)"

# --- 2. Binaan BERSIH. Ini bukan pilihan: binaan tambahan ialah punca
#        artifak basi yang skrip ini wujud untuk menangkap.
if (-not $SkipBuild) {
    Step 'flutter clean'
    flutter clean | Out-Null
    Step 'flutter pub get'
    flutter pub get | Out-Null

    Step "flutter build $Artifact --release --flavor $Flavor"
    if ($Artifact -eq 'aab') {
        flutter build appbundle --release --flavor $Flavor -t $Target
    } else {
        flutter build apk --release --flavor $Flavor -t $Target
    }
    if ($LASTEXITCODE -ne 0) { Fail "binaan gagal (kod $LASTEXITCODE)" }
}

# --- 3. Cari artifak GRADLE, bukan salinan dalam flutter-apk/.
#        Salinan itu boleh menjadi pendua fail lama - itulah yang menyembunyikan
#        masalah ini pada mulanya.
if ($Artifact -eq 'aab') {
    $path = "build/app/outputs/bundle/$($Flavor)Release/app-$Flavor-release.aab"
    $entry = 'base/lib/arm64-v8a/libapp.so'
} else {
    $path = "build/app/outputs/apk/$Flavor/release/app-$Flavor-release.apk"
    $entry = 'lib/arm64-v8a/libapp.so'
}
if (-not (Test-Path $path)) { Fail "artifak tidak dijumpai: $path" }
$info = Get-Item $path
Step "Artifak: $path"
Write-Host ("    saiz {0:N0} bait, ditulis {1}" -f $info.Length, $info.LastWriteTime)

# --- 4. Ekstrak kod Dart yang telah dikompil dan cap keduanya.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $path))
try {
    $e = $zip.Entries | Where-Object { $_.FullName -eq $entry }
    if (-not $e) { Fail "entri tiada dalam artifak: $entry" }
    $ms = New-Object System.IO.MemoryStream
    $s = $e.Open()
    try { $s.CopyTo($ms) } finally { $s.Dispose() }
    $bytes = $ms.ToArray()
} finally { $zip.Dispose() }

$sha = [System.Security.Cryptography.SHA256]::Create()
$artifactSha = ([BitConverter]::ToString($sha.ComputeHash([System.IO.File]::ReadAllBytes((Resolve-Path $path)))) -replace '-', '').ToLower()
$aotSha = ([BitConverter]::ToString($sha.ComputeHash($bytes)) -replace '-', '').ToLower()
Write-Host "    SHA-256 artifak : $artifactSha"
Write-Host "    SHA-256 AOT     : $aotSha ($entry, $($bytes.Length) bait)"

# --- 5. Cari penanda dalam BAIT. Rentetan Dart disimpan sebagai UTF-8 dalam
#        snapshot AOT; Latin1 mengekalkan pemetaan bait-ke-aksara untuk carian.
$hay = [System.Text.Encoding]::Latin1.GetString($bytes)
function Find-Marker($m) {
    $needle = [System.Text.Encoding]::Latin1.GetString([System.Text.Encoding]::UTF8.GetBytes($m))
    return $hay.IndexOf($needle, [StringComparison]::Ordinal) -ge 0
}

Step 'Memeriksa penanda sumber'
$missing = @()
foreach ($m in $Markers) {
    if (Find-Marker $m) {
        Write-Host "    DIJUMPAI : $m" -ForegroundColor Green
    } else {
        Write-Host "    TIADA    : $m" -ForegroundColor Red
        $missing += $m
    }
}

# Kawalan negatif: jika rentetan yang MUSTAHIL ini "dijumpai", carian itu
# sendiri rosak dan keputusan di atas tidak bermakna.
$control = 'FM-KAWALAN-NEGATIF-' + [guid]::NewGuid().ToString('N')
if (Find-Marker $control) { Fail 'kawalan negatif dijumpai - carian rosak' }
Write-Host "    kawalan negatif TIADA (carian waras)" -ForegroundColor Green

if ($missing.Count -gt 0) {
    Write-Host ''
    Write-Host 'ARTIFAK TIDAK SEPADAN DENGAN SUMBER.' -ForegroundColor Red
    Write-Host 'Ini corak AAB basi: Flutter mengkompil semula tetapi Gradle'
    Write-Host 'membungkus libapp.so lama. JANGAN muat naik artifak ini.'
    Write-Host 'Jalankan semula dengan binaan bersih (tanpa -SkipBuild).'
    exit 1
}

# --- 6. Rekod provenans - inilah yang dilampirkan pada keluaran.
$record = @"
REKOD PROVENANS KELUARAN
  dijana      : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
  commit      : $commit
  cawangan    : $branch
  flavor      : $Flavor
  artifak     : $path
  saiz        : $($info.Length) bait
  SHA-256     : $artifactSha
  AOT entri   : $entry
  AOT SHA-256 : $aotSha
  penanda     : $($Markers -join ' | ')
  binaan      : $(if ($SkipBuild) { 'DILANGKAU (artifak sedia ada)' } else { 'bersih (flutter clean + pub get)' })
"@
Write-Host ''
Write-Host $record
if ($OutFile) {
    $record | Out-File -FilePath $OutFile -Encoding utf8
    Write-Host "Rekod ditulis ke $OutFile"
}
exit 0
