import {db, FieldValue} from "../config/firebase";
import {currentTimeSlot} from "../utils/timeSlot";

export interface EventInput {
  userId: string;
  eventType: string;
  placeId?: string | null;
  placeNameSnapshot?: string | null;
  suggestionId?: string | null;
  sessionId?: string | null;
  mood?: string | null;
  languageCode?: string | null;
  plan?: string | null;
  // Prompt 8: skema standard (semua pilihan; backward-compatible).
  sourceScreen?: string | null;
  sourceMode?: string | null;
  resultSource?: string | null;
  isSample?: boolean;
  isPreview?: boolean;
  radiusMeters?: number | null;
  matchScore?: number | null;
  metadata?: Record<string, unknown>;
}

/** Log event AI Brain. Kegagalan tidak boleh menjatuhkan aliran utama. */
export async function logEvent(input: EventInput): Promise<void> {
  try {
    await db.collection("events").add({
      schemaVersion: 1,
      userId: input.userId,
      eventType: input.eventType,
      placeId: input.placeId ?? null,
      placeNameSnapshot: input.placeNameSnapshot ?? null,
      suggestionId: input.suggestionId ?? null,
      sessionId: input.sessionId ?? null,
      mood: input.mood ?? null,
      languageCode: input.languageCode ?? null,
      plan: input.plan ?? null,
      // Prompt 8: sumber backend + medan mod/hasil standard.
      source: "backend",
      sourceScreen: input.sourceScreen ?? null,
      sourceMode: input.sourceMode ?? null,
      resultSource: input.resultSource ?? null,
      isSample: input.isSample ?? false,
      isPreview: input.isPreview ?? false,
      radiusMeters: input.radiusMeters ?? null,
      matchScore: input.matchScore ?? null,
      deviceType: "backend",
      timeSlot: currentTimeSlot(),
      metadata: input.metadata ?? {},
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error(`logEvent ${input.eventType} gagal:`, e);
  }
}
