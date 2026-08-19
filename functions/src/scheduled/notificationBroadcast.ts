/**
 * PROMPT 7 — production broadcast fanout worker (server-only, scheduled).
 *
 * Firestore-run-driven: `notification_broadcast_runs/{runId}` is the immutable
 * approved snapshot + cursor + aggregate metrics. Each invocation atomically
 * LEASES one due run, resolves its audience in bounded pages, fans each
 * recipient through Notification V2 (`notifySafely`), advances the cursor, folds
 * honest metrics, then completes or yields for the next invocation. Bounded,
 * resumable, idempotent (exactly-once per recipient per campaign VERSION via
 * createNotification dedup), and race-safe (lease). No direct FCM, no bypass.
 */
import {onSchedule} from "firebase-functions/v2/scheduler";
import {logger} from "firebase-functions";

import {db, Timestamp} from "../config/firebase";
import {notifySafely} from "../domain/notifications/notificationProducers";
import {resolveLocalizedCopy} from "../domain/notifications/adminNotifications";
import {
  audienceMatches,
  BroadcastAudienceId,
  broadcastSourceEventId,
  canDeliverRun,
  DeliveryPurpose,
  emptyMetrics,
  foldOutcome,
  isBroadcastableType,
  isBroadcastAudience,
} from "../domain/notifications/broadcast";

const RUNS = "notification_broadcast_runs";
const TEST_RECIPIENTS = "notification_test_recipients";
const PAGE = 300;
const MAX_RECIPIENTS_PER_INVOCATION = 3000; // bounded work; leftovers continue next run
const LEASE_MS = 110_000; // > invocation budget; expires so a crashed lease resumes

type RunDoc = {
  campaignId: string; campaignVersion: number; runKey: string;
  status: string; notificationType: string; audienceId: string;
  audience?: {appVersionMin?: string | null};
  content: {title: Record<string, string>; body: Record<string, string>; fallbackLang: string};
  destinationRoute?: string | null; deliveryPurpose: DeliveryPurpose;
  scheduledAt: FirebaseFirestore.Timestamp; cursor?: string | null;
  metrics?: ReturnType<typeof emptyMetrics>; leaseUntil?: number;
};

function gate() {
  return {
    productionEnabled: process.env.NOTIFICATION_BROADCAST_DELIVERY_ENABLED === "true",
    qaEnabled: process.env.NOTIFICATION_BROADCAST_QA_ENABLED === "true",
  };
}

/** Atomically lease one due, deliverable run. Returns its id + data, or null. */
async function leaseDueRun(nowMs: number): Promise<{id: string; run: RunDoc} | null> {
  const nowTs = Timestamp.fromMillis(nowMs);
  const snap = await db.collection(RUNS)
    .where("status", "in", ["queued", "delivering"])
    .where("scheduledAt", "<=", nowTs)
    .orderBy("scheduledAt").limit(10).get();

  for (const doc of snap.docs) {
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      const r = fresh.data() as RunDoc | undefined;
      if (!r || (r.status !== "queued" && r.status !== "delivering")) return null;
      if ((r.leaseUntil ?? 0) > nowMs) return null; // another worker holds it
      tx.update(doc.ref, {
        status: "delivering",
        leaseUntil: nowMs + LEASE_MS,
        startedAt: r.status === "queued" ? nowTs : (fresh.get("startedAt") ?? nowTs),
        updatedAt: nowMs,
      });
      return {id: doc.id, run: r};
    });
    if (claimed) return claimed;
  }
  return null;
}

/** One page of recipient uids for the audience, plus cursor + exhausted flag. */
async function audiencePage(
  audienceId: BroadcastAudienceId, appVersionMin: string | null, cursor: string | null,
): Promise<{uids: string[]; nextCursor: string | null; exhausted: boolean}> {
  if (audienceId === "test_recipients") {
    let q = db.collection(TEST_RECIPIENTS).where("active", "==", true).orderBy("__name__").limit(PAGE);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    return {
      uids: snap.docs.map((d) => d.id),
      nextCursor: snap.empty ? cursor : snap.docs[snap.docs.length - 1].id,
      exhausted: snap.size < PAGE,
    };
  }
  // Population audiences: page users, filter by the pure predicate.
  let q = db.collection("users").orderBy("__name__").limit(PAGE);
  if (cursor) q = q.startAfter(cursor);
  const snap = await q.get();
  const uids: string[] = [];
  for (const d of snap.docs) {
    const u = d.data();
    const match = audienceMatches(audienceId, {
      language: u.language ?? u.languageCode ?? null,
      plan: (u.plan ?? u.entitlement ?? null) as string | null,
      appVersion: (u.appVersion ?? null) as string | null,
      deletedAt: u.deletedAt, disabled: u.disabled === true,
    }, {appVersionMin});
    if (match === true) uids.push(d.id);
  }
  return {
    uids,
    nextCursor: snap.empty ? cursor : snap.docs[snap.docs.length - 1].id,
    exhausted: snap.size < PAGE,
  };
}

