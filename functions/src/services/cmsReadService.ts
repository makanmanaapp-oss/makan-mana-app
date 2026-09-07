/**
 * WAVE 5 — public CMS read boundary.
 *
 * Mobile never queries `cms_content` itself: rules keep it server-only, and
 * eligibility depends on the server clock plus viewer attributes a client must
 * not be trusted to assert. This service is the single path.
 *
 * The projection returned is already filtered, ordered and capped, so the app
 * renders what it is given rather than re-deciding anything.
 */
import {db} from "../config/firebase";
import {
  CMS_COLLECTION,
  CMS_COLLECTIONS_COLLECTION,
  CMS_STATUS_ACTIVE,
  CMS_STATUS_SCHEDULED,
  PLACEMENT_RENDER_LIMIT,
  PLACEMENT_RESTAURANT_DETAIL,
  type CmsPlacement,
  type CmsStatus,
} from "../domain/cms/cmsTypes";
import {
  compareCmsOrder,
  isCmsPubliclyVisible,
  viewerMatchesTargeting,
  type ViewerContext,
} from "../domain/cms/cmsLifecycle";
import {
  targetingOf,
  toPublicCmsContent,
  type PublicCmsContent,
} from "../domain/cms/cmsDocument";

/** Only these are worth loading. Draft/expired/archived can never render. */
const CANDIDATE_STATUSES: CmsStatus[] = [CMS_STATUS_ACTIVE, CMS_STATUS_SCHEDULED];

export interface CmsReadResult {
  content: PublicCmsContent[];
  collections: PublicCmsCollection[];
}

export interface PublicCmsCollection {
  collectionId: string;
  title: string;
  description: string;
  imagePath: string | null;
  canonicalPlaceIds: string[];
  placement: string;
  priority: number;
}

/**
 * Eligible content for one placement.
 *
 * `canonicalPlaceId` is required for the restaurant_detail placement and
 * ignored elsewhere: a restaurant banner may only ever appear on the
 * restaurant it names, so an unrelated restaurant can never surface it.
 */
export async function readPublicCmsContent(params: {
  placement: CmsPlacement;
  viewer: ViewerContext;
  canonicalPlaceId?: string | null;
  nowMs?: number;
}): Promise<PublicCmsContent[]> {
  const nowMs = params.nowMs ?? Date.now();
  const targetPlace = (params.canonicalPlaceId ?? "").trim();
  if (params.placement === PLACEMENT_RESTAURANT_DETAIL && !targetPlace) return [];

  let snap;
  try {
    let query = db.collection(CMS_COLLECTION)
      .where("placement", "==", params.placement)
      .where("status", "in", CANDIDATE_STATUSES);
    if (params.placement === PLACEMENT_RESTAURANT_DETAIL) {
      query = query.where("canonicalPlaceId", "==", targetPlace);
    }
    snap = await query.limit(PLACEMENT_RENDER_LIMIT * 8).get();
  } catch (error) {
    // A CMS read must never take down Home, Explore or Restaurant Detail.
    console.error("readPublicCmsContent failed", {
      placement: params.placement,
      message: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return [];
  }

  const eligible: {item: PublicCmsContent; startsAtMs: number}[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const stored = typeof data.status === "string" ? data.status as CmsStatus : null;
    if (!stored) continue;
    const startsAtMs = typeof data.startsAtMs === "number" ? data.startsAtMs : null;
    const endsAtMs = typeof data.endsAtMs === "number" ? data.endsAtMs : null;
    if (!isCmsPubliclyVisible(stored, startsAtMs, endsAtMs, nowMs)) continue;
    if (!viewerMatchesTargeting(targetingOf(data.targeting), params.viewer)) continue;

    const item = toPublicCmsContent(doc.id, data);
    if (!item) continue;
    // Defence in depth: the query already scoped this, but a mis-scoped row
    // must not leak onto another restaurant's page.
    if (params.placement === PLACEMENT_RESTAURANT_DETAIL
      && item.canonicalPlaceId !== targetPlace) continue;

    eligible.push({item, startsAtMs: startsAtMs ?? 0});
  }

  eligible.sort((a, b) => compareCmsOrder(
    {priority: a.item.priority, startsAtMs: a.startsAtMs, contentId: a.item.contentId},
    {priority: b.item.priority, startsAtMs: b.startsAtMs, contentId: b.item.contentId},
  ));

  return eligible.slice(0, PLACEMENT_RENDER_LIMIT).map((e) => e.item);
}

/**
 * Curated discovery collections for one placement.
 *
 * Restaurant references are carried as canonical ids only. A collection with
 * none left is omitted rather than rendered empty — a curated row with nothing
 * in it is worse than no row.
 */
export async function readPublicCmsCollections(params: {
  placement: CmsPlacement;
  viewer: ViewerContext;
  nowMs?: number;
}): Promise<PublicCmsCollection[]> {
  const nowMs = params.nowMs ?? Date.now();
  let snap;
  try {
    snap = await db.collection(CMS_COLLECTIONS_COLLECTION)
      .where("placement", "==", params.placement)
      .where("status", "in", CANDIDATE_STATUSES)
      .limit(20)
      .get();
  } catch (error) {
    console.error("readPublicCmsCollections failed", {
      placement: params.placement,
      message: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return [];
  }

  const out: {item: PublicCmsCollection; startsAtMs: number}[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const stored = typeof data.status === "string" ? data.status as CmsStatus : null;
    if (!stored) continue;
    const startsAtMs = typeof data.startsAtMs === "number" ? data.startsAtMs : null;
    const endsAtMs = typeof data.endsAtMs === "number" ? data.endsAtMs : null;
    if (!isCmsPubliclyVisible(stored, startsAtMs, endsAtMs, nowMs)) continue;
    if (!viewerMatchesTargeting(targetingOf(data.targeting), params.viewer)) continue;

    const title = typeof data.title === "string" ? data.title.trim() : "";
    if (!title) continue;
    const ids = Array.isArray(data.canonicalPlaceIds)
      ? data.canonicalPlaceIds
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.trim())
      : [];
    // Dangling or empty membership fails closed by omission.
    if (ids.length === 0) continue;

    out.push({
      item: {
        collectionId: doc.id,
        title,
        description: typeof data.description === "string" ? data.description : "",
        imagePath: typeof data.imagePath === "string" && data.imagePath.trim()
          ? data.imagePath.trim() : null,
        canonicalPlaceIds: ids,
        placement: params.placement,
        priority: typeof data.priority === "number" ? data.priority : 100,
      },
      startsAtMs: startsAtMs ?? 0,
    });
  }

  out.sort((a, b) => compareCmsOrder(
    {priority: a.item.priority, startsAtMs: a.startsAtMs, contentId: a.item.collectionId},
    {priority: b.item.priority, startsAtMs: b.startsAtMs, contentId: b.item.collectionId},
  ));
  return out.slice(0, 5).map((e) => e.item);
}
