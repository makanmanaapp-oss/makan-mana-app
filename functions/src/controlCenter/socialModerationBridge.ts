import {timingSafeEqual} from "node:crypto";

import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {logEvent} from "../services/eventService";
import {
  buildPostModerationUpdate,
  decidePostModeration,
  postUpdateTouchesOnlyModerationFields,
} from "../domain/feed/postModeration";
import {
  buildMenuCommentModerationUpdate,
  decideMenuCommentModeration,
  updateTouchesOnlyModerationFields,
} from "../domain/restaurantEngagement/menuCommentModeration";
import {normalizeCommentId} from "../domain/restaurantEngagement/identity";

/**
 * Wave 3C — the ONE trusted Control Center → Firebase SOCIAL MODERATION bridge.
 *
 * Owns only Social moderation and handles BOTH domains:
 *   social.post.{hide|remove|restore}          → feed_posts/{postId}
 *   social.menu_comment.{hide|remove|restore}  → menu_comments/{commentId}
 *
 * Firestore is authoritative — the Control Center mirror is never trusted.
 * Nothing is ever hard-deleted, only allowlisted moderation fields are written,
 * anything unsupported fails closed, and the bearer secret is compared in
 * constant time and never logged.
 *
 * Idempotency: `social_moderation_requests/{requestId}` records the command
 * identity. A replay of the SAME command is an idempotent success; the SAME
 * requestId reused for a different command/target is REJECTED (409).
 *
 * NOT DEPLOYED.
 */

const SOCIAL_MODERATION_BRIDGE_SECRET = defineSecret("SOCIAL_MODERATION_BRIDGE_SECRET");

const POST_PREFIX = "social.post.";
const MENU_COMMENT_PREFIX = "social.menu_comment.";
const C_POSTS = "feed_posts";
const C_COMMENTS = "menu_comments";
const C_REQUESTS = "social_moderation_requests";

type BridgeBody = {
  requestId?: unknown;
  commandType?: unknown;
  resourceType?: unknown;
  resourceId?: unknown;
  payload?: unknown;
  reason?: unknown;
};

type Domain = "social_post" | "menu_comment";

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

function errorResponse(error: string): {status: number; code: string} {
  switch (error) {
    case "unknown_action": return {status: 400, code: "INVALID_ACTION"};
    case "post_missing":
    case "comment_missing": return {status: 404, code: "NOT_FOUND"};
    case "invalid_status": return {status: 409, code: "CONFLICT"};
    case "restore_not_moderated": return {status: 409, code: "RESTORE_NOT_MODERATED"};
    case "transition_not_allowed": return {status: 409, code: "TRANSITION_NOT_ALLOWED"};
    default: return {status: 500, code: "INTERNAL_ERROR"};
  }
}

/**
 * Resolve the moderation domain. The command-type prefix AND the resource type
 * must agree — a prefix alone never qualifies, so a mismatched pair fails closed.
 */
function resolveDomain(commandType: string, resourceType: string): Domain | null {
  if (commandType.startsWith(POST_PREFIX) && resourceType === "social_post") return "social_post";
  if (commandType.startsWith(MENU_COMMENT_PREFIX) && resourceType === "menu_comment") return "menu_comment";
  return null;
}

/** Action from the command-type suffix, cross-checked against payload.action. */
function resolveAction(commandType: string, prefix: string, payload: unknown): string {
  const fromType = commandType.startsWith(prefix) ? commandType.slice(prefix.length) : "";
  const obj = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const fromPayload = text(obj.action, 40);
  if (fromType && fromPayload && fromType !== fromPayload) return "";
  return fromType || fromPayload;
}

