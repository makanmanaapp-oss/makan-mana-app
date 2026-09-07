import {timingSafeEqual} from "node:crypto";

import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {logEvent} from "../services/eventService";
import {
  CMS_COLLECTION,
  CMS_STATUS_ACTIVE,
  CMS_STATUS_ARCHIVED,
  CMS_STATUS_DRAFT,
  CMS_STATUS_SCHEDULED,
  PLACEMENT_RESTAURANT_DETAIL,
  isCmsStatus,
  type CmsStatus,
} from "../domain/cms/cmsTypes";
import {
  decideCmsTransition,
  validateAltText,
  validateCmsBody,
  validateCmsMedia,
  validateCmsPlacement,
  validateCmsSubtitle,
  validateCmsTitle,
  validateCmsWindow,
  validateCtaDestination,
  validateCtaLabel,
  validatePriority,
  validateTargeting,
} from "../domain/cms/cmsLifecycle";
import {
  CMS_EDITABLE_FIELDS,
  buildCmsDocument,
} from "../domain/cms/cmsDocument";
import {normalizeCanonicalPlaceId} from "../domain/restaurantEngagement/identity";

/**
 * WAVE 5 — the ONE trusted Control Center → Firebase CMS bridge.
 *
 * Command family:
 *   cms.content.create        → new cms_content document
 *   cms.content.update        → allowlisted content edit
 *   cms.content.set_status    → lifecycle transition
 *
 * Same posture as the Wave 3C and Wave 4 receivers, deliberately: constant-time
 * bearer comparison never logged, command + resource-type allowlist, payload
 * allowlist, transactional idempotency on requestId, fail-closed throughout.
 *
 * Unlike promotions, CMS content IS authored here — MakanMana is the author, so
 * create and edit belong on the admin plane. Every field still goes through the
 * shared domain validators; the bridge never writes a raw payload value.
 *
 * NOT DEPLOYED.
 */

const CMS_ADMIN_BRIDGE_SECRET = defineSecret("CMS_ADMIN_BRIDGE_SECRET");

const COMMAND_PREFIX = "cms.content.";
const RESOURCE_TYPE = "cms_content";
const C_REQUESTS = "cms_admin_requests";

const ACTION_CREATE = "create";
const ACTION_UPDATE = "update";
const ACTION_SET_STATUS = "set_status";
const ALLOWED_ACTIONS = [ACTION_CREATE, ACTION_UPDATE, ACTION_SET_STATUS] as const;
type Action = (typeof ALLOWED_ACTIONS)[number];

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

function resolveAction(commandType: string): Action | null {
  if (!commandType.startsWith(COMMAND_PREFIX)) return null;
  const suffix = commandType.slice(COMMAND_PREFIX.length);
  return (ALLOWED_ACTIONS as readonly string[]).includes(suffix) ? suffix as Action : null;
}

/** Validate every supplied content field. One shared validator set, no second copy. */
function validateContentFields(
  payload: Record<string, unknown>,
  nowMs: number,
  requireAll: boolean,
): {ok: true; patch: Record<string, unknown>} | {ok: false; error: string} {
  const patch: Record<string, unknown> = {};

  const has = (key: string) => payload[key] !== undefined;

  if (requireAll || has("title")) {
    const v = validateCmsTitle(payload.title);
    if (!v.ok) return {ok: false, error: v.error};
    patch.title = v.value;
  }
  if (requireAll || has("subtitle")) {
    const v = validateCmsSubtitle(payload.subtitle);
    if (!v.ok) return {ok: false, error: v.error};
    patch.subtitle = v.value;
  }
  if (requireAll || has("body")) {
    const v = validateCmsBody(payload.body);
    if (!v.ok) return {ok: false, error: v.error};
    patch.body = v.value;
  }
  if (requireAll || has("ctaLabel")) {
    const v = validateCtaLabel(payload.ctaLabel);
    if (!v.ok) return {ok: false, error: v.error};
    patch.ctaLabel = v.value;
  }
  if (requireAll || has("ctaDestination")) {
    const v = validateCtaDestination(payload.ctaDestination);
    if (!v.ok) return {ok: false, error: v.error};
    patch.ctaDestination = v.value;
  }
  if (requireAll || has("media")) {
    const v = validateCmsMedia(payload.media);
    if (!v.ok) return {ok: false, error: v.error};
    patch.media = v.value ? {...v.value} : null;
  }
  if (requireAll || has("targeting")) {
    const v = validateTargeting(payload.targeting);
    if (!v.ok) return {ok: false, error: v.error};
    patch.targeting = {kind: v.value!.kind, values: v.value!.values};
  }
  if (requireAll || has("priority")) {
    const v = validatePriority(payload.priority);
    if (!v.ok) return {ok: false, error: v.error};
    patch.priority = v.value;
  }
  if (requireAll || has("altText")) {
    const v = validateAltText(payload.altText);
    if (!v.ok) return {ok: false, error: v.error};
  }

  return {ok: true, patch};
}

