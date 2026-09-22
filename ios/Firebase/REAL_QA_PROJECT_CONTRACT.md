# Kontrak projek Firebase QA SEBENAR

**Status: FIREBASE CONFIG REQUIRED.** Projek belum dicipta, tiada aplikasi
didaftarkan, tiada kelayakan diperuntukkan. Dokumen ini ialah kontrak yang
mesti dipenuhi sebelum QA iPhone fizikal boleh berjalan.

Keputusan pemilik: QA peranti fizikal menggunakan projek Firebase **sebenar,
berasingan, bukan-produksi**.

---

## 1. Dua persekitaran QA, bukan satu

Ini kekal **dua persekitaran yang jelas berbeza**. Tiada satu pun jatuh balik
kepada yang lain.

| | Emulator QA tempatan | QA Firebase sebenar |
| --- | --- | --- |
| ID projek | `demo-makanmana-qa` | **BELUM DIUMPUKKAN** |
| Klasifikasi | `LOCAL_EMULATOR_QA` | `REAL_QA` |
| Di mana ia berjalan | Emulator pada mesin pembangun | Firebase sebenar |
| Digunakan untuk | Simulator, ujian unit, rules | **iPhone fizikal** |
| Boleh dicapai dari peranti | Tidak (localhost sahaja) | Ya |
| Egress Control Center (semua titik akhir) | Gelung-balik sahaja | **DISEKAT** walaupun rahsia tersedia |
| Egress FCM | **DISEKAT** | Hanya jika projek sasaran klien FCM **disahkan** = projek QA |
| Egress Vertex AI | **DISEKAT** | Hanya jika `projectId` yang membina URL **disahkan** = projek QA |
| Egress Places API | **DISEKAT** | **DISEKAT** — kunci API tidak mendedahkan projek pemiliknya |
| Cloud Storage | Hanya ke emulator Storage gelung-balik | Hanya jika projek baldi **disahkan** = projek QA |
| Egress App Store API | **DISEKAT** | **DISEKAT lalai** |
| Egress Google Play Developer API | **DISEKAT** | **DISEKAT lalai** |

**Wave 3D:** identiti runtime QA TIDAK membuktikan operasi sampai ke projek QA.
Setiap operasi yang sasarannya boleh ditentukan kini disahkan terhadap projek
yang SDK sebenarnya gunakan. Sasaran yang tidak dapat disahkan disekat.

Setiap tapak egress dalam backend dilindungi — `egressSweep.test.ts` membaca
setiap fail sumber dan menggagalkan suite jika satu tapak baharu ditambah tanpa
pagar.

Awalan `demo-` bukan konvensyen penamaan — Firebase memperlakukan projek
sedemikian sebagai tidak wujud di hulu, jadi SDK **tidak boleh** mencapai
backend sebenar dengannya. Itulah sebabnya ia selamat untuk emulator dan
mengapa ia **tidak boleh** digunakan untuk peranti fizikal.

---

## 2. Perubahan sumber yang diperlukan apabila ID diumpukkan

Apabila pemilik mencipta projek dan ID wujud, **tepat satu** perubahan sumber
membuka laluan REAL_QA:

```ts
// functions/src/domain/security/egressGuard.ts
export const APPROVED_REAL_QA_PROJECT_ID: string | null = "<id-projek-qa-sebenar>";
```

Sehingga itu ia kekal `null`, dan **setiap** identiti sedemikian
diklasifikasikan `UNKNOWN` dan disekat. Tiada ID direka. Tiada ID diterbitkan
daripada nama.

`test/cross_component_identity_test.dart` menegaskan pemalar itu masih `null`,
jadi mengubahnya ialah keputusan yang jelas dan bukan hanyutan.

**Perubahan itu MESTI berlaku dalam commit yang sama dengan:**

1. Kemas kini `ios/Firebase/qa/GoogleService-Info.plist` (plist sebenar).
2. `MM_GOOGLE_REVERSED_CLIENT_ID` dalam ketiga-tiga `*-qa.xcconfig`.
3. `GROUP_IMAGE_BUCKET` ditetapkan kepada baldi LALAI projek QA
   (`<id-qa>.firebasestorage.app`) dalam persekitaran Functions QA. Tanpanya,
   `STORAGE_BUCKET` jatuh balik kepada baldi PRODUKSI dan pagar menyekat SETIAP
   operasi Storage — imej kumpulan, imej jemputan, media CMS.
