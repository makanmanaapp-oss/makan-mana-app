/** Phase 1.2 — waktu operasi dengan keadaan eksplisit. */
import { HoursState } from "./placeEnums";

/** Julat waktu operasi dalam minit-minggu [buka, tutup). */
export interface OpeningPeriod {
  openMinuteOfWeek: number;
  closeMinuteOfWeek: number;
}

/**
 * Waktu operasi. `hoursState` MESTI eksplisit — waktu tidak diketahui bukan
 * "buka" (baiki risiko F-04 audit Phase 1.1). `periods` hanya bermakna bila
 * `hoursState === "known"`.
 */
export interface PlaceHoursData {
  hoursState: HoursState;
  periods?: OpeningPeriod[];
}
