# Provenans binaan keluaran

`flutter build` boleh melaporkan **"√ Built"** sambil menghasilkan binari
LAMA. Ini bukan andaian — ia dibuktikan pada repo ini.

## Apa yang diperhatikan (21 September 2026)

Satu rentetan sumber ditukar, kemudian binaan dijalankan semula TANPA
`flutter clean`:

| | |
| --- | --- |
| Sumber | mengandungi penanda baharu |
| `flutter build appbundle --release` | melaporkan **"√ Built"** |
| `jniLibs/arm64-v8a/libapp.so` perantaraan | **DIJANA SEMULA**, mengandungi penanda baharu (`aaa9e5eb…`) |
| `libapp.so` **di dalam AAB** | binari LAMA (`02fa1354…`), penanda baharu **TIADA** |

Flutter mengkompil semula; tugas pembungkusan Gradle memakai `libapp.so`
lama. Cap masa AAB berubah, saiznya berubah beberapa bait — jadi ia
"kelihatan" seperti binaan baharu. Tiada apa-apa dalam log memberi amaran.

`flutter clean` + `flutter pub get` sebelum membina menyelesaikannya:
selepas itu AAB membawa penanda baharu dan bukan yang lama.

Ini kelas kegagalan yang sama yang pernah menghantar build-12 ke Play tanpa
pembaikannya. Suite ujian TIDAK menangkapnya — ujian dijalankan pada sumber,
bukan pada artifak.

## Prosedur

```powershell
# 1. Pokok bersih, pada commit yang hendak dikeluarkan.
# 2. Jalankan (ia yang melakukan clean + build + pengesahan):
pwsh scripts/release_provenance/Verify-ReleaseProvenance.ps1 `
     -Flavor prod -Artifact aab `
     -Markers 'rentetan yang diperkenalkan oleh keluaran ini' `
     -OutFile provenans-keluaran.txt
```

Skrip itu:
1. enggan berjalan pada pokok kotor (artifak mesti boleh dipetakan ke satu commit);
2. `flutter clean` + `flutter pub get` — binaan tambahan TIDAK dipercayai;
3. membina;
4. mengambil artifak **Gradle**, bukan salinan dalam `flutter-apk/` (salinan
   itu boleh jadi pendua fail lama — itulah yang menyembunyikan masalah ini);
5. mengekstrak `libapp.so` dan mengira SHA-256 artifak dan AOT;
6. mencari setiap penanda dalam BAIT AOT;
7. menjalankan kawalan negatif — jika rentetan mustahil "dijumpai", carian
   itu rosak dan keputusannya dibuang;
8. mencetak rekod provenans untuk dilampirkan pada keluaran.

Keluar bukan-sifar jika mana-mana penanda hilang.

## Memilih penanda

Gunakan rentetan yang **diperkenalkan oleh perubahan yang sedang
dikeluarkan** — bukan rentetan lama yang sudah ada dalam binari sebelumnya.
Rentetan lama akan lulus walaupun pada artifak basi.

Contoh untuk keluaran calon ini: `Bahagian ini tidak dapat dimuatkan
sekarang.` (kunci `sectionLoadFailed`, diperkenalkan oleh pembaikan kelas D)
dan `Gagal memuat mesej.` yang kini benar-benar boleh dicapai.
