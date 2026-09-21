// MAKANMANA iOS WAVE 2 — endpoint App Store Server Notifications V2.
//
// SUMBER SAHAJA. Endpoint ini TIDAK digunakan dan URLnya TIDAK didaftarkan
// dalam App Store Connect. Pendaftaran ialah gate pemilik.
//
// KONTRAK HTTP APPLE
// ------------------
// Apple mentafsir kod status kita sebagai arahan untuk cuba lagi:
//
//   200  diterima — jangan hantar semula
//   4xx  ditolak  — JANGAN hantar semula (notifikasi hilang selamanya)
//   5xx  ralat    — hantar semula mengikut jadual cuba-semula Apple
//
// Oleh itu membezakan muatan tidak sah daripada kegagalan infrastruktur
// sementara BUKAN kekemasan — memulangkan 4xx untuk gangguan Firestore akan
// MEMBUANG notifikasi pembatalan secara kekal.

import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";

import {APPLE_BUNDLE_ID} from "../domain/billing/appStoreSubscription";
import {processAppleNotification} from "../services/appleNotificationService";

/** Apple Root CA G3, dibekalkan pemilik. TIDAK ditanam dalam kod. */
export const appleRootCertificatesForNotifications = defineSecret(
  "APPLE_ROOT_CERTIFICATES",
);
/** ID aplikasi App Store — diperlukan untuk mengesahkan muatan Production. */
export const appleAppAppleId = defineSecret("APPLE_APP_APPLE_ID");

export const appStoreServerNotifications = onRequest(
  {secrets: [appleRootCertificatesForNotifications, appleAppAppleId]},
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("method_not_allowed");
      return;
    }

    const body = request.body as {signedPayload?: unknown} | undefined;
    const signedPayload = body?.signedPayload;
    if (typeof signedPayload !== "string" || signedPayload.length === 0) {
      // Muatan cacat — tiada gunanya Apple menghantarnya semula.
      response.status(400).send("bad_payload");
      return;
    }

    const rootsRaw = (appleRootCertificatesForNotifications.value() ?? "").trim();
    const trustedRoots = rootsRaw
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (trustedRoots.length === 0) {
      // Konfigurasi KITA yang tiada, bukan muatan buruk. Minta Apple cuba lagi
      // supaya notifikasi tidak hilang sementara kita membetulkannya.
      console.error("apple notifications: akar amanah tidak dikonfigurasikan");
      response.status(503).send("not_configured");
      return;
    }

    const rawAppleId = (appleAppAppleId.value() ?? "").trim();
    const parsedAppleId = rawAppleId.length > 0 ? Number(rawAppleId) : undefined;
    const appAppleId =
      typeof parsedAppleId === "number" && Number.isFinite(parsedAppleId)
        ? parsedAppleId
        : undefined;

    const result = await processAppleNotification({
      signedPayload,
      config: {trustedRoots, bundleId: APPLE_BUNDLE_ID, appAppleId},
    });

    if (result.ok) {
      // Diterima termasuk duplikat, basi dan diabaikan — semuanya bermakna
      // "jangan hantar semula".
      console.info(`apple notifications: ${result.action}`);
      response.status(200).send("ok");
      return;
    }

    if (result.failure.kind === "transient") {
      console.error(`apple notifications: sementara — ${result.failure.reason}`);
      response.status(503).send("retry");
      return;
    }

    // TIDAK SAH: dilog untuk siasatan, tetapi tidak dihantar semula. Sebabnya
    // tidak pernah mengandungi muatan, token atau kunci.
    console.warn(`apple notifications: tidak sah — ${result.failure.reason}`);
    response.status(400).send("invalid");
  },
);
