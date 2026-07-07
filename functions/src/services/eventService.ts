import {db, FieldValue} from "../config/firebase";
import {currentTimeSlot} from "../utils/timeSlot";

export interface EventInput {
  userId: string;
  eventType: string;
  placeId?: string | null;
  suggestionId?: string | null;
  sessionId?: string | null;
  mood?: string | null;
  languageCode?: string | null;
  plan?: string | null;
  metadata?: Record<string, unknown>;
}

/** Log event AI Brain. Kegagalan tidak boleh menjatuhkan aliran utama. */
export async function logEvent(input: EventInput): Promise<void> {
  try {
    await db.collection("events").add({
      userId: input.userId,
      eventType: input.eventType,
      placeId: input.placeId ?? null,
      suggestionId: input.suggestionId ?? null,
      sessionId: input.sessionId ?? null,
      mood: input.mood ?? null,
      languageCode: input.languageCode ?? null,
      plan: input.plan ?? null,
      deviceType: "android",
      timeSlot: currentTimeSlot(),
      source: "cloud_function",
      metadata: input.metadata ?? {},
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error(`logEvent ${input.eventType} gagal:`, e);
  }
}
