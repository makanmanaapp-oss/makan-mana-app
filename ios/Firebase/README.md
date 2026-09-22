# Konfigurasi Firebase iOS

Setiap folder di sini menerima `GoogleService-Info.plist` **sebenar** yang
dimuat turun daripada konsol Firebase.

| Folder | Bundle ID | Projek Firebase |
| --- | --- | --- |
| `prod/` | `com.makanmana.apps` | projek produksi |
| `qa/` | `com.makanmana.apps.qa` | keputusan pemilik — lihat nota di bawah |

## Tiada fail palsu di sini

Tiada `GoogleService-Info.plist` dicipta oleh alat. Mereka-reka satu bermakna
mereka-reka App ID, kunci API dan nombor projek — konfigurasi rekaan yang
menyamar sebagai sesuatu yang berfungsi. Fail ini hanya boleh datang daripada
konsol Firebase selepas aplikasi iOS didaftarkan.

## Jangan gunakan plist produksi untuk QA

`ios/scripts/select_firebase_plist.sh` memilih mengikut flavour dan
**menghentikan binaan** apabila plist yang betul tiada. Ia tidak pernah jatuh
balik kepada flavour lain.

## Nota tentang projek QA

Keputusan pemilik ialah QA Simulator dahulu. Jika QA iOS akhirnya menggunakan
emulator Firebase (seperti Android), `qa/` memerlukan plist bagi projek
`demo-`. Jika ia menggunakan projek Firebase QA sebenar, itu mengubah andaian
awalan `demo-` dalam pagar egress backend dan pagar itu mesti dikemas kini
dalam commit yang sama.

## Tindakan konsol yang diperlukan (kerja pemilik, APPLE CONFIG REQUIRED)

Tiada satu pun daripada ini boleh dilakukan dari sini — ia memerlukan akses
konsol. Selepas setiap plist ada, tiada kod lain perlu berubah.

**Firebase Console → Project settings → Your apps → Add app → iOS**

| # | Tindakan | Nilai |
| --- | --- | --- |
| 1 | Daftar aplikasi iOS dalam projek **produksi** | Bundle ID `com.makanmana.apps` |
| 2 | Muat turun `GoogleService-Info.plist` | letak dalam `ios/Firebase/prod/` |
| 3 | Daftar aplikasi iOS kedua untuk QA | Bundle ID `com.makanmana.apps.qa` |
| 4 | Muat turun plist QA | letak dalam `ios/Firebase/qa/` |
| 5 | Authentication → Sign-in method → **Apple** | wajib: App Store menolak app yang menawarkan log masuk sosial tanpa Sign in with Apple |
| 6 | App Check → daftar **App Attest** untuk kedua-dua bundle | App Check sudah diaktifkan dalam kod |

**Apple Developer → Certificates, Identifiers & Profiles**

| # | Tindakan | Nilai |
| --- | --- | --- |
| 7 | Cipta App ID | `com.makanmana.apps` dan `com.makanmana.apps.qa` |
| 8 | Hidupkan keupayaan: Push Notifications, Sign in with Apple, In-App Purchase | kedua-dua App ID |
| 9 | Muat naik kunci APNs ke Firebase Cloud Messaging | diperlukan untuk push iOS |
| 10 | App Store Connect → cipta langganan | ID produk mesti sepadan katalog sedia ada |

## Selepas plist ada: satu nilai untuk disalin

Buka setiap plist, cari `REVERSED_CLIENT_ID`, dan tampalkannya ke dalam
ketiga-tiga xcconfig bagi flavour itu:

```
ios/Flutter/{Debug,Profile,Release}-prod.xcconfig  ← REVERSED_CLIENT_ID plist prod
ios/Flutter/{Debug,Profile,Release}-qa.xcconfig    ← REVERSED_CLIENT_ID plist qa
```

Nilai itu menjadi skim URL panggil-balik Google Sign-In dalam `Info.plist`.
Menampal nilai yang salah tidak akan gagal secara senyap:
`select_firebase_plist.sh` membandingkan xcconfig dengan plist yang sedang
dibundel dan menghentikan binaan apabila ia menyimpang.

## Mengapa `CLIENT_ID` tidak perlu disalin ke mana-mana

`GoogleAuthService` hanya menghantar `serverClientId`. Pemalam iOS
(`google_sign_in_ios` 6.3.0) membaca `CLIENT_ID` terus daripada
`GoogleService-Info.plist` di dalam *main bundle* — iaitu tepat fail yang
disalin oleh `select_firebase_plist.sh`. Jadi pemilihan plist mengikut flavour
turut memacu Google Sign-In, dan tiada ID klien iOS dikodkan keras dalam
sumber Dart.

Disahkan terhadap sumber pemalam, bukan dokumentasi:
`FLTGoogleSignInPlugin.m` → `configurationWithClientIdentifier:` jatuh balik
kepada `self.googleServiceProperties[@"CLIENT_ID"]`.
