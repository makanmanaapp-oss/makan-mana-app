/**
 * Phase 1.6 Part H & M — KONTRAK VERSI PENERBITAN (immutable + idempoten).
 *
 * Setiap penerbitan ialah rekod IMMUTABLE berversi. Hash kandungan
 * deterministik: kandungan yang sama → hash sama (idempoten), kandungan
 * berbeza → hash berbeza. Tiada penulisan produksi di sini.
 */
import { EpochMillis } from "../common";
import { PublicationStatus } from "../placeEnums";
import { CanonicalPlace } from "../canonicalPlace";
import { hashCanonical } from "../staging/hashing";
import { PublicationEligibilityResult } from "./eligibilityEngine";
import { WarningReason } from "./eligibilityConfig";
import { HonestDisplayState } from "./displayState";

/**
 * Snapshot penerbitan — salinan PENUH rekod yang diluluskan pada masa terbit.
 * Disimpan supaya rollback boleh memulihkan keadaan sebenar, bukan tekaan.
 */
export interface PlacePublicationSnapshot {
  place: CanonicalPlace;
  /** Keadaan paparan jujur yang diterbitkan bersama snapshot (Part J). */
  displayState?: HonestDisplayState;
}

/** Ringkasan kelayakan yang dibekukan bersama versi (bukti pada masa terbit). */
export interface EligibilitySnapshot {
  eligible: boolean;
  blockingReasons: string[];
  warnings: string[];
  overallFreshnessState: string;
  criticalExpiredFieldIds: string[];
  completenessScore: number;
  engineVersion: string;
  evaluatedAt: EpochMillis;
}

export interface PlacePublicationVersion {
  publicationId: string;
  placeId: string;
  versionNumber: number;
  sourceCanonicalVersion: string;
  snapshot: PlacePublicationSnapshot;
  publicationStatus: PublicationStatus;
  publishedBy: string;
  publishedAt: EpochMillis;
  effectiveFrom: EpochMillis;
  effectiveUntil?: EpochMillis;
  supersedesPublicationId?: string;
  rollbackOfPublicationId?: string;
  eligibilitySnapshot: EligibilitySnapshot;
  warnings: WarningReason[];
  changeSummary: string[];
  contentHash: string;
  algorithmVersion: string;
  configVersion: string;
  createdAt: EpochMillis;
}

/** Penunjuk versi AKTIF bagi satu kedai (emulator sahaja dalam fasa ini). */
export interface PlacePublicationHead {
  placeId: string;
  activePublicationId: string;
  activeVersionNumber: number;
  updatedAt: EpochMillis;
  updatedBy: string;
  /** Sebab perubahan penunjuk (publish / rollback / supersede). */
  reasonCode: string;
}

/**
 * Kandungan yang MENENTUKAN identiti penerbitan. Sengaja TIDAK termasuk
 * `publishedAt`, `publishedBy`, `versionNumber` atau ID — supaya menerbitkan
 * kandungan yang SAMA dua kali menghasilkan hash yang sama (idempoten).
 */
export interface PublicationContentInput {
  placeId: string;
  snapshot: PlacePublicationSnapshot;
  sourceCanonicalVersion: string;
  algorithmVersion: string;
  configVersion: string;
}

/**
 * Buang metadata terbitan yang TIDAK MEWAKILI kandungan sebelum hashing.
 * `displayState.derivedAt` ialah cap masa pengiraan, bukan fakta yang
 * diterbitkan — memasukkannya akan memecahkan idempotency (Part M) kerana
 * menerbitkan kandungan yang sama pada saat berbeza menghasilkan hash berbeza.
 */
function hashableSnapshot(snapshot: PlacePublicationSnapshot): unknown {
  if (!snapshot.displayState) return snapshot;
  const { derivedAt: _ignored, ...displayWithoutTimestamp } = snapshot.displayState;
  return { ...snapshot, displayState: displayWithoutTimestamp };
}

/** Hash kandungan deterministik (kunci diisih rekursif oleh hashCanonical). */
export function computePublicationContentHash(input: PublicationContentInput): string {
  return hashCanonical({
    placeId: input.placeId,
    snapshot: hashableSnapshot(input.snapshot),
    sourceCanonicalVersion: input.sourceCanonicalVersion,
    algorithmVersion: input.algorithmVersion,
    configVersion: input.configVersion,
  });
}

/**
 * ID penerbitan deterministik daripada hash kandungan. Percubaan menerbitkan
 * kandungan sama menghasilkan ID sama → repository mengembalikan versi
 * sedia ada dan bukan mencipta pendua.
 */
export function publicationIdFromContent(input: PublicationContentInput): string {
  return `pub_${computePublicationContentHash(input).slice(0, 32)}`;
}

export function rollbackId(
  placeId: string,
  fromPublicationId: string,
  targetPublicationId: string,
): string {
  const digest = hashCanonical({ placeId, fromPublicationId, targetPublicationId });
  return `rbk_${digest.slice(0, 32)}`;
}

/** Bina ringkasan kelayakan yang boleh dibekukan ke dalam versi. */
export function toEligibilitySnapshot(
  r: PublicationEligibilityResult,
  evaluatedAt: EpochMillis,
): EligibilitySnapshot {
  return {
    eligible: r.eligible,
    blockingReasons: [...r.blockingReasons],
    warnings: [...r.warnings],
    overallFreshnessState: r.freshnessResult.overallFreshnessState,
    criticalExpiredFieldIds: [...r.freshnessResult.criticalExpiredFieldIds],
    completenessScore: r.completenessResult.overallScore,
    engineVersion: r.version,
    evaluatedAt,
  };
}

/**
 * Bandingkan dua snapshot dan hasilkan ringkasan perubahan peringkat atas.
 * Deterministik (kunci diisih) — digunakan untuk `changeSummary`.
 */
export function diffPublicationSnapshots(
  previous: PlacePublicationSnapshot | undefined,
  next: PlacePublicationSnapshot,
): string[] {
  if (!previous) return ["initial_publication"];
  const changed: string[] = [];
  const a = previous.place as unknown as Record<string, unknown>;
  const b = next.place as unknown as Record<string, unknown>;
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
  for (const k of keys) {
    if (hashCanonical(a[k]) !== hashCanonical(b[k])) changed.push(k);
  }
  return changed.length > 0 ? changed : ["no_content_change"];
}

/** Pengesahan bentuk versi (dipanggil repository sebelum menulis). */
export function validatePublicationVersion(v: PlacePublicationVersion): string[] {
  const issues: string[] = [];
  if (!v.publicationId) issues.push("publicationId_missing");
  if (!v.placeId) issues.push("placeId_missing");
  if (!Number.isInteger(v.versionNumber) || v.versionNumber < 1) {
    issues.push("versionNumber_invalid");
  }
  if (!v.contentHash) issues.push("contentHash_missing");
  if (!v.publishedBy) issues.push("publishedBy_missing");
  if (v.effectiveUntil !== undefined && v.effectiveUntil < v.effectiveFrom) {
    issues.push("effectiveUntil_before_effectiveFrom");
  }
  const expected = computePublicationContentHash({
    placeId: v.placeId,
    snapshot: v.snapshot,
    sourceCanonicalVersion: v.sourceCanonicalVersion,
    algorithmVersion: v.algorithmVersion,
    configVersion: v.configVersion,
  });
  if (expected !== v.contentHash) issues.push("contentHash_mismatch");
  return issues;
}
