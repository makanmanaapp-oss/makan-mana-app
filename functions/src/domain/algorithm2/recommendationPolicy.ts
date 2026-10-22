import {PlaceCandidate} from "../../types/place";

/** Product invariant. Neither rollout flags nor low supply may reduce it. */
export const RECOMMENDATION_COOLDOWN_MS = 26 * 60 * 60 * 1000;
export const RECOMMENDATION_POLICY_VERSION = "outlet_26h_v1";

export interface OutletMemory {
  lastShownAt?: number;
  lastRejectedAt?: number;
  rejectedAt?: number;
  suppressedUntil?: number;
  expiresAt?: number;
  rejectCount?: number;
  permanentAvoid?: boolean;
  reasons?: string[];
  reason?: string;
}

export function blockedUntil(memory: OutletMemory): number {
  return Math.max(
    typeof memory.lastShownAt === "number" ? memory.lastShownAt + RECOMMENDATION_COOLDOWN_MS : 0,
    typeof memory.lastRejectedAt === "number" ? memory.lastRejectedAt + RECOMMENDATION_COOLDOWN_MS : 0,
    typeof memory.rejectedAt === "number" ? memory.rejectedAt + RECOMMENDATION_COOLDOWN_MS : 0,
    memory.suppressedUntil ?? 0, memory.expiresAt ?? 0,
  );
}

export function mergeOutletMemory(records: readonly OutletMemory[]): OutletMemory {
  const merged: OutletMemory = {};
  for (const record of records) {
    for (const key of ["lastShownAt", "lastRejectedAt", "rejectedAt", "suppressedUntil", "expiresAt", "rejectCount"] as const) {
      const n = record[key];
      if (typeof n === "number" && Number.isFinite(n)) merged[key] = Math.max(merged[key] ?? 0, n);
    }
    merged.permanentAvoid = merged.permanentAvoid === true || record.permanentAvoid === true ||
      record.reasons?.includes("do_not_suggest_again") === true || record.reason === "do_not_suggest_again";
  }
  return merged;
}

export function outletKey(place: PlaceCandidate): string {
  return place.canonicalPlaceId?.trim() || place.placeId;
}

/** Stable partition AFTER all scoring/diversity/AI. A score cannot cross tiers. */
export function enforceRecommendationPolicy(
  ranked: readonly PlaceCandidate[],
  memoryFor: (place: PlaceCandidate) => OutletMemory,
  now: number,
): PlaceCandidate[] {
  const fresh: PlaceCandidate[] = [];
  const rejected: Array<{place: PlaceCandidate; memory: OutletMemory; index: number}> = [];
  const seen = new Set<string>();
  for (const [index, place] of ranked.entries()) {
    const key = outletKey(place);
    const memory = memoryFor(place);
    if (seen.has(key) || place.isOpen === false || memory.permanentAvoid || blockedUntil(memory) > now) continue;
    seen.add(key);
    if ((memory.rejectCount ?? 0) > 0 || memory.lastRejectedAt != null || memory.rejectedAt != null) {
      rejected.push({place, memory, index});
    } else fresh.push(place);
  }
  rejected.sort((a, b) =>
    ((a.memory.lastRejectedAt ?? a.memory.rejectedAt ?? 0) - (b.memory.lastRejectedAt ?? b.memory.rejectedAt ?? 0)) ||
    ((a.memory.rejectCount ?? 0) - (b.memory.rejectCount ?? 0)) || a.index - b.index);
  return [...fresh, ...rejected.map((row) => row.place)];
}