4. Semakan semula `select_firebase_plist.sh` — ia kini menolak apa-apa yang
   bukan `makanmana-c59f3` untuk `prod`, dan menolak `makanmana-c59f3` untuk
   flavour lain. Projek QA sebenar lulus kedua-dua semakan itu secara semula
   jadi, jadi **tiada perubahan dijangka** — tetapi sahkan, jangan andaikan.

> **AMARAN YANG PALING PENTING.** Ujian dan dokumentasi sedia ada menganggap
> QA bermakna awalan `demo-`. Projek Firebase **sebenar tidak boleh** mempunyai
> awalan itu. Menerima pakai QA sebenar tanpa mengemas kini klasifikasi akan
> menjadikan projek QA itu `UNKNOWN` — semua egress disekat, termasuk FCM yang
> diperlukan oleh QA peranti. Gagal-tertutup, jadi ia tidak berbahaya, tetapi
> ia akan kelihatan seperti "push tidak berfungsi" dan bukan seperti masalah
> konfigurasi.

---

## 3. Perkhidmatan — apa yang perlu dihidupkan dan mengapa

| Perkhidmatan | Diperlukan? | Nota |
| --- | --- | --- |
| **Authentication** | YA | Sign in with Apple + Google. Akaun ujian BERASINGAN; jangan guna akaun produksi. |
| **Firestore** | YA | Rules yang SAMA seperti produksi — QA yang lebih longgar menguji sistem yang berbeza. Deploy daripada `firestore.rules` yang sama. |
| **Cloud Functions** | YA | Wilayah `asia-southeast1`, sama seperti produksi. |
| **Storage** | YA | Rules yang sama. Baldi berasingan. |
| **App Check** | YA | **App Attest** untuk `com.makanmana.apps.qa`. Ini sebab utama QA sebenar dipilih berbanding get tempatan: pengesahan langganan bergantung padanya. |
| **FCM** | YA | Kunci APNs sendiri. Jangan kongsi kunci produksi. |
| **Crashlytics** | Pilihan | Berguna; pisahkan supaya ranap QA tidak mencemari metrik produksi. |
| **Analytics** | TIDAK | Jangan hidupkan. Peristiwa QA tidak sepatutnya wujud langsung. |

---

## 4. IAM dan kelayakan

| Perkara | Keperluan |
| --- | --- |
| Akaun perkhidmatan | Berasingan sepenuhnya. **Jangan** guna semula kunci produksi. |
| Akses manusia | Hanya mereka yang menjalankan QA. Bukan salinan IAM produksi. |
| Akaun perkhidmatan produksi | **TIDAK PERNAH** diberikan peranan dalam projek QA, dan sebaliknya. |
| Rahsia | Simpanan berasingan. Rahsia QA tidak pernah dalam persekitaran produksi. |
| Kunci App Store Server API | **JANGAN** salin ke QA. Lihat §6. |
| Akaun perkhidmatan Google Play | **JANGAN** salin ke QA. Egress Play disekat dalam REAL_QA. |
| Kunci Places API | **Places DISEKAT dalam REAL_QA.** Kunci API tidak mendedahkan projek pemiliknya, jadi kunci produksi yang disalin ke QA akan membilkan produksi tanpa sebarang cara untuk pagar mengesannya. Lihat §6A. |
| `GOOGLE_APPLICATION_CREDENTIALS` | **JANGAN** tetapkan dalam QA. Fail kunci akaun perkhidmatan menentukan projek sasaran SDK; kunci produksi akan menyasar produksi. Pagar menyekat ini untuk FCM/Vertex/Storage, tetapi Firestore tidak melalui pagar egress — lihat §6B. |
| `FIREBASE_CONFIG` | Mesti JSON dengan `projectId` projek QA (Firebase CLI menetapkannya). Laluan fail disekat oleh pagar. |
| `GOOGLE_CLOUD_PROJECT`, `GCLOUD_PROJECT`, `GCP_PROJECT`, `gcloud_project` | Jika ditetapkan, SEMUA mesti bersetuju dengan projek QA. Mana-mana yang tidak bersetuju menyekat setiap egress. |
| Rahsia Control Center (`CONTROL_CENTER_SYNC_SECRET`, `MERCHANT_BRIDGE_SECRET`, Supabase) | **JANGAN** peruntukkan dalam QA langsung. Egress CC disekat dalam REAL_QA; rahsia itu tiada kegunaan di sana. |

Pagar egress tidak membaca kelayakan, jadi kelayakan yang tersilap diletakkan
**tidak boleh** membuka laluan yang ditolak. Ia masih tidak sepatutnya wujud.

---

## 5. Data ujian

