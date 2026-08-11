/** Phase 1.2 — set media dengan status kelulusan + fallback eksplisit. */
import { EpochMillis } from "./common";
import { MediaStatus, SourceType } from "./placeEnums";

export interface PlaceMediaItem {
  mediaId: string;
  /** URL diluluskan (cth. googleusercontent). null/undefined = tiada. */
  url?: string;
  status: MediaStatus;
  sourceType: SourceType;
  attribution?: string;
  approvedBy?: string;
  approvedAt?: EpochMillis;
  /** true = ilustrasi generik/fallback (bukan foto venue sebenar). */
  isFallback: boolean;
}

export interface PlaceMediaSet {
  canonicalMediaId?: string;
  items: PlaceMediaItem[];
}
