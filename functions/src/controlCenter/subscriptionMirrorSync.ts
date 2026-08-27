import {timingSafeEqual} from "node:crypto";

import {FieldPath} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";

import {db} from "../config/firebase";

const CONTROL_CENTER_SYNC_SECRET = defineSecret("CONTROL_CENTER_SYNC_SECRET");
const CONTROL_CENTER_MIRROR_URL =
  "https://makanmana-control-center.vercel.app/api/internal/sync/mirror";
const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_MAX_PAGES = 25;
const MAX_PAGE_SIZE = 500;
const MAX_PAGES = 50;

type SyncBody = {
  pageSize?: number;
  maxPages?: number;
};

type SubscriptionMirrorRecord = {
  firebase_uid: string;
  provider: "google_play";
  product_id: string | null;
  plan: string | null;
  status: string | null;
  current_period_start: null;
  current_period_end: string | null;
  auto_renew: boolean | null;
  trial_type: null;
  trial_started_at: null;
  trial_ends_at: null;
  coupon_id: null;
  cancelled_at: null;
  expired_at: string | null;
};

type ReconcileResult = {
  status: "OK";
  readOnly: true;
  source: "users";
  dataset: "subscriptions";
  sourceRead: number;
  recordsSent: number;
  batchesSent: number;
  complete: boolean;
  nextCursor: string | null;
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

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function expiryIso(value: unknown): string | null {
  const millis = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(millis) || millis <= 0) return null;
  try {
    return new Date(millis).toISOString();
  } catch {
    return null;
  }
}

function sanitizeSubscription(
  uid: string,
  data: Record<string, unknown>,
): SubscriptionMirrorRecord {
  const status = nullableText(data.planStatus);
  const periodEnd = expiryIso(data.subscriptionExpiryMillis);
  return {
    firebase_uid: uid,
    provider: "google_play",
    product_id: nullableText(data.subscriptionProductId),
    plan: nullableText(data.plan),
    status,
    current_period_start: null,
    current_period_end: periodEnd,
    auto_renew: nullableBoolean(data.subscriptionAutoRenewing),
    trial_type: null,
    trial_started_at: null,
    trial_ends_at: null,
    coupon_id: null,
    cancelled_at: null,
    expired_at: status === "expired" ? periodEnd : null,
  };
}

async function pushSubscriptions(
  records: SubscriptionMirrorRecord[],
  secret: string,
  eventId: string,
): Promise<void> {
  if (records.length === 0) return;
  const response = await fetch(CONTROL_CENTER_MIRROR_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sourceSystem: "google_play_backend",
      eventId,
      entityType: "subscription",
      records,
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(
      `Control Center subscription mirror rejected (${response.status}): ${detail}`,
    );
  }
}

async function reconcileSubscriptions(params: {
  secret: string;
  runId: string;
  pageSize: number;
  maxPages: number;
}): Promise<ReconcileResult> {
  let cursor: string | undefined;
  let sourceRead = 0;
  let recordsSent = 0;
  let batchesSent = 0;
  let complete = false;

  for (let page = 0; page < params.maxPages; page++) {
    let query = db
      .collection("users")
      .where("planSource", "==", "google_play")
      .orderBy(FieldPath.documentId())
      .limit(params.pageSize);
    if (cursor) query = query.startAfter(cursor);

    const snapshot = await query.get();
    if (snapshot.empty) {
      complete = true;
      break;
    }

    const records = snapshot.docs.map((doc) =>
      sanitizeSubscription(doc.id, doc.data() as Record<string, unknown>),
    );
    await pushSubscriptions(
      records,
      params.secret,
      `subscription-mirror-${params.runId}-${page + 1}`,
    );

    sourceRead += snapshot.size;
    recordsSent += records.length;
    batchesSent++;
    cursor = snapshot.docs[snapshot.docs.length - 1].id;
    if (snapshot.size < params.pageSize) {
      complete = true;
      break;
    }
  }

  return {
    status: "OK",
    readOnly: true,
    source: "users",
    dataset: "subscriptions",
    sourceRead,
    recordsSent,
    batchesSent,
    complete,
    nextCursor: complete ? null : cursor ?? null,
  };
}

/**
 * Manual, authenticated Firebase -> Control Center subscription mirror refresh.
 * Reads canonical user entitlement fields only. It never calls Google Play,
 * never grants/revokes entitlement, and never reads purchase-token vault data.
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
      response.status(401).json({error: "Unauthorized subscription mirror refresh."});
      return;
    }

    const body = (request.body ?? {}) as SyncBody;
    const pageSize = boundedInteger(
      body.pageSize,
      DEFAULT_PAGE_SIZE,
      1,
      MAX_PAGE_SIZE,
    );
    const maxPages = boundedInteger(
      body.maxPages,
      DEFAULT_MAX_PAGES,
      1,
      MAX_PAGES,
    );

    try {
      const result = await reconcileSubscriptions({
        secret,
        runId: `manual-${Date.now()}`,
        pageSize,
        maxPages,
      });
      response.status(200).json(result);
    } catch (error) {
      console.error("Subscription mirror refresh failed", {
        message: error instanceof Error ? error.message.slice(0, 500) : "unknown",
      });
      response.status(500).json({error: "Subscription mirror refresh failed."});
    }
  },
);

/**
 * Automatic read-only subscription mirror reconciliation every five hours.
 * Firebase remains canonical; this job only refreshes the Control Center mirror.
 */
export const syncSubscriptionsToControlCenterEvery5Hours = onSchedule(
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

    const runId = `scheduled-${Date.parse(event.scheduleTime) || Date.now()}`;
    const result = await reconcileSubscriptions({
      secret,
      runId,
      pageSize: DEFAULT_PAGE_SIZE,
      maxPages: DEFAULT_MAX_PAGES,
    });

    console.log("Subscription mirror scheduled refresh complete", {
      sourceRead: result.sourceRead,
      recordsSent: result.recordsSent,
      batchesSent: result.batchesSent,
      complete: result.complete,
    });
  },
);
