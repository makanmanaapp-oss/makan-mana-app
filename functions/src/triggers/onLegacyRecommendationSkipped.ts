import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {db} from "../config/firebase";
import {isRealPlaceId} from "../domain/places/realPlaceIdentity";
import {recordRecommendationReject} from "../services/recommendationDeliveryService";

/** Older Home preview clients called an explicit Reject a "skip" and did not
 * submit feedback. Bridge only explicit reason-bearing skips of an outlet the
 * server actually issued to that user. Plain scroll/views are never rejects. */
export async function ingestLegacyRecommendationSkip(eventId: string, data: Record<string, unknown>): Promise<boolean> {
  const metadata = data.metadata as Record<string, unknown> | undefined;
  const uid = data.userId;
  const placeId = data.placeId;
  if (data.eventType !== "suggestion_skipped" || data.isSample === true ||
      typeof uid !== "string" || !uid || uid.includes("/") ||
      typeof placeId !== "string" || placeId.includes("/") || placeId.length > 200 || !isRealPlaceId(placeId) ||
      typeof metadata?.reason !== "string" || !metadata.reason.trim()) return false;
  const shown = await db.collection("users").doc(uid).collection("suggestions")
    .where("placeId", "==", placeId).limit(1).get();
  if (shown.empty) return false;
  await recordRecommendationReject(uid, placeId, `legacy-skip:${eventId}`, metadata.reason);
  return true;
}

export const onLegacyRecommendationSkipped = onDocumentCreated({document: "events/{eventId}", retry: true}, async (event) => {
  const data = event.data?.data();
  if (data) await ingestLegacyRecommendationSkip(event.params.eventId, data);
});
