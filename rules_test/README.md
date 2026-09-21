# Harness ujian Firestore/Storage Rules

## Pemasangan — `npm ci` biasa TIDAK berfungsi

```
npm error Conflicting peer dependency: firebase@10.14.1
npm error   peer firebase@"^10.0.0" from @firebase/rules-unit-testing@3.0.4
```

`package.json` menyemat `firebase: ^12.16.0`, tetapi `@firebase/rules-unit-testing@3.0.4`
mengisytiharkan peer `firebase@^10`. Lockfile itu konsisten dan betul — ia asalnya dijana
dengan relaksasi peer. Gunakan arahan yang sama:

```bash
cd rules_test && npm ci --legacy-peer-deps
```

## Menjalankan — dari AKAR REPO, bukan dari sini

Setiap suite membaca `firestore.rules` secara relatif kepada direktori kerja, jadi ia mesti
dijalankan dari akar repo. Modul Node pula diselesaikan relatif kepada lokasi skrip, jadi skrip
mesti kekal di dalam `rules_test/`.

```bash
# emulator terasing (JANGAN sekali-kali tuding ke produksi)
firebase emulators:start --project demo-makanmana-qa --only auth,firestore,storage

# dari akar repo:
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
node rules_test/test.mjs            # kitaran hayat siaran + komen
node rules_test/groups_test.mjs     # keahlian + keterlihatan grup
node rules_test/notifications_test.mjs
node rules_test/storage_test.mjs
```

Setiap suite menggunakan `projectId` tersendiri (cth. `makanmana-rules-test`) dan memuatkan
rulesnya sendiri, jadi ia tidak mengganggu data emulator lain.

## `functions_test.mjs`

Ini BUKAN ujian rules — ia menjalankan callable `onCall` sebenar dan memerlukan emulator
**functions** yang menjalankan fungsi repo INI yang telah dikompil:

```bash
cd functions && npm run build && cd ..
FUNCTIONS_DISCOVERY_TIMEOUT=90 firebase emulators:exec --project demo-makanmana-qa   --only functions,firestore,auth "node rules_test/functions_test.mjs"
```

- `--project demo-...` WAJIB. Lalai skrip ialah `makanmana-c59f3` (produksi)
  jika `GCLOUD_PROJECT` tidak ditetapkan; projek berawalan `demo-` dijamin
  emulator-sahaja oleh Firebase CLI.
- `FUNCTIONS_DISCOVERY_TIMEOUT=90`: tanpanya emulator gagal dengan
  "User code failed to load. Cannot determine backend specification. Timeout
  after 10000" - pangkalan kod ini mengambil masa lebih 10 s untuk dimuat.
- `functions/lib/` mesti dibina dahulu (`npm run build`) - emulator memuatkan
  `lib/index.js`, bukan TypeScript.

Dijalankan terhadap emulator yang dihoskan dari worktree lain ia gagal dengan
`functions/not-found`. Ia juga memerlukan keadaan auth yang bersih — jika tidak, larian kedua
gagal dengan `auth/email-already-in-use`.
