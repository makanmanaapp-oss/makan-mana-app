/** Phase 1.4 — skor duplikat berpemberat + penalti (rujuk PDF §8.2). */
import { clamp01 } from "../common";
import { DedupConfig, DEFAULT_DEDUP_CONFIG } from "./config";
import { DuplicateSignalSet } from "./duplicateSignals";

export interface DuplicatePenaltyBreakdown {
  branchConflict: number;
  coordinateConflict: number;
  phoneConflict: number;
  addressConflict: number;
  total: number;
}

export interface DuplicateScoreResult {
  baseScore: number;
  penalties: DuplicatePenaltyBreakdown;
  adjustedScore: number; // 0..1
}

function num(v: number | boolean): number {
  return typeof v === "boolean" ? (v ? 1 : 0) : v;
}

export function computeDuplicateScore(
  signals: DuplicateSignalSet,
  config: DedupConfig = DEFAULT_DEDUP_CONFIG,
): DuplicateScoreResult {
  const w = config.weights;
  const base =
    w.providerId * num(signals.exactProviderIdMatch.value) +
    w.verifiedPhone * num(signals.verifiedPhoneMatch.value) +
    w.geoProximity * num(signals.geoProximity.value) +
    w.nameSimilarity * num(signals.normalizedNameSimilarity.value) +
    w.addressSimilarity * num(signals.addressSimilarity.value) +
    w.websiteMatch * num(signals.websiteDomainMatch.value);

  const p = config.penalties;
  const branchConflict = num(signals.differentBranchIndicator.value) ? p.branchConflict : 0;
  const coordinateConflict = num(signals.coordinateConflict.value) ? p.coordinateConflict : 0;
  const phoneConflict = num(signals.phoneConflict.value) ? p.phoneConflict : 0;
  const addressConflict = num(signals.addressConflict.value) ? p.addressConflict : 0;
  const total = branchConflict + coordinateConflict + phoneConflict + addressConflict;

  return {
    baseScore: Math.round(base * 1000) / 1000,
    penalties: { branchConflict, coordinateConflict, phoneConflict, addressConflict, total },
    adjustedScore: clamp01(Math.round((base - total) * 1000) / 1000),
  };
}
