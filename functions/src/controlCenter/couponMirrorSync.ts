import {createHash, timingSafeEqual} from "node:crypto";

import {FieldPath, Timestamp} from "firebase-admin/firestore";
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

type CouponMirrorRecord = {
  coupon_key: string;
  code: string;
  active: boolean;
  plan: string | null;
  duration_days: number | null;
  max_redemptions: number | null;
  redeemed_count: number;
  valid_from: string | null;
  valid_until: string | null;
  one_use_per_user: boolean;
  allowed_email_count: number;
  allowed_uid_count: number;
  note: string | null;
  created_at: string | null;
  firebase_updated_at: string | null;
};

type CouponRedemptionMirrorRecord = {
  redemption_key: string;
  coupon_key: string;
  firebase_uid: string;
  plan: string | null;
  duration_days: number | null;
  redeemed_at: string | null;
  expires_at: string | null;
  previous_plan: string | null;
  status: string | null;
  source: "coupon";
  firebase_updated_at: string | null;
};

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
  source: "coupon_codes+coupon_redemptions";
  dataset: "coupons";
  coupons: DatasetResult;
  redemptions: DatasetResult;
  sourceRead: number;
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

function nullableInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

function timestampIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return new Date(value).toISOString();
  }
  return null;
}

function stableKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function sanitizeCoupon(
  code: string,
  data: Record<string, unknown>,
): CouponMirrorRecord {
  const allowedEmails = Array.isArray(data.allowedEmails) ? data.allowedEmails : [];
  const allowedUids = Array.isArray(data.allowedUids) ? data.allowedUids : [];
  return {
    coupon_key: stableKey(code),
    code,
    active: data.active === true,
    plan: nullableText(data.plan),
    duration_days: nullableInteger(data.durationDays),
    max_redemptions: nullableInteger(data.maxRedemptions),
    redeemed_count: nullableInteger(data.redeemedCount) ?? 0,
    valid_from: timestampIso(data.validFrom),
    valid_until: timestampIso(data.validUntil),
    one_use_per_user: data.oneUsePerUser !== false,
    allowed_email_count: allowedEmails.length,
    allowed_uid_count: allowedUids.length,
    note: nullableText(data.note),
    created_at: timestampIso(data.createdAt),
    firebase_updated_at: timestampIso(data.updatedAt),
  };
}

function sanitizeRedemption(
  documentId: string,
  data: Record<string, unknown>,
): CouponRedemptionMirrorRecord | null {
  const uid = nullableText(data.uid);
  const code = nullableText(data.code);
  if (!uid || !code) return null;
  return {
    redemption_key: stableKey(documentId),
    coupon_key: stableKey(code),
    firebase_uid: uid,
    plan: nullableText(data.plan),
    duration_days: nullableInteger(data.durationDays),
    redeemed_at: timestampIso(data.redeemedAt),
    expires_at: timestampIso(data.expiresAt),
    previous_plan: nullableText(data.previousPlan),
    status: nullableText(data.status),
    source: "coupon",
    firebase_updated_at: timestampIso(data.updatedAt),
  };
}