async function recipientActive(uid: string): Promise<boolean> {
  const u = await db.collection("users").doc(uid).get();
  if (!u.exists) return false;
  const d = u.data();
  return !d?.deletedAt && d?.disabled !== true;
}

export const broadcastFanout = onSchedule(
  {schedule: "*/2 * * * *", timeZone: "Etc/UTC", timeoutSeconds: 300, memory: "512MiB", maxInstances: 1},
  async () => {
    const now = Date.now();
    const leased = await leaseDueRun(now);
    if (!leased) return;
    const {id: runId, run} = leased;
    const ref = db.collection(RUNS).doc(runId);

    // Safety: type allowlist + audience + gate. A bad run is failed, not delivered.
    if (!isBroadcastableType(run.notificationType) || !isBroadcastAudience(run.audienceId)) {
      await ref.update({status: "failed", leaseUntil: 0, lastError: "invalid_type_or_audience", updatedAt: now});
      logger.error("broadcast run invalid", {runId});
      return;
    }
    const decision = canDeliverRun(run.deliveryPurpose, run.audienceId, gate());
    if (!decision.allowed) {
      // Not authorised to deliver yet — release the lease, leave it queued/delivering.
      await ref.update({leaseUntil: 0, lastGateReason: decision.reason, updatedAt: now});
      logger.info("broadcast run gated", {runId, reason: decision.reason});
      return;
    }

    let metrics = run.metrics ?? emptyMetrics();
    let cursor = run.cursor ?? null;
    let processed = 0;
    let exhausted = false;
    const audienceId = run.audienceId as BroadcastAudienceId;
    const appVersionMin = run.audience?.appVersionMin ?? null;

    while (processed < MAX_RECIPIENTS_PER_INVOCATION) {
      const page = await audiencePage(audienceId, appVersionMin, cursor);
      for (const uid of page.uids) {
        let outcome: Parameters<typeof foldOutcome>[1];
        try {
          if (!(await recipientActive(uid))) {
            outcome = {recordStatus: "failed"};
          } else {
            const lang = (await db.collection("users").doc(uid).get()).data()?.languageCode as string | undefined;
            const res = await notifySafely({
              recipientUid: uid,
              type: run.notificationType as "system_announcement",
              sourceEventId: broadcastSourceEventId(run.campaignId, run.campaignVersion),
              title: resolveLocalizedCopy(run.content.title, lang, "bm"),
              body: resolveLocalizedCopy(run.content.body, lang, "bm"),
              deepLink: run.destinationRoute ?? undefined,
              metadata: {
                campaignId: run.campaignId, campaignVersion: run.campaignVersion,
                broadcastRunId: runId, deliveryPurpose: run.deliveryPurpose,
              },
              source: "trusted_backend",
            });
            outcome = {
              recordStatus: (res.status as "created") ?? "failed",
              inAppVisible: res.inAppVisible,
              push: res.push ? {sent: res.push.sent, reason: res.push.reason} : undefined,
            };
          }
        } catch (e) {
          logger.warn("broadcast recipient failed", {runId, error: e instanceof Error ? e.message : String(e)});
          outcome = {recordStatus: "failed"};
        }
        metrics = foldOutcome(metrics, outcome);
        processed++;
      }
      cursor = page.nextCursor;
      // Persist progress each page (crash-safe resume) + renew the lease.
      await ref.update({cursor, metrics, leaseUntil: now + LEASE_MS, updatedAt: Date.now()});
      if (page.exhausted) {exhausted = true; break;}
    }

    if (exhausted) {
      await ref.update({status: "completed", completedAt: Timestamp.now(), leaseUntil: 0, updatedAt: Date.now()});
    } else {
      // More to do — release the lease so the next invocation resumes from cursor.
      await ref.update({leaseUntil: 0, updatedAt: Date.now()});
    }
    logger.info("broadcast fanout page", {runId, invocationProcessed: processed, exhausted, ...metrics});
  },
);
