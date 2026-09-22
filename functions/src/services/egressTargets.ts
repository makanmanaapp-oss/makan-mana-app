// MAKANMANA WAVE 3D — projek SASARAN sebenar bagi klien SDK.
//
// Mengetahui runtime ialah QA tidak membuktikan operasi sampai ke projek QA.
// Fail ini membaca apa yang SDK sendiri akan gunakan, supaya pagar egress
// boleh membandingkannya dengan identiti runtime. Logik keputusan hidup dalam
// domain/security/egressGuard.ts (tulen, diuji); ini hanya pembaca runtime.

import {generateKeyPairSync} from "node:crypto";

import {cert, getApps, initializeApp, type App} from "firebase-admin/app";
import {getStorage} from "firebase-admin/storage";

import {adminAppIdentity} from "../config/adminIdentity";
import {STORAGE_BUCKET} from "../config/constants";
import {
  decideStorageAccess,
  readEgressEnvironment,
  resolveFirebaseAdminTargetProject,
} from "../domain/security/egressGuard";

/** Aplikasi Admin bernama yang HANYA wujud dalam QA emulator tempatan. */
const EMULATOR_SIGNER_APP = "makanmana-qa-emulator-signer";

/**
 * Aplikasi Admin dengan kunci RSA PAKAI-BUANG yang dijana dalam proses.
 *
 * firebase-admin storage.js membina klien Storage dengan
 * `credentials: {private_key, client_email}` untuk ServiceAccountCredential,
 * dan google-auth-library kemudian menandatangani secara TEMPATAN (JWT dengan
 * kunci) — tiada IAM signBlob, tiada rangkaian, tiada kelayakan pemilik. Kunci
 * tidak pernah ditulis ke cakera dan tidak sah di mana-mana selain emulator.
 */
function emulatorSigningApp(projectId: string): App {
  const existing = getApps().find((app) => app.name === EMULATOR_SIGNER_APP);
  if (existing) return existing;
  const {privateKey} = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: {type: "pkcs8", format: "pem"},
    publicKeyEncoding: {type: "spki", format: "pem"},
  });
  return initializeApp(
    {
      projectId,
      credential: cert({
        projectId,
        clientEmail: `qa-emulator-signer@${projectId}.invalid`,
        privateKey,
      }),
    },
    EMULATOR_SIGNER_APP,
  );
}

/**
 * Projek yang klien Firebase Admin lalai (FCM, Firestore) SEBENARNYA sasarkan.
 *
 * Mengikut firebase-admin 13.10.0 `utils.getExplicitProjectId`. Pulangkan null
 * apabila tidak dapat disahkan tanpa I/O (jatuh balik ADC/metadata), atau
 * apabila tiada aplikasi lalai — null bermakna "tidak disahkan", bukan "OK".
 */
export function firebaseAdminTargetProject(): string | null {
  return resolveFirebaseAdminTargetProject({...adminAppIdentity(), env: process.env});
}

/**
 * Baldi Storage yang DILULUSKAN untuk runtime ini.
 *
 * `STORAGE_BUCKET` jatuh balik kepada baldi PRODUKSI apabila
 * GROUP_IMAGE_BUCKET tidak ditetapkan. Dalam deploy QA yang tersalah
 * konfigurasi, itu bermakna setiap operasi Storage menyasar produksi. Pagar
 * ini menolak baldi yang projeknya tidak sepadan runtime, dan dalam QA
 * emulator menuntut emulator Storage benar-benar aktif.
 */
export function approvedStorageBucket() {
  // Pagar egress — dinilai pada setiap panggilan, bebas daripada rahsia.
  // Keputusan firebase_storage dengan projek yang diterbitkan daripada nama baldi.
  const egress = decideStorageAccess({bucket: STORAGE_BUCKET, env: process.env});
  if (!egress.allowed || egress.bucket === null) throw new Error(egress.reason);
  // Wave 3E: dalam QA emulator, jangan biarkan penandatangan SDK menyentuh
  // kelayakan pemilik atau IAM sebenar.
  const signerApp =
    egress.signingMode === "emulator_disposable_key"
      ? emulatorSigningApp(readEgressEnvironment().projectId ?? "demo-unknown")
      : undefined;
  return getStorage(signerApp).bucket(egress.bucket);
}
