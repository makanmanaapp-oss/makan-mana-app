/**
 * WAVE 3E — permukaan yang dilihat pengguna QA: URL jemputan dan data tempat.
 *
 * Keputusan TULEN, tiada I/O. Kedua-duanya bergantung pada klasifikasi
 * identiti yang sama dengan pagar egress, supaya QA dan produksi tidak boleh
 * tidak bersetuju tentang persekitaran mana yang sedang berjalan.
 */

import type {PlaceCandidate} from "../../types/place";

import {
  APPROVED_REAL_QA_PROJECT_ID,
  PRODUCTION_PROJECT_ID,
  classifyProject,
  isLoopbackDestination,
  readEgressEnvironment,
  type ProjectClass,
} from "./egressGuard";

// ---------------------------------------------------------------------------
// URL jemputan
// ---------------------------------------------------------------------------

/** Domain Hosting LALAI projek produksi. Disahkan dalam groupInviteLinkControl. */
export const PRODUCTION_INVITE_BASE_URL = `https://${PRODUCTION_PROJECT_ID}.web.app`;

/** Setiap domain Hosting lalai yang dimiliki projek produksi. */
const PRODUCTION_HOSTING_HOSTS = new Set([
  `${PRODUCTION_PROJECT_ID}.web.app`,
  `${PRODUCTION_PROJECT_ID}.firebaseapp.com`,
]);

export type InviteBaseUrlDecision =
  | {ok: true; baseUrl: string; projectClass: ProjectClass}
  | {ok: false; reason: string; projectClass: ProjectClass};

/**
 * URL asas untuk pautan jemputan kumpulan.
 *
 * Sebelum Wave 3E: `process.env.INVITE_BASE_URL ?? "https://makanmana-c59f3.web.app"`,
 * dibina SELEPAS token dicipta. Dalam QA, itu menghasilkan URL laman web
 * PRODUKSI yang membawa token QA — secara senyap.
 *
 * Produksi TIDAK berubah: nilai yang dikonfigurasikan, atau domain lalai.
 * Setiap persekitaran lain MESTI mengkonfigurasikan INVITE_BASE_URL secara
 * eksplisit, dan ia tidak boleh menunjuk ke Hosting produksi. Tiada domain QA
 * direka di sini.
 */
