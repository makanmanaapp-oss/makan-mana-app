import {timingSafeEqual} from "node:crypto";

import {FieldPath} from "firebase-admin/firestore";
import {onRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";

import {db} from "../config/firebase";
import {RESTAURANT_POST_TYPE} from "../domain/feed/postTypes";
import {
  buildMenuCommentMirrorRecord,
  buildSocialPostMirrorRecord,
  type MenuCommentMirrorRecord,
  type SocialPostMirrorRecord,
} from "../domain/restaurantEngagement/mirrorPayload";
import {CONTROL_CENTER_SYNC_SECRET, pushMirrorBatch} from "./mirrorEventPush";

/**
 * Wave 3C — narrow, read-only Firebase → Control Center engagement mirror.
 *
 * Reuses the EXISTING production-safe mirror pattern (CONTROL_CENTER_SYNC_SECRET
 * + /api/internal/sync/mirror + idempotent eventId batches). Firestore stays
 * authoritative; the Control Center mirror is an observational read model and
 * can never write back. No follower identity, no merchant account internals and
 * no merchant actor UID are ever sent. Secrets are never logged.
 *
 * Datasets:
 *  - restaurant posts  (feed_posts WHERE postType == restaurant_post)  → social_post
 *  - menu comments     (menu_comments, incl. official restaurant replies) → menu_comment
 *
 * The feed_posts read is deliberately scoped to restaurant posts so this is not a
 * broad dump of ordinary user content.
 */

const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_MAX_PAGES = 25;
const MAX_PAGE_SIZE = 500;
const MAX_PAGES = 50;

type SyncBody = {pageSize?: number; maxPages?: number};

type DatasetResult = {
  sourceRead: number;
  recordsSent: number;
  batchesSent: number;
  complete: boolean;
  nextCursor: string | null;
};

type ReconcileResult = {
  status: "OK";
  readOnly: true;
  source: "feed_posts(restaurant_post)+menu_comments";
  dataset: "social_engagement";
  restaurantPosts: DatasetResult;
  menuComments: DatasetResult;
  recordsSent: number;
  batchesSent: number;
  complete: boolean;
};

function bearerToken(header: string | undefined): string {
  if (!header?.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}


async function reconcileDataset<T>(params: {
  entityType: "social_post" | "menu_comment";
  secret: string;
  runId: string;
  pageSize: number;
  maxPages: number;
  buildQuery: (pageSize: number) => FirebaseFirestore.Query;
  sanitize: (id: string, data: Record<string, unknown>) => T | null;
}): Promise<DatasetResult> {
  let cursor: string | undefined;
  let sourceRead = 0;
  let recordsSent = 0;
  let batchesSent = 0;
  let complete = false;

  for (let page = 0; page < params.maxPages; page++) {
    let query = params.buildQuery(params.pageSize);
    if (cursor) query = query.startAfter(cursor);

    const snapshot = await query.get();
    if (snapshot.empty) {
      complete = true;
      break;
    }

    const records = snapshot.docs
      .map((doc) => params.sanitize(doc.id, doc.data() as Record<string, unknown>))
      .filter((record): record is T => record !== null);

    await pushMirrorBatch({
      entityType: params.entityType,
      records: records as SocialPostMirrorRecord[] | MenuCommentMirrorRecord[],
      secret: params.secret,
      eventId: `${params.entityType}-mirror-${params.runId}-${page + 1}`,
    });

    sourceRead += snapshot.size;
    recordsSent += records.length;
    if (records.length > 0) batchesSent++;
    cursor = snapshot.docs[snapshot.docs.length - 1].id;
    if (snapshot.size < params.pageSize) {
      complete = true;
      break;
    }
  }

  return {sourceRead, recordsSent, batchesSent, complete, nextCursor: complete ? null : cursor ?? null};
}

async function reconcileEngagement(params: {
  secret: string;
  runId: string;
  pageSize: number;
  maxPages: number;
}): Promise<ReconcileResult> {
  const restaurantPosts = await reconcileDataset<SocialPostMirrorRecord>({
    entityType: "social_post",
    secret: params.secret,
    runId: params.runId,
    pageSize: params.pageSize,
    maxPages: params.maxPages,
    buildQuery: (pageSize) => db
      .collection("feed_posts")
      .where("postType", "==", RESTAURANT_POST_TYPE)
      .orderBy(FieldPath.documentId())
      .limit(pageSize),
    sanitize: buildSocialPostMirrorRecord,
  });

  const menuComments = await reconcileDataset<MenuCommentMirrorRecord>({
    entityType: "menu_comment",
    secret: params.secret,
    runId: params.runId,
    pageSize: params.pageSize,
    maxPages: params.maxPages,
    buildQuery: (pageSize) => db
      .collection("menu_comments")
      .orderBy(FieldPath.documentId())
      .limit(pageSize),
    sanitize: buildMenuCommentMirrorRecord,
  });

  return {
    status: "OK",
    readOnly: true,
    source: "feed_posts(restaurant_post)+menu_comments",
    dataset: "social_engagement",
    restaurantPosts,
    menuComments,
    recordsSent: restaurantPosts.recordsSent + menuComments.recordsSent,
    batchesSent: restaurantPosts.batchesSent + menuComments.batchesSent,
    complete: restaurantPosts.complete && menuComments.complete,
  };
}

/** Manual authenticated read-only engagement mirror refresh. */
export const syncSocialEngagementToControlCenter = onRequest(
  {secrets: [CONTROL_CENTER_SYNC_SECRET], timeoutSeconds: 540, memory: "512MiB", maxInstances: 1},
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).json({error: "POST required."});
      return;
    }
    const secret = CONTROL_CENTER_SYNC_SECRET.value();
    const presented = bearerToken(request.header("authorization"));
    if (!secret || !presented || !safeEqual(presented, secret)) {
      response.status(401).json({error: "Unauthorized engagement mirror refresh."});
      return;
    }

    const body = (request.body ?? {}) as SyncBody;
    const pageSize = boundedInteger(body.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const maxPages = boundedInteger(body.maxPages, DEFAULT_MAX_PAGES, 1, MAX_PAGES);

    try {
      const result = await reconcileEngagement({secret, runId: `manual-${Date.now()}`, pageSize, maxPages});
      response.status(200).json(result);
    } catch (error) {
      console.error("Engagement mirror refresh failed", {
        message: error instanceof Error ? error.message.slice(0, 500) : "unknown",
      });
      response.status(500).json({error: "Engagement mirror refresh failed."});
    }
  },
);

/** Automatic read-only engagement mirror reconciliation every 5 hours. */
export const syncSocialEngagementToControlCenterEvery5Hours = onSchedule(
  {
    schedule: "every 5 hours",
    timeZone: "Asia/Kuala_Lumpur",
    secrets: [CONTROL_CENTER_SYNC_SECRET],
    timeoutSeconds: 540,
    memory: "512MiB",
    maxInstances: 1,
  },
  async (event) => {
    const secret = CONTROL_CENTER_SYNC_SECRET.value();
    if (!secret) throw new Error("CONTROL_CENTER_SYNC_SECRET is unavailable.");
    const result = await reconcileEngagement({
      secret,
      runId: `scheduled-${Date.parse(event.scheduleTime) || Date.now()}`,
      pageSize: DEFAULT_PAGE_SIZE,
      maxPages: DEFAULT_MAX_PAGES,
    });
    console.log("Engagement mirror scheduled refresh complete", {
      restaurantPostRecords: result.restaurantPosts.recordsSent,
      menuCommentRecords: result.menuComments.recordsSent,
      batchesSent: result.batchesSent,
      complete: result.complete,
    });
  },
);
