/** Phase 1.2 — alias & merge-state (kontrak sahaja; enjin dedup = Phase 1.4). */
import { EpochMillis } from "./common";
import { MergeStatus, SourceType } from "./placeEnums";
import { SourceReference } from "./placeSource";

/**
 * Jenis alias. `google_place_id` ialah kunci keserasian: placeId Google
 * semasa (dipakai favorites/meals/suggestions/deep-link) menjadi alias yang
 * menunjuk ke `canonicalPlaceId` — tiada rujukan pengguna pecah bila migrasi.
 */
export const ALIAS_TYPES = [
  "google_place_id",
  "legacy_place_id",
  "provider_id",
  "former_name",
  "merged_from",
] as const;
export type AliasType = (typeof ALIAS_TYPES)[number];

export interface PlaceAlias {
  aliasId: string;
  canonicalPlaceId: string;
  aliasType: AliasType;
  sourceType?: SourceType;
  sourceRecordId?: string;
  createdAt: EpochMillis;
  reason: string;
}

export interface MergeState {
  mergeStatus: MergeStatus;
  /** Sasaran canonical bila digabung/superseded. */
  duplicateOf?: string;
  mergeConfidence?: number;
  mergedAt?: EpochMillis;
  mergedBy?: string;
  /** Sejarah sumber dikekalkan — tiada pemadaman merosakkan. */
  preservedSourceRefs: SourceReference[];
}
