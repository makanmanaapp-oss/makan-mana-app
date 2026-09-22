// MAKANMANA WAVE 3E — identiti aplikasi Firebase Admin dan pengasingannya.
//
// Pembaca runtime yang nipis. Logik keputusan hidup dalam
// domain/security/egressGuard.ts (tulen, diuji terhadap sumber SDK yang
// dipasang).

import {getApp} from "firebase-admin/app";

import {
  decideFirebaseAdminIsolation,
  type AdminService,
} from "../domain/security/egressGuard";

/**
 * Apa yang aplikasi Admin lalai akan gunakan untuk memilih projek sasaran.
 *
 * `options.projectId` dimuatkan daripada FIREBASE_CONFIG. Projek kelayakan
 * hanya dikira apabila kelayakan ialah ServiceAccountCredential — itulah
 * satu-satunya kes firebase-admin menggunakannya dalam getExplicitProjectId.
 * `initializeApp()` tanpa hujah (kod kita) sentiasa ApplicationDefaultCredential.
 */
export function adminAppIdentity(): {
  optionsProjectId: string | null;
  serviceAccountProjectId: string | null;
} {
  try {
    const app = getApp();
    const credential = app.options.credential as
      | {constructor?: {name?: string}; projectId?: unknown}
      | undefined;
    return {
      optionsProjectId: app.options.projectId ?? null,
      serviceAccountProjectId:
        credential?.constructor?.name === "ServiceAccountCredential" &&
        typeof credential.projectId === "string"
          ? credential.projectId
          : null,
    };
  } catch {
    // Tiada aplikasi lalai: tiada apa yang boleh disahkan.
    return {optionsProjectId: null, serviceAccountProjectId: null};
  }
}

/**
 * Lontar jika klien Admin bagi `service` akan menyasar projek yang tidak
 * diluluskan, bercanggah, atau tidak dapat disahkan.
 *
 * Firestore disemak SEKALI apabila modul `config/firebase` dimuatkan, sebelum
 * mana-mana operasi. firebase-tools 15.22.4 memberi FIREBASE_CONFIG (JSON) dan
 * GCLOUD_PROJECT yang bersetuju semasa penemuan deploy (prepare.js:388) dan
 * dalam emulator (functionsEmulator.js:973-1026), jadi semakan ini tidak
 * menghalang deploy atau emulator yang dikonfigurasikan dengan betul.
 */
export function assertFirebaseAdminIsolation(service: AdminService): void {
  const decision = decideFirebaseAdminIsolation({
    service,
    env: process.env,
    ...adminAppIdentity(),
  });
  if (!decision.allowed) throw new Error(decision.reason);
}
