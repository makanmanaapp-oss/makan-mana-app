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
