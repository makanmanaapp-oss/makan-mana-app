import {timingSafeEqual} from "node:crypto";

import {getAuth, type UserRecord} from "firebase-admin/auth";
import type {DocumentSnapshot} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";

import {db} from "../config/firebase";

const CONTROL_CENTER_SYNC_SECRET = defineSecret("CONTROL_CENTER_SYNC_SECRET");
const CONTROL_CENTER_MIRROR_URL =
  "https://makanmana-control-center.vercel.app/api/internal/sync/mirror";
const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_MAX_PAGES = 20;
const MAX_PAGE_SIZE = 500;
const MAX_PAGES = 50;

type SyncBody = {
  pageSize?: number;
  maxPages?: number;
};

type UserMirrorRecord = {
  firebase_uid: string;
  display_name: string | null;
  username: string | null;
  email_masked: string | null;
  phone_masked: string | null;
  plan: string | null;
  plan_status: string | null;
  account_status: string;
  created_at: string | null;
  last_active_at: string | null;
  firebase_updated_at: string | null;
};

type ReconcileResult = {
  status: "OK";
  readOnly: true;
  source: "firebase_auth";
  dataset: "users";
  sourceRead: number;
  recordsSent: number;
  batchesSent: number;
  complete: boolean;
  nextPageTokenPresent: boolean;
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

function firstText(
  data: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = nullableText(data[key]);
    if (value) return value;
  }
  return null;
}

function validIso(value: string | undefined): string | null {
  if (!value) return null;
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) return null;
  return new Date(millis).toISOString();
}

function maskEmail(value: string | undefined): string | null {
  const email = value?.trim();
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.length >= 2 ? local.slice(0, 2) : local.slice(0, 1);
  return `${visible}*****@${domain}`;
}

function maskPhone(value: string | undefined): string | null {
  const phone = value?.trim();
  if (!phone) return null;
  const compact = phone.replace(/\s+/g, "");
  if (compact.length <= 4) return "****";
  return `${compact.slice(0, 3)}******${compact.slice(-2)}`;
}

function firestoreUpdatedIso(snapshot: DocumentSnapshot): string | null {
  try {
    return snapshot.updateTime?.toDate().toISOString() ?? null;
  } catch {
    return null;
  }
}

function sanitizeUser(
  authUser: UserRecord,
  firestoreSnapshot: DocumentSnapshot,
): UserMirrorRecord {
  const data = firestoreSnapshot.exists
    ? firestoreSnapshot.data() as Record<string, unknown>
    : {};

  const canonicalAccountStatus = firstText(data, ["accountStatus", "account_status"]);
  const accountStatus = canonicalAccountStatus ?? (authUser.disabled ? "suspended" : "active");

  return {
    firebase_uid: authUser.uid,
    display_name:
      firstText(data, ["displayName", "display_name", "name"])
      ?? nullableText(authUser.displayName),
    username: firstText(data, ["username", "userName"]),
    email_masked: maskEmail(authUser.email),
    phone_masked: maskPhone(authUser.phoneNumber),
    plan: firstText(data, ["plan"]),
    plan_status: firstText(data, ["planStatus", "plan_status"]),
    account_status: accountStatus,
    created_at: validIso(authUser.metadata.creationTime),
    last_active_at: validIso(authUser.metadata.lastSignInTime),
    firebase_updated_at: firestoreUpdatedIso(firestoreSnapshot),
  };
}

async function pushUsers(
  records: UserMirrorRecord[],
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
      sourceSystem: "firebase",
      eventId,
      entityType: "user",
      records,
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(
      `Control Center user mirror rejected (${response.status}): ${detail}`,
    );
  }
}

async function reconcileUsers(params: {
  secret: string;
  runId: string;
  pageSize: number;
  maxPages: number;
}): Promise<ReconcileResult> {
  const auth = getAuth();
  let pageToken: string | undefined;
  let sourceRead = 0;
  let recordsSent = 0;
  let batchesSent = 0;
  let complete = false;

  for (let page = 0; page < params.maxPages; page++) {
    const listed = await auth.listUsers(params.pageSize, pageToken);
    const users = listed.users;

    if (users.length === 0) {
      complete = true;
      pageToken = undefined;
      break;
    }

    const refs = users.map((user) => db.collection("users").doc(user.uid));
    const snapshots = await db.getAll(...refs);
    const records = users.map((user, index) => sanitizeUser(user, snapshots[index]));

    await pushUsers(
      records,
      params.secret,
      `user-mirror-${params.runId}-${page + 1}`,
    );

    sourceRead += users.length;
    recordsSent += records.length;
    batchesSent++;
    pageToken = listed.pageToken;

    if (!pageToken) {
      complete = true;
      break;
    }
  }

  return {
    status: "OK",
    readOnly: true,
    source: "firebase_auth",
    dataset: "users",
    sourceRead,
    recordsSent,
    batchesSent,
    complete,
    nextPageTokenPresent: !complete && Boolean(pageToken),
  };
}

/**
 * Manual authenticated Firebase Auth -> Control Center user-directory refresh.
 * Firebase Authentication remains authoritative for account existence; Firestore
 * enriches only profile/plan/account fields. Raw email/phone and auth credentials
 * are never sent to Control Center.
 */
export const syncUsersToControlCenter = onRequest(
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
      response.status(401).json({error: "Unauthorized user mirror refresh."});
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
      const result = await reconcileUsers({
        secret,
        runId: `manual-${Date.now()}`,
        pageSize,
        maxPages,
      });
      response.status(200).json(result);
    } catch (error) {
      console.error("User mirror refresh failed", {
        message: error instanceof Error ? error.message.slice(0, 500) : "unknown",
      });
      response.status(500).json({error: "User mirror refresh failed."});
    }
  },
);

/**
 * Automatic read-only Firebase Auth -> Control Center user reconciliation.
 * Runs every five hours and never mutates Firebase Authentication or Firestore.
 */
export const syncUsersToControlCenterEvery5Hours = onSchedule(
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
    const result = await reconcileUsers({
      secret,
      runId,
      pageSize: DEFAULT_PAGE_SIZE,
      maxPages: DEFAULT_MAX_PAGES,
    });

    console.log("User mirror scheduled refresh complete", {
      sourceRead: result.sourceRead,
      recordsSent: result.recordsSent,
      batchesSent: result.batchesSent,
      complete: result.complete,
    });
  },
);
