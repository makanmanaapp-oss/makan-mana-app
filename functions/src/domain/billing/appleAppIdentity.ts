/**
 * WAVE 4A — identiti aplikasi Apple yang DIJANGKA, diterbitkan daripada
 * identiti projek backend yang DIPERCAYAI.
 *
 * Empat defek yang ditutup (Wave 3F, S-1..S-4):
 *
 *  S-1 Persekitaran tidak pernah disahkan pada laluan pembelian; ia
 *      diterbitkan daripada HOS MANA yang menjawab (produksi dahulu, 404 →
 *      sandbox). Hos yang menjawab ialah hasil permintaan kita, bukan bukti.
 *  S-2 Tiada pagar kelayakan mengikut persekitaran: transaksi Sandbox yang
 *      disahkan terhadap produksi memberikan Pro SEBENAR.
 *  S-3 `appAppleId` tidak pernah disemak pada laluan pembelian.
 *  S-4 Bundle ID berkod-keras kepada satu aplikasi produksi, jadi binaan QA
 *      tidak akan pernah disahkan — dan tiada pemisahan QA/produksi.
 *
 * Tulen: tiada I/O, tiada rangkaian, tiada rahsia dibaca. Ia menggunakan
 * SEMULA klasifikasi projek yang sama dengan pagar egress, jadi pembelian dan
 * egress tidak boleh tidak bersetuju tentang persekitaran mana yang berjalan.
 */

import {APPLE_ENV_PRODUCTION, APPLE_ENV_SANDBOX} from "./appStoreJws";
import {
  APPROVED_REAL_QA_PROJECT_ID,
  classifyProject,
  readEgressEnvironment,
  type ProjectClass,
} from "../security/egressGuard";

/** Bundle produksi. Terkunci (keputusan pemilik). */
export const APPLE_PRODUCTION_BUNDLE_ID = "com.makanmana.apps";

/** Bundle QA. Terkunci (keputusan pemilik); aplikasi ASC berasingan. */
export const APPLE_QA_BUNDLE_ID = "com.makanmana.apps.qa";

/** Hos App Store Server API. */
export const APPLE_PRODUCTION_HOST = "https://api.storekit.itunes.apple.com";
export const APPLE_SANDBOX_HOST = "https://api.storekit-sandbox.itunes.apple.com";

export type AppleEnvironment = typeof APPLE_ENV_PRODUCTION | typeof APPLE_ENV_SANDBOX;

/** Identiti aplikasi yang muatan bertandatangan MESTI padankan. */
export interface AppleAppIdentity {
  bundleId: string;
  environment: AppleEnvironment;
  /** Tidak ditetapkan bila tidak dikonfigurasikan; wajib untuk Production. */
  appAppleId?: number;
  /** Hos App Store Server API yang SATU-SATUNYA dibenarkan untuk runtime ini. */
  host: string;
  projectClass: ProjectClass;
}

export type AppleIdentityDecision =
  | {ok: true; identity: AppleAppIdentity}
  | {ok: false; reason: string; projectClass: ProjectClass};

function parseAppAppleId(raw: string | null | undefined): number | undefined {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Terbitkan identiti aplikasi Apple yang dijangka untuk runtime INI.
 *
 * | Kelas projek        | Bundle          | Persekitaran | Hos      |
 * | ------------------- | --------------- | ------------ | -------- |
 * | PRODUCTION          | produksi        | Production   | produksi |
 * | REAL_QA             | QA              | Sandbox      | sandbox  |
 * | LOCAL_EMULATOR_QA   | QA              | Sandbox      | sandbox* |
 * | UNKNOWN / bercanggah| —               | —            | DITOLAK  |
 *
 * (*) Emulator tidak pernah mencapai Apple: pagar egress menyekat API Kedai
 * daripada setiap runtime bukan-produksi. Identiti diselesaikan supaya ujian
 * pengangkutan-palsu boleh menjalankan laluan lengkap.
 *
 * `appAppleId` WAJIB untuk Production — tanpanya kita tidak boleh membuktikan
 * muatan itu milik aplikasi kita, jadi keputusan gagal-TERTUTUP.
 */
export function resolveAppleAppIdentity(params: {
  env: NodeJS.ProcessEnv;
  productionAppAppleId?: string | number | null;
  qaAppAppleId?: string | number | null;
  approvedRealQaProjectId?: string | null;
}): AppleIdentityDecision {
  const runtime = readEgressEnvironment(params.env);
  const projectClass = classifyProject(
    runtime.projectId,
    params.approvedRealQaProjectId ?? APPROVED_REAL_QA_PROJECT_ID,
  );
  const deny = (reason: string): AppleIdentityDecision => ({
    ok: false,
    projectClass,
    reason: `Pengesahan Apple DITOLAK: ${reason}`,
  });

  if (runtime.conflict) return deny(runtime.conflict);
  if (projectClass === "UNKNOWN") {
    return deny("identiti projek tidak dikenali; persekitaran Apple tidak boleh diterbitkan");
  }

  if (projectClass === "PRODUCTION") {
    // Runtime produksi dalam emulator bukan konfigurasi yang sah untuk
    // pembelian sebenar: ia akan menulis kelayakan produksi daripada mesin
    // pembangun. Tolak, jangan teka.
    if (runtime.inEmulator) {
      return deny("identiti produksi di dalam emulator");
    }
    const appAppleId = parseAppAppleId(
      typeof params.productionAppAppleId === "number" ?
        String(params.productionAppAppleId) :
        params.productionAppAppleId,
    );
    if (appAppleId === undefined) {
      return deny("appAppleId produksi tidak dikonfigurasikan");
    }
    return {
      ok: true,
      identity: {
        bundleId: APPLE_PRODUCTION_BUNDLE_ID,
        environment: APPLE_ENV_PRODUCTION,
        appAppleId,
        host: APPLE_PRODUCTION_HOST,
        projectClass,
      },
    };
  }

  // REAL_QA dan LOCAL_EMULATOR_QA: Sandbox sahaja, bundle QA sahaja.
  if (projectClass === "LOCAL_EMULATOR_QA" && !runtime.inEmulator) {
    return deny("identiti emulator tempatan di luar emulator");
  }
  return {
    ok: true,
    identity: {
      bundleId: APPLE_QA_BUNDLE_ID,
      environment: APPLE_ENV_SANDBOX,
      appAppleId: parseAppAppleId(
        typeof params.qaAppAppleId === "number" ?
          String(params.qaAppAppleId) :
          params.qaAppAppleId,
      ),
      host: APPLE_SANDBOX_HOST,
      projectClass,
    },
  };
}

/**
 * Pagar KELAYAKAN (S-2): bolehkah muatan yang telah disahkan ini menulis
 * kelayakan dalam runtime ini?
 *
 * Tandatangan yang sah tidak mencukupi. Transaksi Sandbox tidak pernah
 * memberikan Pro produksi, dan transaksi Production tidak pernah menulis ke
 * pangkalan data QA. Dikuatkuasakan pada sempadan pengesahan DAN sekali lagi
 * sebelum kekal.
 */
export function assertAppleEntitlementEnvironment(params: {
  expected: AppleAppIdentity;
  payloadEnvironment: unknown;
}): void {
  const actual = params.payloadEnvironment;
  if (typeof actual !== "string" || actual !== params.expected.environment) {
    throw new Error(
      `Persekitaran transaksi App Store tidak dibenarkan dalam ${params.expected.projectClass}: ` +
      `dijangka ${params.expected.environment}`,
    );
  }
}
