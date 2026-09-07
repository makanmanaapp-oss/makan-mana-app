import {timingSafeEqual} from "node:crypto";

import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {logEvent} from "../services/eventService";
import {
  PROMOTION_COLLECTION,
  PROMOTION_STATUS_ACTIVE,
  PROMOTION_STATUS_ARCHIVED,
  PROMOTION_STATUS_DRAFT,
  isPromotionStatus,
  type PromotionStatus,
} from "../domain/promotions/promotionTypes";
import {decidePromotionTransition} from "../domain/promotions/promotionLifecycle";

/**
 * WAVE 4 — the ONE trusted Control Center → Firebase COMMERCIAL bridge.
 *
 * Owns exactly one command family:
 *   commercial.promotion.{active|paused|archived} → restaurant_promotions/{id}
 *
 * Shaped on the proven Wave 3C social-moderation receiver, deliberately:
 * constant-time bearer comparison that is never logged, a command allowlist,
 * a payload allowlist, transactional idempotency keyed on requestId, and
 * fail-closed on anything unrecognised.
 *
 * Firestore is authoritative. The Control Center mirror is never trusted:
 * the console sends the status it OBSERVED, and this receiver re-decides the
 * transition against the stored document and its own clock. A console acting
 * on a stale view is therefore refused rather than obeyed.
 *
 * There is no admin create/edit command on purpose. Promotion content is
 * authored by the merchant who is accountable for it; an operator may only
 * change lifecycle, and every such change carries a reason.
 *
 * NOT DEPLOYED.
 */

const PROMOTION_ADMIN_BRIDGE_SECRET = defineSecret("PROMOTION_ADMIN_BRIDGE_SECRET");

const COMMAND_PREFIX = "commercial.promotion.";
const RESOURCE_TYPE = "restaurant_promotion";
const C_REQUESTS = "promotion_admin_requests";

/** Lifecycle states an operator may command. Must match the Control Center. */
const ALLOWED_ACTIONS: PromotionStatus[] = [
  PROMOTION_STATUS_ACTIVE,
  "paused",
  PROMOTION_STATUS_ARCHIVED,
];

