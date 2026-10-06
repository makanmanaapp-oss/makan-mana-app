// MAKANMANA iOS WAVE 2.1 — endpoint App Store Server Notifications V2.
//
// SUMBER SAHAJA. Endpoint ini TIDAK digunakan dan URLnya TIDAK didaftarkan
// dalam App Store Connect. Pendaftaran ialah gate pemilik.
//
// KONTRAK HTTP APPLE — DIBETULKAN DARIPADA WAVE 2
// -----------------------------------------------
// Dokumentasi Apple:
//
//   200–206  penghantaran BERJAYA — Apple berhenti
//   selainnya  penghantaran TIDAK BERJAYA — LAYAK dicuba semula, dan Apple
//              mencuba semula mengikut jadualnya
//
// Wave 2 mendokumenkan "4xx = jangan hantar semula". ITU SALAH, dan penaakulan
// risiko yang dibina di atasnya songsang. Apple akan mencuba semula 4xx.
//
// Bahaya sebenar berjalan ke arah BERTENTANGAN: memulangkan 2xx untuk sesuatu
// yang belum kita simpan dengan kekal menyebabkan Apple berhenti mencuba, dan
// notifikasi itu hilang untuk selamanya. Oleh itu satu invarian:
//
//   JANGAN PERNAH pulangkan 2xx melainkan hasilnya KEKAL.
//
// `httpStatusForOutcome` ialah satu-satunya tempat kod status dipilih, supaya
// invarian itu diuji di satu tempat dan bukan tersebar di sini.

import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";

import {httpStatusForOutcome} from "../domain/billing/notificationProcessing";
import {resolveAppleAppIdentity} from "../domain/billing/appleAppIdentity";
import {processAppleNotification} from "../services/appleNotificationService";

/** Apple Root CA G3, dibekalkan pemilik. TIDAK ditanam dalam kod. */
export const appleRootCertificatesForNotifications = defineSecret(
  "APPLE_ROOT_CERTIFICATES",
);
/** ID aplikasi App Store — diperlukan untuk mengesahkan muatan Production. */
export const appleAppAppleId = defineSecret("APPLE_APP_APPLE_ID");
export const appStoreServerNotifications = onRequest(
  {
    secrets: [
      appleRootCertificatesForNotifications,
      appleAppAppleId,
    ],
  },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("method_not_allowed");
      return;
    }

    const body = request.body as {signedPayload?: unknown} | undefined;
    const signedPayload = body?.signedPayload;
    if (typeof signedPayload !== "string" || signedPayload.length === 0) {
      // Apple akan mencuba semula ini. Itu selamat — tiada pemprosesan berlaku,
      // dan penghantaran yang rosak dalam transit mendapat peluang lain.
      response.status(400).send("bad_payload");
      return;
    }

    const rootsRaw = (appleRootCertificatesForNotifications.value() ?? "").trim();
    const trustedRoots = rootsRaw
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (trustedRoots.length === 0) {
      // Konfigurasi KITA yang tiada. Minta Apple cuba lagi supaya notifikasi
      // tidak hilang sementara kita membetulkannya.
      console.error("apple notifications: akar amanah tidak dikonfigurasikan");
      response.status(503).send("not_configured");
      return;
    }

    const rawAppleId = (appleAppAppleId.value() ?? "").trim();
    const parsed = rawAppleId.length > 0 ? Number(rawAppleId) : Number.NaN;
    const appAppleId = Number.isFinite(parsed) ? parsed : undefined;

    // WAVE 4A (S-2/S-4) — bundle dan persekitaran yang dijangka diterbitkan
    // daripada identiti projek backend, bukan berkod-keras. Identiti yang
    // tidak dikenali atau bercanggah menolak notifikasi (gagal-tertutup).
    const identity = resolveAppleAppIdentity({
      env: process.env,
      productionAppAppleId: rawAppleId,
      qaAppAppleId: null,
    });
    if (!identity.ok) {
      console.error(`apple notifications: ${identity.reason}`);
      response.status(503).send("not_configured");
      return;
    }

    const outcome = await processAppleNotification({
      signedPayload,
      config: {
        trustedRoots,
        bundleId: identity.identity.bundleId,
        appAppleId: identity.identity.appAppleId ?? appAppleId,
        expectedEnvironment: identity.identity.environment,
      },
    });

    const status = httpStatusForOutcome(outcome);

    if (outcome.ok) {
      console.info(`apple notifications: ${outcome.action} durable=${outcome.durable}`);
    } else if (outcome.failure.kind === "transient") {
      console.error(`apple notifications: sementara — ${outcome.failure.reason}`);
    } else {
      // Dilog untuk siasatan. Sebabnya tidak pernah mengandungi muatan, token
      // atau kunci.
      console.warn(`apple notifications: tidak sah — ${outcome.failure.reason}`);
    }

    response.status(status).send(outcome.ok ? "ok" : "retry");
  },
);