export const controlCenterCmsAdminBridge = onRequest(
  {secrets: [CMS_ADMIN_BRIDGE_SECRET], timeoutSeconds: 30, memory: "256MiB", maxInstances: 3},
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).json({status: "ERROR", errorCode: "METHOD_NOT_ALLOWED"});
      return;
    }

    const secret = CMS_ADMIN_BRIDGE_SECRET.value();
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
    const payload = objectOf(body.payload);
    const resourceId = text(body.resourceId, 200);

    if (!requestId) {
      response.status(400).json({status: "ERROR", errorCode: "INVALID_REQUEST_ID"});
      return;
    }
    if (resourceType !== RESOURCE_TYPE) {
      response.status(400).json({status: "ERROR", errorCode: "UNSUPPORTED_COMMAND"});
      return;
    }
    const action = resolveAction(commandType);
    if (!action) {
      response.status(400).json({status: "ERROR", errorCode: "UNSUPPORTED_COMMAND"});
      return;
    }
    if (reason.length < 8) {
      response.status(400).json({status: "ERROR", errorCode: "INVALID_REASON"});
      return;
    }
    if (action !== ACTION_CREATE && (!resourceId || resourceId.includes("/"))) {
      response.status(400).json({status: "ERROR", errorCode: "INVALID_TARGET"});
      return;
    }

    const nowMs = Date.now();

    try {
      const requestRef = db.collection(C_REQUESTS).doc(requestId);

      const outcome = await db.runTransaction(async (tx) => {
        const requestSnap = await tx.get(requestRef);
        const prior = requestSnap.exists ? requestSnap.data() ?? null : null;
        if (prior) {
          const same = prior.commandType === commandType
            && prior.resourceType === resourceType
            && String(prior.resourceId ?? "") === (action === ACTION_CREATE
              ? String(prior.resourceId ?? "") : resourceId);
          if (!same) return {ok: false as const, conflict: true as const};
          return {
            ok: true as const,
            idempotent: true,
            contentId: String(prior.resourceId ?? ""),
            to: String(prior.to ?? ""),
          };
        }

        if (action === ACTION_CREATE) {
          const placement = validateCmsPlacement(payload.placement);
          if (!placement.ok) return {ok: false as const, error: placement.error};

          const fields = validateContentFields(payload, nowMs, true);
          if (!fields.ok) return {ok: false as const, error: fields.error};

          const window = validateCmsWindow(payload.startsAt, payload.endsAt, nowMs);
          if (!window.ok || !window.value) return {ok: false as const, error: window.error};

          // A restaurant-detail banner must name the restaurant it belongs to,
          // and that id must be a well-formed canonical id.
          let canonicalPlaceId: string | null = null;
          if (placement.value === PLACEMENT_RESTAURANT_DETAIL) {
            canonicalPlaceId = normalizeCanonicalPlaceId(payload.canonicalPlaceId);
            if (!canonicalPlaceId) return {ok: false as const, error: "canonical_place_id_required"};
          }

          // Content is born draft or scheduled; going live is a separate,
          // audited transition, so "created" and "published" are never one act.
          const requested = payload.status;
          let status: CmsStatus = CMS_STATUS_DRAFT;
          if (requested !== undefined) {
            if (!isCmsStatus(requested)
              || (requested !== CMS_STATUS_DRAFT && requested !== CMS_STATUS_SCHEDULED)) {
              return {ok: false as const, error: "status_not_settable_on_create"};
            }
            status = requested;
          }

          const ref = db.collection(CMS_COLLECTION).doc();
          tx.set(ref, {
            ...buildCmsDocument({
              placement: placement.value!,
              title: String(fields.patch.title ?? ""),
              subtitle: String(fields.patch.subtitle ?? ""),
              body: String(fields.patch.body ?? ""),
              ctaLabel: String(fields.patch.ctaLabel ?? ""),
              ctaDestination: String(fields.patch.ctaDestination ?? ""),
              media: (fields.patch.media ?? null) as never,
              targeting: fields.patch.targeting as never,
              priority: Number(fields.patch.priority ?? 100),
              startsAtMs: window.value.startsAtMs,
              endsAtMs: window.value.endsAtMs,
              status,
              canonicalPlaceId,
              // The console's admin id is recorded in ITS audit trail; Firebase
              // stores only the request id that correlates the two.
              actorAdminId: "",
              requestId,
            }),
            createdAtMs: nowMs,
            updatedAtMs: nowMs,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            lastAdminReason: reason,
          });
          tx.set(requestRef, {
            commandType, resourceType, resourceId: ref.id,
            to: status, appliedAt: FieldValue.serverTimestamp(),
          });
          return {ok: true as const, idempotent: false, contentId: ref.id, to: status};
        }

        const targetRef = db.collection(CMS_COLLECTION).doc(resourceId);
        const targetSnap = await tx.get(targetRef);
        if (!targetSnap.exists) return {ok: false as const, error: "content_missing"};
        const stored = targetSnap.data() ?? {};
        const storedStatus = isCmsStatus(stored.status) ? stored.status : CMS_STATUS_DRAFT;
        const startsAtMs = typeof stored.startsAtMs === "number" ? stored.startsAtMs : null;
        const endsAtMs = typeof stored.endsAtMs === "number" ? stored.endsAtMs : null;

        if (action === ACTION_UPDATE) {
          const fields = validateContentFields(payload, nowMs, false);
          if (!fields.ok) return {ok: false as const, error: fields.error};
          const patch: Record<string, unknown> = {...fields.patch};

          if (payload.startsAt !== undefined || payload.endsAt !== undefined) {
            const window = validateCmsWindow(
              payload.startsAt ?? startsAtMs, payload.endsAt ?? endsAtMs, nowMs);
            if (!window.ok || !window.value) return {ok: false as const, error: window.error};
            patch.startsAtMs = window.value.startsAtMs;
            patch.endsAtMs = window.value.endsAtMs;
          }

          if (payload.canonicalPlaceId !== undefined) {
            const canonical = normalizeCanonicalPlaceId(payload.canonicalPlaceId);
            if (!canonical) return {ok: false as const, error: "canonical_place_id_invalid"};
            patch.canonicalPlaceId = canonical;
          }

          // Nothing outside the editable allowlist may be written, whatever the
          // payload contains.
          for (const key of Object.keys(patch)) {
            if (!(CMS_EDITABLE_FIELDS as readonly string[]).includes(key)) {
              return {ok: false as const, error: "field_not_editable"};
            }
          }
          if (Object.keys(patch).length === 0) {
            return {ok: false as const, error: "nothing_to_update"};
          }

          patch.updatedAtMs = nowMs;
          patch.updatedAt = FieldValue.serverTimestamp();
          patch.updatedByRequestId = requestId;
          patch.lastAdminReason = reason;
          tx.set(targetRef, patch, {merge: true});
          tx.set(requestRef, {
            commandType, resourceType, resourceId,
            to: storedStatus, appliedAt: FieldValue.serverTimestamp(),
          });
          return {ok: true as const, idempotent: false, contentId: resourceId, to: storedStatus};
        }

        // set_status
        const decision = decideCmsTransition({
          stored: storedStatus, startsAtMs, endsAtMs,
          requested: payload.status, nowMs,
        });
        if (!decision.ok || !decision.next) {
          return {ok: false as const, error: decision.reason};
        }
        const patch: Record<string, unknown> = {
          status: decision.next,
          updatedAtMs: nowMs,
          updatedAt: FieldValue.serverTimestamp(),
          updatedByRequestId: requestId,
          lastAdminReason: reason,
        };
        if (decision.next === CMS_STATUS_ACTIVE && stored.publishedAtMs == null) {
          patch.publishedAtMs = nowMs;
        }
        if (decision.next === CMS_STATUS_ARCHIVED) patch.archivedAtMs = nowMs;

        tx.set(targetRef, patch, {merge: true}); // soft change — never a delete
        tx.set(requestRef, {
          commandType, resourceType, resourceId,
          from: storedStatus, to: decision.next,
          appliedAt: FieldValue.serverTimestamp(),
        });
        return {ok: true as const, idempotent: false, contentId: resourceId, to: decision.next};
      });

      if (!outcome.ok) {
        if ("conflict" in outcome) {
          response.status(409).json({status: "ERROR", errorCode: "REQUEST_ID_REUSED"});
          return;
        }
        const error = outcome.error ?? "internal";
        const status = error === "content_missing" ? 404
          : error.startsWith("transition_not_allowed") || error === "status_unchanged" ? 409
            : 400;
        response.status(status).json({status: "ERROR", errorCode: error.toUpperCase()});
        return;
      }

      if (!outcome.idempotent) {
        await logEvent({
          userId: "control_center",
          eventType: "cms_admin_command_applied",
          metadata: {contentId: outcome.contentId, action, to: outcome.to, requestId},
        });
      }

      response.status(200).json({
        status: "OK",
        idempotent: outcome.idempotent,
        contentId: outcome.contentId,
        to: outcome.to,
      });
    } catch (error) {
      console.error("cms admin bridge failed", {
        action,
        message: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      });
      response.status(500).json({status: "ERROR", errorCode: "INTERNAL_ERROR"});
    }
  },
);
