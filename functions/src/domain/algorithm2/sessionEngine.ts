/**
 * Algorithm 2 / Phase 2.2 — enjin sesi TULEN (tiada I/O).
 *
 * Penindasan (shown/rejected/24h reject-memory), guna-semula alternatif, putaran
 * ber-benih-sesi bagi calon hampir-sama, kepelbagaian cuisine/cawangan, dan
 * perancangan kueri provider berpagar. TIDAK mengubah berat skor. Semua fungsi
 * deterministik + boleh diuji tanpa Firestore.
 */
import { hashCanonical } from "../places/staging/hashing";
import { PlaceCandidate } from "../../types/place";

// --- Context hash -----------------------------------------------------------
export interface ContextHashInput {
  uid: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  mood: string | null;
  timeSegment: string;
  plan: string;
  profileVersion?: string | number | null;
  /** Phase 2.4 — versi brain; perubahan → sesi baharu (guna brain terkini). */
  brainVersion?: number | null;
  /** Master Mood/Diet/Fit fix — cap KESELAMATAN + Diet/Fit (allergy/halal/diet/
   * fitGoal/sport/training). Perubahan mana-mana → contextHash BAHARU → sesi
   * baharu di-rank semula dengan penapis keselamatan terkini. Menutup laluan
   * guna-semula/consume daripada menyajikan calon LAMA (pra-perubahan) yang mungkin
   * kini bercanggah alahan/diet. Lihat computeSafetyKey. */
  safetyKey?: string | null;
}

/** Hash konteks deterministik (grid lokasi ~111m; radius dibucket). TIADA data sensitif mentah. */
export function computeContextHash(input: ContextHashInput): string {
  const latGrid = Number.isFinite(input.lat) ? input.lat.toFixed(3) : "0";
  const lngGrid = Number.isFinite(input.lng) ? input.lng.toFixed(3) : "0";
  const radiusBucket = Math.round((input.radiusMeters || 0) / 500) * 500;
  return hashCanonical({
    uid: input.uid, latGrid, lngGrid, radiusBucket,
    mood: input.mood ?? "none", timeSegment: input.timeSegment,
    plan: input.plan, pv: input.profileVersion ?? 0,
    bv: input.brainVersion ?? 0,
    sk: input.safetyKey ?? "0",
  }).slice(0, 24);
}

/**
 * Master Mood/Diet/Fit fix — cap ringkas & deterministik bagi isyarat KESELAMATAN +
 * Diet/Fit yang MESTI membatalkan sesi bila berubah (Part L). TIADA nilai mentah
 * sensitif didedah (hanya hash 12-hex). Isih + normalisasi supaya stabil.
 *   allergy, halal, diet (hard/safety) + fitGoal, sportMood, trainingDay (fit).
 */
export function computeSafetyKey(input: {
  allergies?: readonly string[];
  halalPreference?: boolean;
  dietTypes?: readonly string[];
  dietType?: string | null;
  fitGoal?: string | null;
  sportMood?: string | null;
  trainingDay?: boolean;
}): string {
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
  const allergies = [...new Set((input.allergies ?? []).map(norm).filter(Boolean))].sort();
  const diets = [...new Set([
    ...(input.dietTypes ?? []).map(norm),
    norm(input.dietType),
  ].filter((d) => d && d !== "none"))].sort();
  return hashCanonical({
    allergies: allergies.join(","),
    halal: input.halalPreference === true,
    diets: diets.join(","),
    fitGoal: norm(input.fitGoal),
    sportMood: norm(input.sportMood),
    trainingDay: input.trainingDay === true,
  }).slice(0, 12);
}

// --- Reject memory (24h) ----------------------------------------------------
export interface RejectMemoryRecord {
  placeId: string;
  canonicalPlaceId?: string | null;
  rejectedAt: number;
  expiresAt: number;
}
export const REJECT_MEMORY_TTL_MS = 24 * 60 * 60 * 1000;

