# Pengesahan macOS — perkara yang Windows tidak boleh buktikan

**MACOS REQUIRED.** Setiap langkah di sini memerlukan Xcode. Tiada satu pun
telah dijalankan. Jangan tandakan mana-mana daripadanya LULUS berdasarkan
ujian sumber.

Jalankan mengikut urutan. Berhenti pada kegagalan pertama.

---

## A. Prasyarat

```bash
flutter clean
flutter pub get
cd ios && pod install --repo-update && cd ..
python ios/scripts/validate_pbxproj.py     # mesti kekal exit 0
```

Buka **`Runner.xcworkspace`**, bukan `.xcodeproj`, selepas `pod install`.

---

## B. Bundle identifier diselesaikan mengikut flavour

```bash
cd ios
for c in Debug-prod Profile-prod Release-prod Debug-qa Profile-qa Release-qa; do
  echo "--- $c"
  xcodebuild -showBuildSettings -project Runner.xcodeproj -target Runner \
    -configuration "$c" 2>/dev/null \
    | grep -E "PRODUCT_BUNDLE_IDENTIFIER|MM_DISPLAY_NAME|MM_FLAVOR|IPHONEOS_DEPLOYMENT_TARGET"
done
```

Dijangka:

| Konfigurasi | `PRODUCT_BUNDLE_IDENTIFIER` | `MM_DISPLAY_NAME` | `MM_FLAVOR` |
| --- | --- | --- | --- |
| `*-prod` | `com.makanmana.apps` | `MakanMana` | `prod` |
| `*-qa` | `com.makanmana.apps.qa` | `MakanMana QA` | `qa` |

Kesemuanya `IPHONEOS_DEPLOYMENT_TARGET = 15.0`.

Semak juga konfigurasi asal — ia mesti kekal produksi:

```bash
for c in Debug Profile Release; do
  xcodebuild -showBuildSettings -project Runner.xcodeproj -target Runner \
    -configuration "$c" 2>/dev/null | grep -E "MM_DISPLAY_NAME"
done
```

Dijangka `MakanMana` untuk ketiga-tiganya. **Nilai kosong ialah kegagalan** —
ia bermakna aplikasi akan dihantar tanpa nama.

---

## C. Nama paparan muncul pada peranti

Pasang kedua-dua flavour pada peranti yang sama:

```bash
flutter run --flavor prod   # skrin utama: MakanMana
flutter run --flavor qa     # skrin utama: MakanMana QA
```

Kedua-duanya mesti wujud **serentak** — bundle id berbeza, jadi ia tidak
menggantikan satu sama lain. Jika hanya satu ikon muncul, bundle id tidak
diselesaikan mengikut flavour.

---

## D. Penjajaran flavour natif lwn Dart

Ini menutup hazard yang dinamakan dalam Wave 3B. Gerbang itu kini dilaksanakan;
langkah ini mengesahkan andaian pengekodannya terhadap fail sebenar.

### D1. Jana konfigurasi QA secara eksplisit

```bash
flutter build ios --flavor qa --config-only --no-codesign
```

### D2. Periksa Generated.xcconfig

```bash
grep -E "^(DART_DEFINES|FLUTTER_TARGET)=" ios/Flutter/Generated.xcconfig
```

`DART_DEFINES` mesti hadir dan bukan kosong.

### D3. Nyahkod tetapan flavour Dart sebenar

```bash
tr ',' '\n' < /dev/null   # (rujukan sahaja)
grep '^DART_DEFINES=' ios/Flutter/Generated.xcconfig \
  | sed 's/^DART_DEFINES=//' \
  | tr ',' '\n' \
  | while read -r e; do printf '%s\n' "$(printf '%s' "$e" | base64 -d 2>/dev/null || printf '%s' "$e" | base64 -D)"; done
```

Dijangka satu baris `FLUTTER_APP_FLAVOR=qa`.

> Jika baris itu **tidak** muncul, andaian pengekodan dalam
> `select_firebase_plist.sh` salah untuk versi Flutter ini. Gerbang itu
> kemudian akan menyekat setiap binaan — gagal-tertutup, tetapi salah.
> Laporkan dan betulkan; **jangan** lumpuhkan gerbang.

### D4. Bandingkan dengan flavour natif

`MM_FLAVOR` daripada langkah B mesti sepadan nilai yang dinyahkod.

### D5. Ulang untuk produksi

```bash
flutter build ios --flavor prod --config-only --no-codesign
# nyahkod semula; dijangka FLUTTER_APP_FLAVOR=prod
```

### D6. Perkenalkan ketidakpadanan DENGAN SENGAJA

```bash
flutter build ios --flavor prod --config-only --no-codesign
# Generated.xcconfig kini mengatakan prod. Kemudian bina skema QA dalam Xcode:
xcodebuild -workspace ios/Runner.xcworkspace -scheme qa \
  -configuration Debug-qa -sdk iphonesimulator build
```

### D7. Sahkan binaan GAGAL

Ia mesti gagal dengan:

```
error: flavour natif 'qa' tidak sepadan flavour Dart 'prod'.
```

**Jika ia berjaya, gerbang tidak berjalan.** Semak fasa Run Script wujud dalam
sasaran Runner dan berada selepas "Resources".

---

## E. Pemilihan plist Firebase

Dengan kedua-dua plist sebenar di tempatnya:

```bash
flutter build ios --flavor qa --no-codesign
# Sahkan plist YANG DIBUNDEL ialah plist QA:
/usr/libexec/PlistBuddy -c "Print :PROJECT_ID" \
  build/ios/iphoneos/Runner.app/GoogleService-Info.plist
```

Mesti mencetak ID projek QA, **bukan** `makanmana-c59f3`.

Ulang untuk `--flavor prod`; mesti mencetak `makanmana-c59f3`.

### Kes negatif

Letakkan plist produksi dalam `ios/Firebase/qa/` dan bina QA. Binaan mesti
gagal dengan:

```
error: flavour 'qa' membawa plist projek PRODUKSI ('makanmana-c59f3').
```

Kembalikan plist yang betul selepas itu.

---

## F. Pengasingan QA hujung-ke-hujung

Selepas projek QA Firebase sebenar wujud (lihat
`ios/Firebase/REAL_QA_PROJECT_CONTRACT.md`):

1. Pasang binaan QA pada iPhone fizikal.
2. Sahkan ia log masuk ke projek **QA**, bukan produksi.
3. Sahkan Control Center produksi **tidak** menerima peristiwa daripada larian
   QA — semak log audit, jangan andaikan.
4. Sahkan push tiba melalui projek QA.

---

## Apa yang langkah ini TIDAK buktikan

Ia tidak membuktikan pengesahan rantaian sijil Apple, tingkah laku Sandbox
langsung, atau apa-apa tentang langganan berbayar. Itu ada dalam
`FEED_MAKAN_QA/MAKANMANA_IOS_SANDBOX_BILLING_QA.md` dan kekal **NOT RUN**.
