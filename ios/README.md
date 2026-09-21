# Asas iOS — disediakan pada Windows, BELUM DIBINA

Folder ini dijana dan disesuaikan pada mesin Windows. **Tiada binaan iOS
pernah dijalankan, tiada IPA wujud, dan tiada apa-apa dihantar ke Apple.**
Toolchain iOS tidak wujud pada Windows, jadi tiada dakwaan "berfungsi"
boleh dibuat dari sini.

Apa yang SUDAH ada dalam sumber:
- projek Runner (deployment target 13.0);
- bundle ID `com.makanmana.apps` — sama seperti pengeluaran Android;
- nama paparan `MakanMana`;
- rentetan tujuan kebenaran (lokasi, foto, kamera) + terjemahan
  ms / zh-Hans / ta dalam `Runner/<lang>.lproj/InfoPlist.strings`;
- `UIBackgroundModes: remote-notification` untuk push.

Apa yang MASIH perlu macOS + akaun Apple (lihat
`FEED_MAKAN_QA/MAKANMANA_IOS_HANDOFF.md` untuk langkah tepat):
`pod install`, skema QA + bundle ID `.qa`, `GoogleService-Info.plist`
untuk KEDUA-DUA projek (pengeluaran dan `demo-makanmana-qa`),
`firebase_options.dart` (kini SENGAJA melontar UnsupportedError untuk
iOS), skema URL terbalik Google Sign-In, kunci APNs, App Check
DeviceCheck/App Attest, `in_app_purchase_storekit` + pengesahan resit
sisi-pelayan, dan QA pada iPhone sebenar.

## Disemak pada Windows (boleh disahkan tanpa Mac)

### Setiap plugin langsung menyokong iOS

18 plugin langsung diperiksa terhadap cache pub. Kesemuanya mengisytiharkan
sokongan `ios`, kecuali `in_app_purchase_android` yang memang pelaksanaan
Android bagi plugin bersekutu - ia tidak dikompil untuk iOS dan bukan
penyekat.

`in_app_purchase` sendiri mengisytiharkan `ios, macos`, dan pokok
kebergantungan SUDAH mengandungi `in_app_purchase_storekit 0.4.10+1`
(transitif). Jadi pakej platform StoreKit **tidak perlu ditambah** - yang
tiada ialah konfigurasi App Store Connect dan pengesahan resit sisi-pelayan.

### Isolasi QA pada iOS - KEPUTUSAN, bukan kerja kod

`isQaLoopbackHost` hanya menerima `127.0.0.1` / `localhost` / `::1`, kerana
reka bentuknya ialah telefon bercakap dengan emulator stesen kerja melalui
terowong USB `adb reverse`. Akibatnya:

| sasaran | isolasi QA |
| --- | --- |
| **Simulator iOS** | **BERFUNGSI hari ini** - `localhost` pada simulator ialah localhost Mac |
| **iPhone fizikal** | **TIDAK BOLEH** - loopback ialah telefon itu sendiri, dan iOS tiada setara `adb reverse` |

Pilihan (untuk owner + jurutera macOS, bukan diputuskan di sini):
1. jalankan matriks QA terasing pada **Simulator**, dan terima bahawa push
   dan IAP tidak boleh diuji di situ;
2. lanjutkan pengawal supaya menerima hos LAN dengan bukti isolasi yang
   BERBEZA - ini melonggarkan sempadan keselamatan dan mesti direka dengan
   sengaja;
3. cari terowong USB setara untuk iOS.

Pengawal itu **tidak** dipintas di sini. Melonggarkannya diam-diam akan
membenarkan binaan "QA" menunjuk ke mana-mana mesin dan tetap memanggil
dirinya terasing.

### Yang SENGAJA tidak dilakukan

- **Tiada `GoogleService-Info.plist`** dicipta. Mereka-reka konfigurasi
  Firebase akan menghasilkan binaan yang bercakap dengan projek yang salah.
- **Tiada Podfile** ditulis. Ia dijana oleh `pod install` di macOS.
- **Tiada dakwaan kompilasi.** Tiada binaan iOS pernah dijalankan.
