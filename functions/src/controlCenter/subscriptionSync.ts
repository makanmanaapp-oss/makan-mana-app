import {createHash, timingSafeEqual} from "node:crypto";

import {FieldPath} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";

import {db} from "../config/firebase";

const CONTROL_CENTER_SYNC_SECRET = defineSecret("CONTROL_CENTER_SYNC_SECRET");
const CONTROL_CENTER_MIRROR_URL =
  "https://makanmana-control-center.vercel.app/api/internal/sync/mirror";
const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_MAX_PAGES = 10;
const MAX_PAGE_SIZE = 500;
const MAX_PAGES = 25;

type SyncBody = {
  pageSize?: number;
  maxPages?: number;
  cursor?: string;
};

type JsonRecord = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "object") {
    const candidate = value as {toMillis?: () => number; toDate?: () => Date};
    if (typeof candidate.toMillis === "function") {
      const date = new Date(candidate.toMillis());
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
    if (typeof candidate.toDate === "function") {
      const date = candidate.toDate();
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
  }
  return null;
}

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

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function sanitizeSubscription(firebaseUid: string, data: JsonRecord): JsonRecord | null {
  const plan = text(data.plan);
  const planStatus = text(data.planStatus);
  const planSource = text(data.planSource);
  const productId = text(data.subscriptionProductId);
  const couponCode = text(data.couponCode);
  const couponStatus = text(data.couponStatus);
  const couponStartedAt = toIso(data.couponRedeemedAt);
  const couponEndsAt = toIso(data.couponExpiresAt);
  const playEndsAt = toIso(data.subscriptionExpiryMillis);
  const autoRenew = typeof data.subscriptionAutoRenewing === "boolean"
    ? data.subscriptionAutoRenewing
    : null;

  const hasSubscriptionSignal =
    plan === "pro" ||
    planStatus !== null ||
    planSource !== null ||
    productId !== null ||
    couponCode !== null ||
    couponStatus !== null ||
    playEndsAt !== null ||
    couponEndsAt !== null;
  if (!hasSubscriptionSignal) return null;

  const couponLike = planSource === "coupon" || planSource === "expired_coupon";
  const googlePlay = planSource === "google_play";
  const provider = googlePlay ? "google_play" : couponLike ? "coupon" : planSource ?? "legacy";
  const status =
    planStatus ??
    couponStatus ??
    (planSource === "expired_coupon" ? "expired" : "unknown");
  const periodEnd = googlePlay ? playEndsAt : couponLike ? couponEndsAt : playEndsAt ?? couponEndsAt;
  const expiredAt = status === "expired" ? periodEnd : null;

  return {
    firebase_uid: firebaseUid,
    provider,
    product_id: googlePlay ? productId : null,
    plan,
    status,
    current_period_start: couponLike ? couponStartedAt : null,
    current_period_end: periodEnd,
    auto_renew: googlePlay ? autoRenew : null,
    trial_type: couponLike ? "coupon" : null,
    trial_started_at: couponLike ? couponStartedAt : null,
    trial_ends_at: couponLike ? couponEndsAt : null,
    coupon_id: couponLike ? couponCode : null,
    cancelled_at: null,
    expired_at: expiredAt,
  };
}

function eventId(records: readonly JsonRecord[]): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(records))
    .digest("hex")
    .slice(0, 40);
  return `firebase:subscription:${digest}`;
}

async function pushBatch(records: JsonRecord[], secret: string): Promise<void> {
  if (records.length === 0) return;
  const response = await fetch(CONTROL_CENTER_MIRROR_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sourceSystem: "firebase",
      eventId: eventId(records),
      entityType: "subscription",
      records,
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    throw new Error(`Control Center subscription sync rejected (${response.status}): ${detail}`);
  }
}

/**
 * Manual read-only current-entitlement sync for Control Center.
 * Reads only server-maintained entitlement/coupon fields from users and never
 * mutates Firebase or calls Google Play. Missing legacy status is preserved as
 * "unknown" instead of being inferred as active.
 */
export const syncSubscriptionsToControlCenter = onRequest(
  {
    secrets: [CONTROL_CENTER_SYNC_SECRET],
    timeoutSeconds: 540,
    memory: "512MiB",
    maxInstances: 1,
  },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).json({error: "POST required."});
      return;
    }

    const secret = CONTROL_CENTER_SYNC_SECRET.value();
    const presented = bearerToken(request.header("authorization"));
    if (!secret || !presented || !safeEqual(presented, secret)) {
      response.status(401).json({error: "Unauthorized subscription sync trigger."});
      return;
    }

    const body = (request.body ?? {}) as SyncBody;
    const pageSize = boundedInteger(body.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const maxPages = boundedInteger(body.maxPages, DEFAULT_MAX_PAGES, 1, MAX_PAGES);
    let cursor = typeof body.cursor === "string" && body.cursor.trim() ? body.cursor.trim() : undefined;
    let sourceRead = 0;
    let recordsSent = 0;
    let batchesSent = 0;
    let complete = false;

    try {
      for (let page = 0; page < maxPages; page++) {
        let query = db.collection("users").orderBy(FieldPath.documentId()).limit(pageSize);
        if (cursor) query = query.startAfter(cursor);
        const snapshot = await query.get();
        if (snapshot.empty) {
          complete = true;
          break;
        }

        const records = snapshot.docs
          .map((doc) => sanitizeSubscription(doc.id, doc.data() as JsonRecord))
          .filter((record): record is JsonRecord => record !== null);
        await pushBatch(records, secret);

        sourceRead += snapshot.size;
        recordsSent += records.length;
        if (records.length > 0) batchesSent++;
        cursor = snapshot.docs[snapshot.docs.length - 1].id;
        if (snapshot.size < pageSize) {
          complete = true;
          break;
        }
      }

      response.status(200).json({
        status: "OK",
        readOnly: true,
        source: "users",
        dataset: "subscription",
        sourceRead,
        recordsSent,
        batchesSent,
        nextCursor: complete ? null : cursor ?? null,
        complete,
      });
    } catch (error) {
      console.error("Control Center subscription sync failed", {
        message: error instanceof Error ? error.message.slice(0, 800) : "unknown",
      });
      response.status(500).json({error: "Subscription sync failed."});
    }
  },
);
