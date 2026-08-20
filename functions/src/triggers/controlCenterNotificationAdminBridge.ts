/**
 * PROMPT 6A — Control Center → Notification V2 trusted bridge (server-only).
 *
 * The ONLY server entry point by which Control Center dispatches an admin
 * notification. It is authenticated by a shared server secret (constant-time
 * compare), accepts EXACTLY ONE approved test recipient, enforces the admin type
 * allowlist, rejects every critical/preference-bypass field, and delivers ONLY
 * through `notifySafely` (no direct Firestore write, no direct FCM). It cannot
 * mass-send: one recipient per call, `deliveryPurpose: "test"` required.
 *
 * NOT a client callable. Deployed + wired in Prompt 6.1. No mass broadcast here.
 */
import {timingSafeEqual} from "node:crypto";

import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";
import {logger} from "firebase-functions";

import {db} from "../config/firebase";
import {
  ADMIN_CONTENT_LIMITS,
  assertNoForbiddenOverride,
  emitAdminNotification,
  isAdminBroadcastType,
  resolveLocalizedCopy,
} from "../domain/notifications/adminNotifications";

const NOTIFICATION_ADMIN_BRIDGE_SECRET = defineSecret("NOTIFICATION_ADMIN_BRIDGE_SECRET");
const TEST_RECIPIENTS = "notification_test_recipients";
const UID_RE = /^[A-Za-z0-9_-]{1,128}$/;

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

type BridgeBody = {
  requestId?: unknown;
  commandType?: unknown;
  payload?: Record<string, unknown>;
  reason?: unknown;
};

export const controlCenterNotificationAdminBridge = onRequest(
  {secrets: [NOTIFICATION_ADMIN_BRIDGE_SECRET], timeoutSeconds: 30, memory: "256MiB", maxInstances: 3},
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).json({error: "POST required."});
      return;
    }

    // 1) Secret auth (constant-time). Never log the secret or the token.
    const secret = NOTIFICATION_ADMIN_BRIDGE_SECRET.value();
    const presented = bearerToken(request.header("authorization"));
    if (!secret || !presented || !safeEqual(presented, secret)) {
      response.status(401).json({error: "Unauthorized notification bridge trigger."});
      return;
    }

    try {
      const envelope = (request.body ?? {}) as BridgeBody;
      const requestId = typeof envelope.requestId === "string" ? envelope.requestId.trim() : "";
      if (!requestId || requestId.length > 120) {
        response.status(400).json({error: "requestId required."});
        return;
      }
      if (envelope.commandType !== "notification.test_send") {
        response.status(400).json({error: "Unsupported commandType."});
        return;
      }
      const payload = (envelope.payload ?? {}) as Record<string, unknown>;

      // 2) Reject any escalation / preference-bypass field outright.
      try {
        assertNoForbiddenOverride(payload);
      } catch (e) {
        response.status(400).json({error: "Forbidden override field present.", detail: e instanceof Error ? e.message : "forbidden"});
        return;
      }

      // 3) Type allowlist — domain events can never be produced here.
      const notificationType = payload.notificationType;
      if (!isAdminBroadcastType(notificationType)) {
        response.status(403).json({error: "Notification type is not admin-generatable."});
        return;
      }

      // 4) Delivery purpose must be an explicit bounded test.
      if (payload.deliveryPurpose !== "test") {
        response.status(400).json({error: "Only deliveryPurpose=test is accepted."});
        return;
      }

      // 5) Exactly ONE recipient — no mass fan-out. Reject arrays.
      const recipientUid = payload.recipientUid;
      if (Array.isArray(recipientUid)) {
        response.status(400).json({error: "A single recipient is required — no mass send."});
        return;
      }
      if (typeof recipientUid !== "string" || !UID_RE.test(recipientUid)) {
        response.status(400).json({error: "Invalid recipient."});
        return;
      }

      // 6) Recipient must be on the server-only approved test allowlist. The
      //    bridge never trusts a typed UID even from an authenticated caller.
      const allow = await db.collection(TEST_RECIPIENTS).doc(recipientUid).get();
      if (!allow.exists || allow.data()?.active !== true) {
        response.status(403).json({error: "Recipient is not an approved test recipient."});
        return;
      }

      // 7) Resolve recipient-language copy (fallback-aware). Content maps only.
      const titleMap = (payload.title ?? {}) as Record<string, string>;
      const bodyMap = (payload.body ?? {}) as Record<string, string>;
      const fallback = typeof payload.fallbackLang === "string" ? payload.fallbackLang : "bm";
      const userSnap = await db.collection("users").doc(recipientUid).get();
      const lang = (userSnap.data()?.languageCode as string | undefined) ?? fallback;
      const title = resolveLocalizedCopy(titleMap, lang, "bm");
      const body = resolveLocalizedCopy(bodyMap, lang, "bm");
      if (!title || !body) {
        response.status(400).json({error: "Missing title/body copy for the fallback language."});
        return;
      }
      if (title.length > ADMIN_CONTENT_LIMITS.title || body.length > ADMIN_CONTENT_LIMITS.body) {
        response.status(400).json({error: "Content exceeds allowed length."});
        return;
      }

      const destinationRoute = typeof payload.destinationRoute === "string" ? payload.destinationRoute : null;

      // 8) Deliver ONLY through Notification V2. Dedup by requestId (retry-safe).
      const outcome = await emitAdminNotification({
        recipientUid,
        type: notificationType,
        requestId,
        title,
        body,
        destinationRoute,
        deliveryPurpose: "test",
      });

      response.status(200).json({
        status: "OK",
        requestId,
        delivered: outcome.ok && outcome.status === "created",
        suppressed: outcome.status === "suppressed_preference" || outcome.status === "suppressed_self",
        duplicate: outcome.status === "duplicate",
        recordStatus: outcome.status ?? null,
      });
    } catch (error) {
      logger.error("controlCenterNotificationAdminBridge failed", {
        message: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      });
      response.status(500).json({error: "Notification bridge failed."});
    }
  },
);