- Projek QA bermula **KOSONG**. Jangan salin data produksi ke dalamnya.
- Jangan eksport pengguna produksi, siaran, kedai atau langganan.
- Data benih mesti dijana, bukan disalin.
- Jika data realistik diperlukan, jana ia; jangan nyahnamakan data sebenar —
  penyahnamaan separa masih data peribadi.

---

## 6. Sempadan App Store Server API

Pagar egress menyekat `app_store_api` dalam `REAL_QA` **secara lalai**.

Itu disengajakan. Sandbox Apple ialah **destinasi berbeza** dengan kelayakan
berbeza. Membenarkan panggilan Apple sebenar dari QA kerana "ia cuma QA"
bermakna larian QA boleh menyentuh perkhidmatan Apple sebenar dengan kunci
sebenar.

Apa-apa pengecualian Sandbox memerlukan:

1. Dasar destinasi yang diluluskan secara eksplisit (hos Sandbox sahaja).
2. Kelayakan Sandbox yang berasingan daripada produksi.
3. Perubahan sumber sendiri yang meluaskan matriks — bukan bendera.

Sehingga itu, QA langganan pada peranti fizikal mengesahkan laluan **klien**
dan **pengesahan sisi-pelayan terhadap data yang disimpan**, bukan panggilan
Apple langsung.

---

## 6A. Places dalam QA iPhone fizikal — KEPUTUSAN PEMILIK DIPERLUKAN

Places disekat dalam REAL_QA kerana sasaran kunci API tidak dapat disahkan.
Projek QA bermula KOSONG, jadi aliran yang bergantung pada Places (Explore,
cadangan berdekatan) tidak akan mempunyai data pada iPhone QA.

Pilihan, tiada yang dilaksanakan:

| Pilihan | Kesan |
| --- | --- |
| A. Benih data tempat yang DIJANA ke Firestore QA | Explore berfungsi daripada cache DB; tiada panggilan Places |
| B. Tukar Places kepada OAuth dengan projek kuota eksplisit (`X-Goog-User-Project`) | Sasaran menjadi boleh disahkan; perubahan kod pada laluan produksi — perlu kelulusan dan ujian sendiri |
| C. Terima Places tidak diuji pada peranti | Explore disahkan pada Simulator/emulator sahaja |

## 6B. Firestore dan Auth tidak melalui pagar egress

Pagar melindungi operasi KELUAR. Firestore dan Auth Admin menyasar projek yang
sama yang FCM sasarkan (firebase-admin `getExplicitProjectId`): pertama
`FIREBASE_CONFIG.projectId`. Dalam deploy Firebase CLI yang biasa ini sentiasa
projek QA, dan kelayakan asing kemudian GAGAL dengan 403 dan bukan menulis ke
produksi. Risiko baki hanya wujud jika `FIREBASE_CONFIG` tiada DAN kelayakan
produksi dibekalkan — dihalang oleh §4, tidak oleh kod.

---

## 7. Bajet, kuota dan audit

| Kawalan | Cadangan |
| --- | --- |
| Amaran bajet | Tetapkan pada jumlah rendah. QA tidak sepatutnya mahal; lonjakan bermakna sesuatu tersalah konfigurasi. |
| Had kuota | Kekalkan lalai. Kuota yang dinaikkan menyembunyikan gelung yang lari. |
| Log audit | Hidupkan Cloud Audit Logs. Ini satu-satunya cara untuk membuktikan kemudian bahawa QA tidak menyentuh produksi. |
| Pengekalan | Pendek. Data QA tidak mempunyai nilai jangka panjang. |

---

## 8. Prosedur penamatan

Projek QA mesti boleh dipadam tanpa sebarang kesan kepada produksi.

1. Padam projek Firebase.
2. Batalkan mana-mana kunci APNs yang eksklusif kepadanya.
3. Buang App ID `com.makanmana.apps.qa` daripada peranti ujian.
4. Tetapkan `APPROVED_REAL_QA_PROJECT_ID` kembali kepada `null`.
5. Sahkan `test/cross_component_identity_test.dart` lulus semula.

Langkah 4 penting: meninggalkan ID projek yang dipadam dikonfigurasikan
bermakna pagar mempercayai identiti yang tidak lagi wujud.

---

## 9. Apa yang TIDAK dilakukan dalam gelombang ini

Tiada projek dicipta. Tiada aplikasi didaftarkan. Tiada kelayakan diperuntukkan.
Tiada plist dimuat turun atau direka. Tiada rules, indeks atau Functions
dideploy. Firebase produksi tidak disentuh.