/** ID yang masih ditindas oleh reject-memory (belum luput). */
export function activeRejectMemoryIds(records: readonly RejectMemoryRecord[], now: number): string[] {
  const out = new Set<string>();
  for (const r of records) {
    if (r.expiresAt > now) {
      out.add(r.placeId);
      if (r.canonicalPlaceId) out.add(r.canonicalPlaceId);
    }
  }
  return [...out].sort();
}

// --- Exclude set ------------------------------------------------------------
export interface BuildExcludeInput {
  sessionShown?: readonly string[];
  sessionRejected?: readonly string[];
  rejectMemoryIds?: readonly string[];
  /** Peta ID pembekal/legasi → ID kanonikal (untuk menindas identiti setara). */
  aliasToCanonical?: Record<string, string>;
}

/** Bina senarai excludePlaceIds server-derived (termasuk identiti alias setara). */
export function buildExcludeIds(input: BuildExcludeInput): string[] {
  const set = new Set<string>();
  const add = (id: string | undefined) => { if (id) set.add(id); };
  for (const id of input.sessionShown ?? []) add(id);
  for (const id of input.sessionRejected ?? []) add(id);
  for (const id of input.rejectMemoryIds ?? []) add(id);
  // Tambah pasangan alias↔kanonikal supaya identiti setara turut ditindas.
  const alias = input.aliasToCanonical ?? {};
  for (const [provider, canon] of Object.entries(alias)) {
    if (set.has(provider) || set.has(canon)) { set.add(provider); set.add(canon); }
  }
  return [...set].sort();
}

// --- Session-seeded rotation (near-equal only) ------------------------------
/** Beza matchScore (0-99) yang dianggap "hampir-sama" (≈0.08 skor ternormal). */
export const NEAR_EQUAL_BAND = 8;

/**
 * Putar HANYA calon hampir-sama mengikut benih sesi. Band skor lebih tinggi
 * kekal di hadapan (skor jauh berbeza TIDAK diputar). Deterministik per benih.
 */
export function sessionSeededRotation(
  ranked: readonly PlaceCandidate[],
  seed: number,
  band: number = NEAR_EQUAL_BAND,
): PlaceCandidate[] {
  const out: PlaceCandidate[] = [];
  let i = 0;
  while (i < ranked.length) {
    // Kumpulan: item berturut dalam `band` dari pemimpin kumpulan.
    const leader = ranked[i].matchScore;
    let j = i;
    while (j < ranked.length && leader - ranked[j].matchScore <= band) j++;
    const group = ranked.slice(i, j);
    if (group.length > 1) {
      const offset = ((seed % group.length) + group.length) % group.length;
      for (let k = 0; k < group.length; k++) {
        out.push(group[(k + offset) % group.length]);
      }
    } else {
      out.push(group[0]);
    }
    i = j;
  }
  return out;
}

/** Benih berangka deterministik daripada rentetan sesi. */
export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// --- Diversity (cuisine cap in first N) -------------------------------------
/**
 * Kepelbagaian terbatas: maksimum [cuisineCap] cuisine sama dalam [window]
 * pertama. Melimpah ditolak ke belakang (tidak dibuang). Melonggar bila pool
 * kecil (semula-jadi: item terlebih akan tetap muncul selepas window).
 */
export function applyCuisineDiversity(
  ranked: readonly PlaceCandidate[],
  opts: { cuisineCap?: number; window?: number } = {},
): PlaceCandidate[] {
  const cap = opts.cuisineCap ?? 2;
  const window = opts.window ?? 12;
  const head: PlaceCandidate[] = [];
  const overflow: PlaceCandidate[] = [];
  const counts = new Map<string, number>();
  for (const p of ranked) {
    const c = p.cuisine.toLowerCase();
    const n = counts.get(c) ?? 0;
    if (head.length < window && n < cap) {
      head.push(p);
      counts.set(c, n + 1);
    } else {
      overflow.push(p);
    }
  }
  return [...head, ...overflow];
}

