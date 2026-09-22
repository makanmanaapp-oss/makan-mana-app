// MAKANMANA WAVE 3D — projek SASARAN sebenar bagi klien SDK.
//
// Mengetahui runtime ialah QA tidak membuktikan operasi sampai ke projek QA.
// Fail ini membaca apa yang SDK sendiri akan gunakan, supaya pagar egress
// boleh membandingkannya dengan identiti runtime. Logik keputusan hidup dalam
// domain/security/egressGuard.ts (tulen, diuji); ini hanya pembaca runtime.

import {getApp} from "firebase-admin/app";
import {getStorage} from "firebase-admin/storage";

import {STORAGE_BUCKET} from "../config/constants";
import {
  decideEgress,
  projectOfStorageBucket,
  resolveFirebaseAdminTargetProject,
  storageEmulatorDestination,
} from "../domain/security/egressGuard";

/**
 * Projek yang klien Firebase Admin lalai (FCM, Firestore) SEBENARNYA sasarkan.
 *
 * Mengikut firebase-admin 13.10.0 `utils.getExplicitProjectId`. Pulangkan null
 * apabila tidak dapat disahkan tanpa I/O (jatuh balik ADC/metadata), atau
 * apabila tiada aplikasi lalai — null bermakna "tidak disahkan", bukan "OK".
 */
export function firebaseAdminTargetProject(): string | null {
  try {
    const app = getApp();
    const credential = app.options.credential as
      | {constructor?: {name?: string}; projectId?: unknown}
      | undefined;
    const serviceAccountProjectId =
      credential?.constructor?.name === "ServiceAccountCredential" &&
      typeof credential.projectId === "string"
        ? credential.projectId
        : null;
    return resolveFirebaseAdminTargetProject({
      optionsProjectId: app.options.projectId ?? null,
      serviceAccountProjectId,
      env: process.env,
    });
  } catch {
    return null;
  }
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
  const egress = decideEgress({
    kind: "firebase_storage",
    destination: storageEmulatorDestination(process.env),
    targetProjectId: projectOfStorageBucket(STORAGE_BUCKET),
  });
  if (!egress.allowed) throw new Error(egress.reason);
  return getStorage().bucket(STORAGE_BUCKET);
}
