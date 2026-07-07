import {db} from "../config/firebase";

/**
 * Skor komuniti kedai: purata Bayesian berwajaran.
 * - Prior m=3.8 dengan berat C=5: kedai sikit ulasan ditarik ke prior,
 *   jadi 2 ulasan 5* tidak mengalahkan 200 ulasan 4.6*.
 * - Verified dine-in (meal/checkin) berat 1.0; delivery 0.6.
 * - Ulasan >180 hari berat susut 0.7 (kedai boleh berubah).
 */
const PRIOR_MEAN = 3.8;
const PRIOR_WEIGHT = 5;
const DELIVERY_WEIGHT = 0.6;
const STALE_DAYS = 180;
const STALE_FACTOR = 0.7;

export async function recomputePlaceRating(placeId: string): Promise<void> {
  const snap = await db
    .collection("place_reviews")
    .where("placeId", "==", placeId)
    .where("status", "==", "approved")
    .limit(500)
    .get();

  let weightSum = 0;
  let weightedTotal = 0;
  const now = Date.now();
  for (const doc of snap.docs) {
    const d = doc.data();
    const rating = (d.rating as number) ?? 0;
    if (rating < 1 || rating > 5) continue;
    let w = d.source === "delivery" ? DELIVERY_WEIGHT : 1.0;
    const createdAt = d.createdAt?.toDate?.() as Date | undefined;
    if (createdAt &&
        now - createdAt.getTime() > STALE_DAYS * 86400000) {
      w *= STALE_FACTOR;
    }
    weightSum += w;
    weightedTotal += rating * w;
  }

  const score = weightSum === 0 ?
    null :
    (PRIOR_MEAN * PRIOR_WEIGHT + weightedTotal) /
      (PRIOR_WEIGHT + weightSum);

  await db.collection("place_details").doc(placeId).set(
    {
      communityRating: score === null ? null : Math.round(score * 10) / 10,
      communityCount: snap.size,
      communityUpdatedAt: new Date(),
    },
    {merge: true},
  );
}

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const r = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}