export function decideInviteBaseUrl(params: {
  env: NodeJS.ProcessEnv;
  approvedRealQaProjectId?: string | null;
}): InviteBaseUrlDecision {
  const runtime = readEgressEnvironment(params.env);
  const projectClass = classifyProject(
    runtime.projectId,
    params.approvedRealQaProjectId ?? APPROVED_REAL_QA_PROJECT_ID,
  );
  const deny = (reason: string): InviteBaseUrlDecision => ({
    ok: false,
    projectClass,
    reason: `Jemputan DILUMPUHKAN: ${reason}`,
  });

  if (runtime.conflict) return deny(runtime.conflict);
  if (projectClass === "UNKNOWN") {
    return deny("identiti projek tidak dikenali; URL jemputan tidak boleh dipilih");
  }

  const configured = (params.env.INVITE_BASE_URL ?? "").trim();
  const isProductionRuntime = projectClass === "PRODUCTION" && !runtime.inEmulator;

  if (isProductionRuntime && configured.length === 0) {
    // Tingkah laku produksi yang sedia ada, dipelihara sama-bait.
    return {ok: true, baseUrl: PRODUCTION_INVITE_BASE_URL, projectClass};
  }
  if (configured.length === 0) {
    return deny(
      "INVITE_BASE_URL tidak dikonfigurasikan untuk persekitaran bukan-produksi. " +
      "Jemputan QA tidak akan menjana URL laman web produksi.",
    );
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return deny("INVITE_BASE_URL bukan URL yang sah");
  }
  if (url.search || url.hash) {
    return deny("INVITE_BASE_URL tidak boleh mengandungi query atau fragmen");
  }
  const loopbackAllowed = projectClass === "LOCAL_EMULATOR_QA" && runtime.inEmulator;
  const secure =
    url.protocol === "https:" ||
    (loopbackAllowed && url.protocol === "http:" && isLoopbackDestination(url.href));
  if (!secure) return deny("INVITE_BASE_URL mesti https (atau http gelung-balik dalam emulator)");

  if (!isProductionRuntime && PRODUCTION_HOSTING_HOSTS.has(url.hostname.toLowerCase())) {
    return deny(`INVITE_BASE_URL menunjuk ke Hosting PRODUKSI (${url.hostname}) dari ${projectClass}`);
  }

  const baseUrl = `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  return {ok: true, baseUrl, projectClass};
}

// ---------------------------------------------------------------------------
// Data tempat SINTETIK untuk QA Explore
// ---------------------------------------------------------------------------

/** Satu-satunya nilai yang mengaktifkan data sintetik. */
export const SYNTHETIC_PLACES_FLAG = "MM_QA_SYNTHETIC_PLACES";
export const SYNTHETIC_PLACES_ENABLED = "enabled";

/** Penanda yang MESTI kelihatan pada setiap tempat sintetik, dalam UI. */
export const SYNTHETIC_NAME_PREFIX = "[SINTETIK QA]";
export const SYNTHETIC_PLACE_ID_PREFIX = "qa_synthetic_";

export interface SyntheticPlacesDecision {
  active: boolean;
  reason: string;
  projectClass: ProjectClass;
}

/**
 * Bolehkah Explore dilayan dengan data SINTETIK?
 *
 * HANYA apabila KEDUA-DUA benar:
 *   - bendera MM_QA_SYNTHETIC_PLACES=enabled ditetapkan secara eksplisit, DAN
 *   - runtime ialah QA: REAL_QA di luar emulator, atau QA emulator tempatan di
 *     dalam emulator.
 *
 * Produksi, identiti tidak dikenali dan percanggahan TIDAK PERNAH diaktifkan,
 * walaupun bendera ditetapkan. Tiada panggilan Places, tiada data produksi.
 */
export function decideSyntheticPlaces(params: {
  env: NodeJS.ProcessEnv;
  approvedRealQaProjectId?: string | null;
}): SyntheticPlacesDecision {
  const runtime = readEgressEnvironment(params.env);
  const projectClass = classifyProject(
    runtime.projectId,
    params.approvedRealQaProjectId ?? APPROVED_REAL_QA_PROJECT_ID,
  );
  const flagged = (params.env[SYNTHETIC_PLACES_FLAG] ?? "").trim() === SYNTHETIC_PLACES_ENABLED;
  const off = (reason: string): SyntheticPlacesDecision => ({active: false, reason, projectClass});

  if (!flagged) return off("bendera tidak ditetapkan");
  if (runtime.conflict) return off(`bendera DIABAIKAN: ${runtime.conflict}`);
  const qa =
    (projectClass === "REAL_QA" && !runtime.inEmulator) ||
    (projectClass === "LOCAL_EMULATOR_QA" && runtime.inEmulator);
  if (!qa) return off(`bendera DIABAIKAN dalam ${projectClass} (emulator=${runtime.inEmulator})`);
  return {active: true, reason: `data sintetik aktif dalam ${projectClass}`, projectClass};
}

const CUISINES: Array<[string, string]> = [
  ["Melayu", "🍛"],
  ["Cina", "🥟"],
  ["India", "🫓"],
  ["Barat", "🍔"],
  ["Jepun", "🍣"],
  ["Thai", "🍜"],
];

/**
 * Tempat SINTETIK yang deterministik di sekitar satu koordinat.
 *
 * Setiap tempat dikenal pasti sebagai sintetik dalam TIGA tempat: nama (yang
 * UI paparkan), alamat, dan placeId. Tiada nama, alamat atau koordinat sebenar
 * — kedudukan ialah ofset tetap daripada titik input, jadi ia tidak boleh
 * dikelirukan dengan kedai sebenar di lokasi itu.
 */
export function buildSyntheticPlaces(params: {
  lat: number;
  lng: number;
  count?: number;
}): PlaceCandidate[] {
  const count = Math.max(1, Math.min(20, Math.trunc(params.count ?? 12)));
  const out: PlaceCandidate[] = [];
  for (let i = 0; i < count; i++) {
    const n = String(i + 1).padStart(2, "0");
    const [cuisine, emoji] = CUISINES[i % CUISINES.length];
    // Ofset deterministik kira-kira 150 m setiap langkah.
    const dLat = ((i % 4) - 1.5) * 0.00135;
    const dLng = (Math.floor(i / 4) - 1) * 0.00135;
    const distanceKm = Math.round(Math.hypot(dLat, dLng) * 111 * 100) / 100;
    out.push({
      placeId: `${SYNTHETIC_PLACE_ID_PREFIX}${n}`,
      name: `${SYNTHETIC_NAME_PREFIX} Kedai Ujian ${n}`,
      cuisine,
      emoji,
      rating: 3.5 + (i % 5) * 0.3,
      userRatingCount: 10 * (i + 1),
      priceLevel: (i % 3) + 1,
      distanceKm,
      isOpen: i % 5 !== 4,
      address: `${SYNTHETIC_NAME_PREFIX} Bukan tempat sebenar — data ujian`,
      matchScore: 0,
      matchReasonKeys: [],
      priceEstimate: ["RM5 - RM10", "RM10 - RM20", "RM20 - RM40"][i % 3],
      photoUrl: null,
      openingPeriods: null,
      lat: params.lat + dLat,
      lng: params.lng + dLng,
    });
  }
  return out;
}