type BridgeBody = {
  requestId?: unknown;
  commandType?: unknown;
  resourceType?: unknown;
  resourceId?: unknown;
  payload?: unknown;
  reason?: unknown;
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

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * The requested action, from the command-type suffix cross-checked against the
 * payload. A disagreement fails closed rather than picking a winner.
 */
function resolveAction(commandType: string, payload: unknown): PromotionStatus | null {
  if (!commandType.startsWith(COMMAND_PREFIX)) return null;
  const fromType = commandType.slice(COMMAND_PREFIX.length);
  const fromPayload = text(objectOf(payload).requestedStatus, 40);
  if (fromPayload && fromPayload !== fromType) return null;
  if (!isPromotionStatus(fromType)) return null;
  if (!ALLOWED_ACTIONS.includes(fromType)) return null;
  return fromType;
}

export const controlCenterPromotionAdminBridge = onRequest(
  {secrets: [PROMOTION_ADMIN_BRIDGE_SECRET], timeoutSeconds: 30, memory: "256MiB", maxInstances: 3},
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).json({status: "ERROR", errorCode: "METHOD_NOT_ALLOWED"});
      return;
    }

    const secret = PROMOTION_ADMIN_BRIDGE_SECRET.value();
    const presented = bearerToken(request.header("authorization"));
    if (!secret || !presented || !safeEqual(presented, secret)) {
      response.status(401).json({status: "ERROR", errorCode: "UNAUTHENTICATED"});
      return;
    }

    const body = (request.body ?? {}) as BridgeBody;
    const requestId = text(body.requestId, 200);
    const commandType = text(body.commandType, 120);
    const resourceType = text(body.resourceType, 60);
    const reason = text(body.reason, 500);
    const promotionId = text(body.resourceId, 200);
    const payload = objectOf(body.payload);

    if (!requestId) {
      response.status(400).json({status: "ERROR", errorCode: "INVALID_REQUEST_ID"});
      return;
    }
    if (resourceType !== RESOURCE_TYPE) {
      response.status(400).json({status: "ERROR", errorCode: "UNSUPPORTED_COMMAND"});
      return;
    }
    const action = resolveAction(commandType, payload);
    if (!action) {
      response.status(400).json({status: "ERROR", errorCode: "UNSUPPORTED_COMMAND"});
      return;
    }
    // Same floor the Control Center enforces before enqueueing, restated here
    // because a bridge must not trust the caller to have validated anything.
    if (reason.length < 8) {
      response.status(400).json({status: "ERROR", errorCode: "INVALID_REASON"});
      return;
    }
    if (!promotionId || promotionId.includes("/")) {
      response.status(400).json({status: "ERROR", errorCode: "INVALID_TARGET"});
      return;
    }

    // The console asserts which restaurant it believes it is acting on. It is a
    // CHECK, never the source of identity: the stored document's own canonical
    // id decides, and a mismatch is refused.
    const assertedPlaceId = text(payload.canonicalPlaceId, 300);

    try {
      const requestRef = db.collection(C_REQUESTS).doc(requestId);
      const targetRef = db.collection(PROMOTION_COLLECTION).doc(promotionId);
      const nowMs = Date.now();

      const outcome = await db.runTransaction(async (tx) => {
        const [requestSnap, targetSnap] = await Promise.all([
          tx.get(requestRef), tx.get(targetRef),
        ]);

        // Cross-target idempotency: one requestId always means the same command
        // against the same target. A replay is a success; a reuse for something
        // else fails closed.
        const prior = requestSnap.exists ? requestSnap.data() ?? null : null;
        if (prior) {
          const same = prior.commandType === commandType
            && prior.resourceType === resourceType
            && prior.resourceId === promotionId;
          if (!same) return {ok: false as const, conflict: true as const};
          return {
            ok: true as const,
            idempotent: true,
            from: String(prior.from ?? ""),
            to: String(prior.to ?? ""),
          };
        }

        if (!targetSnap.exists) return {ok: false as const, error: "promotion_missing"};
        const stored = targetSnap.data() ?? {};

        const canonicalPlaceId = text(stored.canonicalPlaceId, 300);
        if (!canonicalPlaceId) return {ok: false as const, error: "identity_invalid"};
        if (assertedPlaceId && assertedPlaceId !== canonicalPlaceId) {
          return {ok: false as const, error: "restaurant_mismatch"};
        }

        const storedStatus = isPromotionStatus(stored.status)
          ? stored.status
          : PROMOTION_STATUS_DRAFT;
        const startsAtMs = typeof stored.startsAtMs === "number" ? stored.startsAtMs : null;
        const endsAtMs = typeof stored.endsAtMs === "number" ? stored.endsAtMs : null;

        // The SAME pure decision the merchant callable uses. One implementation,
        // so an operator and a merchant can never get different answers.
        const decision = decidePromotionTransition({
          stored: storedStatus,
          startsAtMs,
          endsAtMs,
          requested: action,
          nowMs,
        });
        if (!decision.ok || !decision.next) {
          return {ok: false as const, error: decision.reason};
        }

        // Allowlisted write. Content, identity and merchant audit fields are
        // untouchable from this plane; only lifecycle moves.
        const update: Record<string, unknown> = {
          status: decision.next,
          updatedAtMs: nowMs,
          updatedAt: FieldValue.serverTimestamp(),
          updatedByRequestId: requestId,
          lastAdminReason: reason,
        };
        if (decision.next === PROMOTION_STATUS_ACTIVE && stored.publishedAtMs == null) {
          update.publishedAtMs = nowMs;
        }
        if (decision.next === PROMOTION_STATUS_ARCHIVED) {
          update.archivedAtMs = nowMs;
        }

        tx.set(targetRef, update, {merge: true}); // soft state change — never a delete
        tx.set(requestRef, {
          commandType, resourceType, resourceId: promotionId,
          canonicalPlaceId,
          from: storedStatus, to: decision.next,
          appliedAt: FieldValue.serverTimestamp(),
        });

        return {
          ok: true as const,
          idempotent: false,
          from: storedStatus,
          to: decision.next,
          canonicalPlaceId,
        };
      });

      if (!outcome.ok) {
        if ("conflict" in outcome) {
          response.status(409).json({status: "ERROR", errorCode: "REQUEST_ID_REUSED"});
          return;
        }
        const error = outcome.error ?? "internal";
        const status = error === "promotion_missing" ? 404
          : error === "restaurant_mismatch" ? 403
            : error === "identity_invalid" ? 409
              : 409;
        response.status(status).json({status: "ERROR", errorCode: error.toUpperCase()});
        return;
      }

      if (!outcome.idempotent) {
        // Internal audit only. The acting ADMIN is identified by requestId in
        // the Control Center audit trail; no admin id is written into Firestore
        // and none is ever echoed to a public payload.
        await logEvent({
          userId: "control_center",
          eventType: "promotion_admin_status_changed",
          placeId: "canonicalPlaceId" in outcome ? outcome.canonicalPlaceId : null,
          metadata: {
            promotionId, from: outcome.from, to: outcome.to, requestId,
          },
        });
      }

      response.status(200).json({
        status: "OK",
        idempotent: outcome.idempotent,
        from: outcome.from,
        to: outcome.to,
      });
    } catch (error) {
      console.error("promotion admin bridge failed", {
        promotionId: promotionId.slice(0, 120),
        message: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      });
      response.status(500).json({status: "ERROR", errorCode: "INTERNAL_ERROR"});
    }
  },
);