async function pushBatch(params: {
  entityType: "coupon" | "coupon_redemption";
  records: CouponMirrorRecord[] | CouponRedemptionMirrorRecord[];
  secret: string;
  eventId: string;
}): Promise<void> {
  if (params.records.length === 0) return;
  const response = await fetch(CONTROL_CENTER_MIRROR_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${params.secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sourceSystem: "firebase",
      eventId: params.eventId,
      entityType: params.entityType,
      records: params.records,
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(
      `Control Center coupon mirror rejected (${response.status}): ${detail}`,
    );
  }
}

async function reconcileCollection<T>(params: {
  collection: "coupon_codes" | "coupon_redemptions";
  entityType: "coupon" | "coupon_redemption";
  secret: string;
  runId: string;
  pageSize: number;
  maxPages: number;
  sanitize: (id: string, data: Record<string, unknown>) => T | null;
}): Promise<DatasetResult> {
  let cursor: string | undefined;
  let sourceRead = 0;
  let recordsSent = 0;
  let batchesSent = 0;
  let complete = false;

  for (let page = 0; page < params.maxPages; page++) {
    let query = db
      .collection(params.collection)
      .orderBy(FieldPath.documentId())
      .limit(params.pageSize);
    if (cursor) query = query.startAfter(cursor);

    const snapshot = await query.get();
    if (snapshot.empty) {
      complete = true;
      break;
    }

    const records = snapshot.docs
      .map((doc) => params.sanitize(doc.id, doc.data() as Record<string, unknown>))
      .filter((record): record is T => record !== null);

    await pushBatch({
      entityType: params.entityType,
      records: records as CouponMirrorRecord[] | CouponRedemptionMirrorRecord[],
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

  return {
    sourceRead,
    recordsSent,
    batchesSent,
    complete,
    nextCursor: complete ? null : cursor ?? null,
  };
}

async function reconcileCoupons(params: {
  secret: string;
  runId: string;
  pageSize: number;
  maxPages: number;
}): Promise<ReconcileResult> {
  const coupons = await reconcileCollection<CouponMirrorRecord>({
    collection: "coupon_codes",
    entityType: "coupon",
    secret: params.secret,
    runId: params.runId,
    pageSize: params.pageSize,
    maxPages: params.maxPages,
    sanitize: sanitizeCoupon,
  });

  const redemptions = await reconcileCollection<CouponRedemptionMirrorRecord>({
    collection: "coupon_redemptions",
    entityType: "coupon_redemption",
    secret: params.secret,
    runId: params.runId,
    pageSize: params.pageSize,
    maxPages: params.maxPages,
    sanitize: sanitizeRedemption,
  });

  return {
    status: "OK",
    readOnly: true,
    source: "coupon_codes+coupon_redemptions",
    dataset: "coupons",
    coupons,
    redemptions,
    sourceRead: coupons.sourceRead + redemptions.sourceRead,
    recordsSent: coupons.recordsSent + redemptions.recordsSent,
    batchesSent: coupons.batchesSent + redemptions.batchesSent,
    complete: coupons.complete && redemptions.complete,
  };
}

/**
 * Manual authenticated Firebase -> Control Center coupon mirror refresh.
 * Reads coupon configuration and redemption history only. It never creates,
 * activates, redeems, extends, or revokes a coupon/trial.
 */
export const syncCouponsToControlCenter = onRequest(
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
      response.status(401).json({error: "Unauthorized coupon mirror refresh."});
      return;
    }

    const body = (request.body ?? {}) as SyncBody;
    const pageSize = boundedInteger(body.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const maxPages = boundedInteger(body.maxPages, DEFAULT_MAX_PAGES, 1, MAX_PAGES);

    try {
      const result = await reconcileCoupons({
        secret,
        runId: `manual-${Date.now()}`,
        pageSize,
        maxPages,
      });
      response.status(200).json(result);
    } catch (error) {
      console.error("Coupon mirror refresh failed", {
        message: error instanceof Error ? error.message.slice(0, 500) : "unknown",
      });
      response.status(500).json({error: "Coupon mirror refresh failed."});
    }
  },
);

/** Automatic read-only coupon + redemption mirror reconciliation every 5 hours. */
export const syncCouponsToControlCenterEvery5Hours = onSchedule(
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

    const result = await reconcileCoupons({
      secret,
      runId: `scheduled-${Date.parse(event.scheduleTime) || Date.now()}`,
      pageSize: DEFAULT_PAGE_SIZE,
      maxPages: DEFAULT_MAX_PAGES,
    });

    console.log("Coupon mirror scheduled refresh complete", {
      couponRecords: result.coupons.recordsSent,
      redemptionRecords: result.redemptions.recordsSent,
      batchesSent: result.batchesSent,
      complete: result.complete,
    });
  },
);
