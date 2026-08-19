import {defineSecret} from "firebase-functions/params";
import {logger} from "firebase-functions";
import {onSchedule} from "firebase-functions/v2/scheduler";

import {db, FieldValue, Timestamp} from "../config/firebase";
import {
  ClaimedBroadcastRun,
  normalizeClaimedBroadcastRun,
} from "../domain/notifications/broadcastControlPlane";

const RUNS = "notification_broadcast_runs";
const CLAIM_LIMIT = 10;
const SYNC_LIMIT = 50;

const SUPABASE_URL = defineSecret("NOTIFICATION_CONTROL_PLANE_SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = defineSecret("NOTIFICATION_CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY");

function controlPlaneBaseUrl(): string {
  const raw = SUPABASE_URL.value().trim().replace(/\/+$/, "");
  if (!raw) throw new Error("notification_control_plane_url_missing");
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:") throw new Error("notification_control_plane_url_must_be_https");
  return raw;
}

async function rpcJson<T>(name: string, payload: Record<string, unknown>): Promise<T> {
  const key = SUPABASE_SERVICE_ROLE_KEY.value().trim();
  if (!key) throw new Error("notification_control_plane_service_key_missing");
  const response = await fetch(`${controlPlaneBaseUrl()}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`supabase_rpc_${name}_${response.status}:${text.slice(0, 240)}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

function sameImmutableRun(existing: FirebaseFirestore.DocumentData, normalized: ReturnType<typeof normalizeClaimedBroadcastRun>): boolean {
  return existing.runKey === normalized.runKey &&
    existing.campaignId === normalized.campaignId &&
    Number(existing.campaignVersion) === normalized.campaignVersion &&
    existing.notificationType === normalized.notificationType &&
    existing.audienceId === normalized.audienceId &&
    existing.deliveryPurpose === normalized.deliveryPurpose;
}

async function materializeRun(raw: ClaimedBroadcastRun): Promise<void> {
  const normalized = normalizeClaimedBroadcastRun(raw);
  const ref = db.collection(RUNS).doc(normalized.runId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const existing = snap.data() ?? {};
      if (!sameImmutableRun(existing, normalized)) {
        throw new Error(`immutable_run_mismatch:${normalized.runId}`);
      }
      if (!existing.supabaseRunId) {
        tx.set(ref, {supabaseRunId: normalized.supabaseRunId}, {merge: true});
      }
      return;
    }

    tx.create(ref, {
      supabaseRunId: normalized.supabaseRunId,
      campaignId: normalized.campaignId,
      campaignVersion: normalized.campaignVersion,
      runKey: normalized.runKey,
      status: "queued",
      notificationType: normalized.notificationType,
      audienceId: normalized.audienceId,
      audience: normalized.audience,
      content: normalized.content,
      destinationRoute: normalized.destinationRoute,
      deliveryPurpose: normalized.deliveryPurpose,
      scheduledAt: Timestamp.fromMillis(normalized.scheduledAtMs),
      cursor: null,
      metrics: normalized.metrics,
      leaseUntil: 0,
      syncPending: true,
      syncVersion: 1,
      createdAt: Timestamp.now(),
      updatedAt: Date.now(),
    });
  });
}

function timestampIso(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const maybe = value as {toDate?: () => Date};
  if (typeof maybe.toDate !== "function") return null;
  return maybe.toDate().toISOString();
}

function safeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

async function syncOneRun(ref: FirebaseFirestore.DocumentReference): Promise<void> {
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() ?? {};
  if (data.syncPending !== true) return;

  const syncVersion = safeCount(data.syncVersion);
  const metrics = (data.metrics ?? {}) as Record<string, unknown>;
  const runKey = typeof data.runKey === "string" ? data.runKey : ref.id;
  const status = typeof data.status === "string" ? data.status : "delivering";

  await rpcJson<Record<string, unknown>>("control_center_notification_run_sync", {
    p_run_key: runKey,
    p_input: {
      status,
      firebase_run_id: ref.id,
      target_estimate: safeCount(data.targetEstimate),
      recipients_processed: safeCount(metrics.processed),
      canonical_created: safeCount(metrics.canonicalCreated),
      duplicate_skipped: safeCount(metrics.duplicateSkipped),
      in_app_hidden: safeCount(metrics.inAppHidden),
      push_sent: safeCount(metrics.pushSent),
      push_suppressed_preference: safeCount(metrics.pushSuppressedPreference),
      push_suppressed_quiet_hours: safeCount(metrics.pushSuppressedQuietHours),
      push_not_applicable: safeCount(metrics.pushNotApplicable),
      push_failed: safeCount(metrics.pushFailed),
      recipient_failed: safeCount(metrics.recipientFailed),
      opened: safeCount(data.opened),
      started_at: timestampIso(data.startedAt),
    },
  });

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) return;
    const currentVersion = safeCount(fresh.get("syncVersion"));
    if (currentVersion !== syncVersion) return;
    tx.update(ref, {
      syncPending: false,
      supabaseSyncedAt: Timestamp.now(),
    });
  });
}

async function claimAndMaterialize(): Promise<number> {
  const rows = await rpcJson<ClaimedBroadcastRun[]>("control_center_notification_claim_runs", {
    p_limit: CLAIM_LIMIT,
  });
  if (!Array.isArray(rows)) throw new Error("claim_rpc_did_not_return_array");
  let count = 0;
  for (const row of rows.slice(0, CLAIM_LIMIT)) {
    await materializeRun(row);
    count++;
  }
  return count;
}

async function syncPendingRuns(): Promise<number> {
  const snap = await db.collection(RUNS).where("syncPending", "==", true).limit(SYNC_LIMIT).get();
  let count = 0;
  for (const doc of snap.docs) {
    try {
      await syncOneRun(doc.ref);
      count++;
    } catch (error) {
      logger.warn("broadcast Supabase run sync failed", {
        runId: doc.id,
        message: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      });
    }
  }
  return count;
}

export const broadcastControlPlaneSync = onSchedule(
  {
    schedule: "*/2 * * * *",
    timeZone: "Etc/UTC",
    timeoutSeconds: 180,
    memory: "256MiB",
    maxInstances: 1,
    secrets: [SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY],
  },
  async () => {
    try {
      const claimed = await claimAndMaterialize();
      const synced = await syncPendingRuns();
      logger.info("broadcast control-plane sync", {claimed, synced});
    } catch (error) {
      logger.error("broadcast control-plane sync failed", {
        message: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      });
      throw error;
    }
  },
);
