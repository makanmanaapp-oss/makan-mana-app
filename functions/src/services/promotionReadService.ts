/**
 * WAVE 4 — Commercial Tools: public promotion read boundary.
 *
 * Mobile never queries `restaurant_promotions` itself: rules keep the raw
 * collection server-only, and eligibility depends on the viewer's plan, which
 * a client must not be trusted to assert. This service is the single path.
 *
 * Time truth is the SERVER's `Date.now()`. Deriving visibility here rather
 * than trusting a stored flag means an offer cannot survive `endsAt` because a
 * scheduled job was late, and cannot be revived by a device with a wrong clock.
 */
import {db} from "../config/firebase";
import {
  PROMOTION_COLLECTION,
  PROMOTION_STATUS_ACTIVE,
  PROMOTION_STATUS_SCHEDULED,
  PUBLIC_PROMOTIONS_LIMIT,
  type PromotionStatus,
} from "../domain/promotions/promotionTypes";
import {
  isPubliclyVisible,
  viewerIsEligible,
} from "../domain/promotions/promotionLifecycle";
import {
  toPublicPromotion,
  type PublicPromotion,
} from "../domain/promotions/promotionDocument";

/** Statuses worth loading at all. Draft/expired/archived can never render. */
const CANDIDATE_STATUSES: PromotionStatus[] = [
  PROMOTION_STATUS_ACTIVE,
  PROMOTION_STATUS_SCHEDULED,
];

/** Read the viewer's plan. Anything unknown or unreadable is treated as free. */
async function readViewerPlan(uid: string): Promise<string> {
  try {
    const snap = await db.collection("users").doc(uid).get();
    const plan = snap.exists ? snap.data()?.plan : null;
    return typeof plan === "string" && plan ? plan : "free";
  } catch {
    // Fail closed toward the LEAST access: an unreadable plan is 'free', so a
    // pro-only offer is hidden rather than shown by accident.
    return "free";
  }
}

/**
 * Active, time-valid, eligible offers for one canonical restaurant.
 *
 * `canonicalPlaceId` MUST already be the resolved canonical identity — this
 * service does not resolve aliases, because the caller
 * (`getRestaurantProfileV2`) has already proven identity and passing an
 * unresolved id here would silently return another restaurant's offers.
 */
export async function readPublicPromotions(
  canonicalPlaceId: string,
  viewerUid: string,
  nowMs: number = Date.now(),
): Promise<PublicPromotion[]> {
  const clean = canonicalPlaceId.trim();
  if (!clean) return [];

  let snap;
  try {
    snap = await db.collection(PROMOTION_COLLECTION)
      .where("canonicalPlaceId", "==", clean)
      .where("status", "in", CANDIDATE_STATUSES)
      .orderBy("startsAtMs", "asc")
      .limit(PUBLIC_PROMOTIONS_LIMIT * 4)
      .get();
  } catch (error) {
    // A promotions read must never take down Restaurant Detail.
    console.error("readPublicPromotions failed", {
      canonicalPlaceId: clean.slice(0, 120),
      message: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return [];
  }

  const visible: PublicPromotion[] = [];
  let needsPlan = false;
  const candidates: {promo: PublicPromotion; planGated: boolean}[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const stored = typeof data.status === "string" ? data.status as PromotionStatus : null;
    if (!stored) continue;
    const promo = toPublicPromotion(doc.id, data);
    if (!promo) continue;
    if (!isPubliclyVisible(stored, promo.startsAtMs, promo.endsAtMs, nowMs)) continue;
    const planGated = promo.eligibility.audience === "plan";
    if (planGated) needsPlan = true;
    candidates.push({promo, planGated});
  }

  // Only pay for the extra user read when some offer is actually plan-gated.
  const viewerPlan = needsPlan ? await readViewerPlan(viewerUid) : "free";

  for (const c of candidates) {
    if (c.planGated && !viewerIsEligible(c.promo.eligibility, viewerPlan)) continue;
    visible.push(c.promo);
    if (visible.length >= PUBLIC_PROMOTIONS_LIMIT) break;
  }

  return visible;
}
