// FIX 3.0A — guna import MODULAR firebase-admin.
//
// Sebelum ini: `import * as admin` + `admin.firestore.FieldValue`. Runtime
// Functions Emulator (firebase-tools) menampal `admin.firestore` dan
// MENGGUGURKAN ahli statik namespace (FieldValue/Timestamp → undefined) →
// callable gagal DALAM EMULATOR sahaja. Import modular memberi kelas SEBENAR
// FieldValue/Timestamp tanpa bergantung pada namespace yang ditampal —
// SETARA dalam produksi, membolehkan ujian emulator boleh-laksana.
import {getApps, initializeApp} from "firebase-admin/app";
import {getFirestore, FieldValue, Timestamp, type Firestore} from "firebase-admin/firestore";

import {assertFirebaseAdminIsolation} from "./adminIdentity";

if (getApps().length === 0) {
  initializeApp();
}

const firestore = getFirestore();

// WAVE 3E — sahkan projek yang Firestore SEBENARNYA akan sasarkan sebelum
// operasi Firestore PERTAMA. firebase-admin memilih sasaran daripada
// FIREBASE_CONFIG, kemudian GOOGLE_CLOUD_PROJECT || GCLOUD_PROJECT, kemudian
// ADC — bukan daripada identiti yang pagar egress lihat. Sasaran yang
// bercanggah, tidak dapat disahkan atau tidak diluluskan menolak SETIAP
// operasi: gagal-tertutup sebelum sebarang bacaan atau tulisan.
//
// Mengapa pada penggunaan pertama dan bukan semasa modul dimuatkan: 94 fail
// mengimport `db`, termasuk perkhidmatan yang diimport oleh ujian unit yang
// tidak pernah menyentuh Firestore. Semakan semasa muat menggagalkan ujian itu
// tanpa menambah keselamatan — yang berbahaya ialah OPERASI, bukan import.
//
// Proxy memajukan setiap akses kepada klien Firestore sebenar, dengan kaedah
// diikat kepadanya. Diaudit: kod hanya menggunakan collection, doc,
// collectionGroup, batch, runTransaction dan getAll; tiada perbandingan
// identiti `db`. Keputusan yang lulus dicache; yang ditolak dinilai semula.
let isolationVerified = false;

export const db: Firestore = new Proxy(firestore, {
  get(target, property) {
    if (!isolationVerified) {
      assertFirebaseAdminIsolation("firestore");
      isolationVerified = true;
    }
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
});

export {FieldValue, Timestamp};