export const controlCenterSocialModerationBridge = onRequest(
  {secrets: [SOCIAL_MODERATION_BRIDGE_SECRET], timeoutSeconds: 30, memory: "256MiB", maxInstances: 3},
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).json({status: "ERROR", errorCode: "METHOD_NOT_ALLOWED"});
      return;
    }

    const secret = SOCIAL_MODERATION_BRIDGE_SECRET.value();
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

    if (!requestId) {
      response.status(400).json({status: "ERROR", errorCode: "INVALID_REQUEST_ID"});
      return;
    }
    const domain = resolveDomain(commandType, resourceType);
    if (!domain) {
      response.status(400).json({status: "ERROR", errorCode: "UNSUPPORTED_COMMAND"});
      return;
    }
    const action = resolveAction(
      commandType,
      domain === "social_post" ? POST_PREFIX : MENU_COMMENT_PREFIX,
      body.payload,
    );
    if (!action) {
      response.status(400).json({status: "ERROR", errorCode: "INVALID_ACTION"});
      return;
    }
    if (reason.length < 3) {
      response.status(400).json({status: "ERROR", errorCode: "INVALID_REASON"});
      return;
    }

    const resourceId = domain === "social_post"
      ? text(body.resourceId, 200)
      : normalizeCommentId(body.resourceId);
    if (!resourceId) {
      response.status(400).json({status: "ERROR", errorCode: "INVALID_TARGET"});
      return;
    }

    try {
      const requestRef = db.collection(C_REQUESTS).doc(requestId);
      const targetRef = db
        .collection(domain === "social_post" ? C_POSTS : C_COMMENTS)
        .doc(resourceId);

      const outcome = await db.runTransaction(async (tx) => {
        const [requestSnap, targetSnap] = await Promise.all([tx.get(requestRef), tx.get(targetRef)]);

        // Cross-target idempotency: the same requestId must always mean the same
        // command against the same target, otherwise fail closed.
        const priorRequest = requestSnap.exists ? requestSnap.data() ?? null : null;
        if (priorRequest) {
          const same = priorRequest.commandType === commandType
            && priorRequest.resourceType === resourceType
            && priorRequest.resourceId === resourceId;
          if (!same) return {ok: false as const, conflict: true as const};
          return {
            ok: true as const,
            idempotent: true,
            from: String(priorRequest.from ?? ""),
            to: String(priorRequest.to ?? ""),
            changed: false,
          };
        }

        const stored = targetSnap.exists ? targetSnap.data() ?? null : null;

        if (domain === "social_post") {
          const decision = decidePostModeration(action, stored);
          if (!decision.ok) return {ok: false as const, error: decision.error};
          const update = buildPostModerationUpdate({
            action: decision.action,
            to: decision.to,
            reason,
            requestId,
            serverTimestamp: FieldValue.serverTimestamp(),
          });
          if (!postUpdateTouchesOnlyModerationFields(update)) {
            return {ok: false as const, error: "transition_not_allowed"};
          }
          tx.set(targetRef, update, {merge: true}); // soft state change — never a delete
          tx.set(requestRef, {
            commandType, resourceType, resourceId,
            from: decision.from, to: decision.to,
            appliedAt: FieldValue.serverTimestamp(),
          });
          return {ok: true as const, idempotent: false, from: decision.from, to: decision.to, changed: decision.changed};
        }

        const decision = decideMenuCommentModeration(action, stored);
        if (!decision.ok) return {ok: false as const, error: decision.error};
        const update = buildMenuCommentModerationUpdate({
          to: decision.to,
          reason,
          requestId,
          serverTimestamp: FieldValue.serverTimestamp(),
        });
        if (!updateTouchesOnlyModerationFields(update)) {
          return {ok: false as const, error: "transition_not_allowed"};
        }
        tx.set(targetRef, update, {merge: true}); // soft state change — never a delete
        tx.set(requestRef, {
          commandType, resourceType, resourceId,
          from: decision.from, to: decision.to,
          appliedAt: FieldValue.serverTimestamp(),
        });
        return {ok: true as const, idempotent: false, from: decision.from, to: decision.to, changed: decision.changed};
      });

      if (!outcome.ok) {
        if ("conflict" in outcome) {
          response.status(409).json({status: "ERROR", errorCode: "REQUEST_ID_CONFLICT"});
          return;
        }
        const mapped = errorResponse(outcome.error);
        response.status(mapped.status).json({status: "ERROR", errorCode: mapped.code});
        return;
      }

      await logEvent({
        userId: "control_center",
        eventType: "social_content_moderated",
        metadata: {
          domain, resourceId, action, commandType,
          from: outcome.from, to: outcome.to, requestId, idempotent: outcome.idempotent,
        },
      });

      response.status(200).json({
        status: "OK",
        domain,
        resourceId,
        action,
        before: outcome.from,
        after: outcome.to,
        changed: outcome.changed,
        idempotent: outcome.idempotent,
        requestId,
      });
    } catch (error) {
      console.error("Social moderation failed", {
        message: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      });
      response.status(500).json({status: "ERROR", errorCode: "INTERNAL_ERROR"});
    }
  },
);