// --- Mood-priority re-rank (Master pre-launch fix) --------------------------
/** Tier keutamaan mood daripada moodFit (0..1). Padanan mood kuat = tier tinggi. */
export function moodPriorityTier(moodFit: number): number {
  if (moodFit >= 0.85) return 3;
  if (moodFit >= 0.6) return 2;
  if (moodFit >= 0.4) return 1;
  return 0;
}

/**
 * Re-rank KEUTAMAAN MOOD (stabil) — peringkat penyusun mood yang JELAS (directive E):
 * calon dengan padanan mood lebih kuat (moodFit tinggi) diangkat ke hadapan; dalam
 * tier yang SAMA, kekalkan susunan relevans/kepelbagaian asal (tiebreak). Ini
 * menjadikan mood mempengaruhi hasil TERATAS secara nyata TANPA membuang relevans
 * asas, dan bila tiada calon padanan-mood (semua tier sama) susunan kekal (jujur:
 * bukti-mood tidak mencukupi). Deterministik & tulen. Hanya dipakai bila mood dipilih.
 */
export function applyMoodPriority(
  ranked: readonly PlaceCandidate[],
  moodFitById: (placeId: string) => number,
): PlaceCandidate[] {
  return ranked
    .map((p, i) => ({ p, i, tier: moodPriorityTier(moodFitById(p.placeId)) }))
    .sort((a, b) => (b.tier - a.tier) || (a.i - b.i))
    .map((x) => x.p);
}

// --- Alternative reuse ------------------------------------------------------
/** Pilih alternatif seterusnya yang sah (bukan shown/rejected/exclude). */
export function pickNextAlternative(
  remainingAlternativeIds: readonly string[],
  excludeIds: readonly string[],
): { nextId: string | null; remaining: string[] } {
  const excl = new Set(excludeIds);
  const remaining = remainingAlternativeIds.filter((id) => !excl.has(id));
  return { nextId: remaining[0] ?? null, remaining };
}

// --- Bounded provider query planning ----------------------------------------
export const MAX_COLD_PROVIDER_QUERIES = 3;
/**
 * Berapa kueri provider dibenarkan? 0 jika cache sudah cukup. Had keras 3.
 */
export function planProviderQueries(
  cachedUniqueEligible: number,
  targetUnique: number,
  cap: number = MAX_COLD_PROVIDER_QUERIES,
): number {
  if (cachedUniqueEligible >= targetUnique) return 0;
  // Anggarkan ~20 unik setiap kueri; had pada `cap`.
  const deficit = targetUnique - cachedUniqueEligible;
  return Math.min(cap, Math.max(1, Math.ceil(deficit / 20)));
}

/** Gabung + nyahduplikasi batch mengikut placeId (kekalkan yang pertama). */
export function mergeDedupe(batches: readonly PlaceCandidate[][]): PlaceCandidate[] {
  const byId = new Map<string, PlaceCandidate>();
  for (const batch of batches) {
    for (const c of batch) if (!byId.has(c.placeId)) byId.set(c.placeId, c);
  }
  return [...byId.values()];
}

// --- Explore pagination (over an already-ranked pool) -----------------------
export interface PageResult {
  pageItems: PlaceCandidate[];
  nextCursor: number | null;
  endOfResults: boolean;
}
/** Halaman deterministik dari pool tersusun (tiada pendua merentas halaman). */
export function paginateRanked(
  ranked: readonly PlaceCandidate[],
  cursor: number,
  pageSize: number = 12,
): PageResult {
  const start = Math.max(0, cursor);
  const pageItems = ranked.slice(start, start + pageSize);
  const nextStart = start + pageItems.length;
  const end = nextStart >= ranked.length;
  return { pageItems: [...pageItems], nextCursor: end ? null : nextStart, endOfResults: end };
}
