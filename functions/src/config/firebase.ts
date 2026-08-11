// FIX 3.0A — guna import MODULAR firebase-admin.
//
// Sebelum ini: `import * as admin` + `admin.firestore.FieldValue`. Runtime
// Functions Emulator (firebase-tools) menampal `admin.firestore` dan
// MENGGUGURKAN ahli statik namespace (FieldValue/Timestamp → undefined) →
// callable gagal DALAM EMULATOR sahaja. Import modular memberi kelas SEBENAR
// FieldValue/Timestamp tanpa bergantung pada namespace yang ditampal —
// SETARA dalam produksi, membolehkan ujian emulator boleh-laksana.
import {getApps, initializeApp} from "firebase-admin/app";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
export {FieldValue, Timestamp};
