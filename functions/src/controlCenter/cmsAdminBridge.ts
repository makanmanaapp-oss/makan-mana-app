import {timingSafeEqual} from "node:crypto";

import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {logEvent} from "../services/eventService";
import {
  CMS_COLLECTION,
  CMS_COLLECTIONS_COLLECTION,
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
import {
  COLLECTION_EDITABLE_FIELDS,
  buildCollectionDocument,
  normalizeRestaurantIds,
  validateCollectionDescription,
  validateCollectionImagePath,
  validateCollectionTitle,
} from "../domain/cms/collectionDocument";
import {normalizeCanonicalPlaceId} from "../domain/restaurantEngagement/identity";
import {resolveProvenCanonicalRestaurantPlaceId} from "../services/restaurantProfileV2ReadService";

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
const COLLECTION_COMMAND_PREFIX = "cms.collection.";
const COLLECTION_RESOURCE_TYPE = "cms_collection";
const C_REQUESTS = "cms_admin_requests";

/**
 * Which CMS domain a command belongs to. Like the Wave 3C social bridge, the
 * command-type prefix AND the resource type must agree, so a mismatched pair
 * fails closed instead of reaching a handler that has to guess.
 */
type CmsDomain = "content" | "collection";

function resolveDomain(commandType: string, resourceType: string): CmsDomain | null {
  if (commandType.startsWith(COMMAND_PREFIX) && resourceType === RESOURCE_TYPE) {
    return "content";
  }
  if (commandType.startsWith(COLLECTION_COMMAND_PREFIX)
    && resourceType === COLLECTION_RESOURCE_TYPE) {
    return "collection";
  }
  return null;
}

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

function resolveAction(commandType: string, prefix: string): Action | null {
  if (!commandType.startsWith(prefix)) return null;
  const suffix = commandType.slice(prefix.length);
  return (ALLOWED_ACTIONS as readonly string[]).includes(suffix) ? suffix as Action : null;
}

/**
 * Prove every restaurant in a collection resolves to a REAL canonical identity.
 *
 * Runs BEFORE the transaction, because resolution is I/O. An id that cannot be
 * proven is rejected rather than silently dropped: an operator who added a
 * restaurant deserves to know it did not stick, and a collection that quietly
 * shrinks is worse than one that refuses to save.
 */
async function proveCanonicalIds(
  candidates: string[],
): Promise<{ok: true; ids: string[]} | {ok: false; invalid: string[]}> {
  const proven: string[] = [];
  const invalid: string[] = [];
  for (const candidate of candidates) {
    const resolved = await resolveProvenCanonicalRestaurantPlaceId(candidate);
    if (!resolved) {
      invalid.push(candidate);
      continue;
    }
    // Store the RESOLVED id, never the one the console happened to send, so a
    // provider/alias id can never become the stored canonical identity.
    if (!proven.includes(resolved)) proven.push(resolved);
  }
  if (invalid.length > 0) return {ok: false, invalid};
  return {ok: true, ids: proven};
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
    const domain = resolveDomain(commandType, resourceType);
    if (!domain) {
      response.status(400).json({status: "ERROR", errorCode: "UNSUPPORTED_COMMAND"});
      return;
    }
    const action = resolveAction(
      commandType,
      domain === "content" ? COMMAND_PREFIX : COLLECTION_COMMAND_PREFIX,
    );
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

    if (domain === "collection") {
      await handleCollectionCommand({
        response, requestId, commandType, resourceType, resourceId,
        action, payload, reason, nowMs,
      });
      return;
    }

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

/**
 * Curated discovery collection commands.
 *
 * Split into its own handler so the content path stays readable, but it shares
 * everything that matters: the same bridge, the same secret, the same request
 * ledger, the same transition decision, the same reason floor.
 *
 * Canonical identity is PROVEN before the transaction, because resolution is
 * I/O and a Firestore transaction may not read after it writes.
 */
async function handleCollectionCommand(ctx: {
  response: {status: (code: number) => {json: (body: unknown) => void}};
  requestId: string;
  commandType: string;
  resourceType: string;
  resourceId: string;
  action: Action;
  payload: Record<string, unknown>;
  reason: string;
  nowMs: number;
}): Promise<void> {
  const {response, requestId, commandType, resourceType, resourceId, action,
    payload, reason, nowMs} = ctx;

  const fail = (status: number, code: string, extra?: Record<string, unknown>) => {
    response.status(status).json({status: "ERROR", errorCode: code, ...(extra ?? {})});
  };

  // Content validation first — cheap, and it fails fast before any lookup.
  const patch: Record<string, unknown> = {};
  const requireAll = action === ACTION_CREATE;
  const has = (key: string) => payload[key] !== undefined;

  if (requireAll || has("title")) {
    const v = validateCollectionTitle(payload.title);
    if (!v.ok) return fail(400, v.error.toUpperCase());
    patch.title = v.value;
  }
  if (requireAll || has("description")) {
    const v = validateCollectionDescription(payload.description);
    if (!v.ok) return fail(400, v.error.toUpperCase());
    patch.description = v.value;
  }
  if (requireAll || has("imagePath")) {
    const v = validateCollectionImagePath(payload.imagePath);
    if (!v.ok) return fail(400, v.error.toUpperCase());
    patch.imagePath = v.value;
  }
  if (requireAll || has("targeting")) {
    const v = validateTargeting(payload.targeting);
    if (!v.ok) return fail(400, v.error.toUpperCase());
    patch.targeting = {kind: v.value!.kind, values: v.value!.values};
  }
  if (requireAll || has("priority")) {
    const v = validatePriority(payload.priority);
    if (!v.ok) return fail(400, v.error.toUpperCase());
    patch.priority = v.value;
  }
  if (requireAll || has("placement")) {
    const v = validateCmsPlacement(payload.placement);
    if (!v.ok) return fail(400, v.error.toUpperCase());
    // A collection is a discovery module; it has no meaning on a single
    // restaurant's page, so that placement is refused rather than rendered
    // somewhere it cannot work.
    if (v.value === PLACEMENT_RESTAURANT_DETAIL) {
      return fail(400, "PLACEMENT_NOT_ALLOWED_FOR_COLLECTION");
    }
    patch.placement = v.value;
  }

  let duplicates: string[] = [];
  if (requireAll || has("canonicalPlaceIds")) {
    const normalized = normalizeRestaurantIds(payload.canonicalPlaceIds);
    if (!normalized.ok || !normalized.value) return fail(400, normalized.error.toUpperCase());
    duplicates = normalized.value.duplicates;

    const proven = await proveCanonicalIds(normalized.value.ids);
    if (!proven.ok) {
      // Named explicitly: an operator must be able to fix the exact entry.
      return fail(400, "CANONICAL_RESTAURANT_INVALID", {invalid: proven.invalid});
    }
    if (proven.ids.length === 0) return fail(400, "RESTAURANTS_REQUIRED");
    patch.canonicalPlaceIds = proven.ids;
  }

  let window: {startsAtMs: number; endsAtMs: number} | null = null;
  if (requireAll || has("startsAt") || has("endsAt")) {
    const v = validateCmsWindow(payload.startsAt, payload.endsAt, nowMs);
    if (!v.ok || !v.value) return fail(400, v.error.toUpperCase());
    window = v.value;
  }

  try {
    const requestRef = db.collection(C_REQUESTS).doc(requestId);

    const outcome = await db.runTransaction(async (tx) => {
      const requestSnap = await tx.get(requestRef);
      const prior = requestSnap.exists ? requestSnap.data() ?? null : null;
      if (prior) {
        const same = prior.commandType === commandType
          && prior.resourceType === resourceType
          && (action === ACTION_CREATE || String(prior.resourceId ?? "") === resourceId);
        if (!same) return {ok: false as const, conflict: true as const};
        return {
          ok: true as const,
          idempotent: true,
          collectionId: String(prior.resourceId ?? ""),
          to: String(prior.to ?? ""),
        };
      }

      if (action === ACTION_CREATE) {
        if (!window) return {ok: false as const, error: "window_invalid"};

        const requested = payload.status;
        let status: CmsStatus = CMS_STATUS_DRAFT;
        if (requested !== undefined) {
          if (!isCmsStatus(requested)
            || (requested !== CMS_STATUS_DRAFT && requested !== CMS_STATUS_SCHEDULED)) {
            return {ok: false as const, error: "status_not_settable_on_create"};
          }
          status = requested;
        }

        const ref = db.collection(CMS_COLLECTIONS_COLLECTION).doc();
        tx.set(ref, {
          ...buildCollectionDocument({
            placement: patch.placement as never,
            title: String(patch.title ?? ""),
            description: String(patch.description ?? ""),
            imagePath: String(patch.imagePath ?? ""),
            canonicalPlaceIds: patch.canonicalPlaceIds as string[],
            targeting: patch.targeting as never,
            priority: Number(patch.priority ?? 100),
            startsAtMs: window.startsAtMs,
            endsAtMs: window.endsAtMs,
            status,
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
        return {ok: true as const, idempotent: false, collectionId: ref.id, to: status};
      }

      const targetRef = db.collection(CMS_COLLECTIONS_COLLECTION).doc(resourceId);
      const targetSnap = await tx.get(targetRef);
      if (!targetSnap.exists) return {ok: false as const, error: "collection_missing"};
      const stored = targetSnap.data() ?? {};
      const storedStatus = isCmsStatus(stored.status) ? stored.status : CMS_STATUS_DRAFT;
      const startsAtMs = typeof stored.startsAtMs === "number" ? stored.startsAtMs : null;
      const endsAtMs = typeof stored.endsAtMs === "number" ? stored.endsAtMs : null;

      if (action === ACTION_UPDATE) {
        const update: Record<string, unknown> = {...patch};
        if (window) {
          update.startsAtMs = window.startsAtMs;
          update.endsAtMs = window.endsAtMs;
        }
        for (const key of Object.keys(update)) {
          if (!(COLLECTION_EDITABLE_FIELDS as readonly string[]).includes(key)) {
            return {ok: false as const, error: "field_not_editable"};
          }
        }
        if (Object.keys(update).length === 0) {
          return {ok: false as const, error: "nothing_to_update"};
        }
        update.updatedAtMs = nowMs;
        update.updatedAt = FieldValue.serverTimestamp();
        update.updatedByRequestId = requestId;
        update.lastAdminReason = reason;
        tx.set(targetRef, update, {merge: true});
        tx.set(requestRef, {
          commandType, resourceType, resourceId,
          to: storedStatus, appliedAt: FieldValue.serverTimestamp(),
        });
        return {ok: true as const, idempotent: false, collectionId: resourceId, to: storedStatus};
      }

      const decision = decideCmsTransition({
        stored: storedStatus, startsAtMs, endsAtMs,
        requested: payload.status, nowMs,
      });
      if (!decision.ok || !decision.next) {
        return {ok: false as const, error: decision.reason};
      }
      const update: Record<string, unknown> = {
        status: decision.next,
        updatedAtMs: nowMs,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByRequestId: requestId,
        lastAdminReason: reason,
      };
      if (decision.next === CMS_STATUS_ACTIVE && stored.publishedAtMs == null) {
        update.publishedAtMs = nowMs;
      }
      if (decision.next === CMS_STATUS_ARCHIVED) update.archivedAtMs = nowMs;

      tx.set(targetRef, update, {merge: true}); // soft change — never a delete
      tx.set(requestRef, {
        commandType, resourceType, resourceId,
        from: storedStatus, to: decision.next,
        appliedAt: FieldValue.serverTimestamp(),
      });
      return {ok: true as const, idempotent: false, collectionId: resourceId, to: decision.next};
    });

    if (!outcome.ok) {
      if ("conflict" in outcome) return fail(409, "REQUEST_ID_REUSED");
      const error = outcome.error ?? "internal";
      const status = error === "collection_missing" ? 404
        : error.startsWith("transition_not_allowed") || error === "status_unchanged" ? 409
          : 400;
      return fail(status, error.toUpperCase());
    }

    if (!outcome.idempotent) {
      await logEvent({
        userId: "control_center",
        eventType: "cms_collection_command_applied",
        metadata: {
          collectionId: outcome.collectionId, action, to: outcome.to, requestId,
        },
      });
    }

    response.status(200).json({
      status: "OK",
      idempotent: outcome.idempotent,
      collectionId: outcome.collectionId,
      to: outcome.to,
      // Reported so the console can tell the operator what it silently fixed.
      dedupedRestaurants: duplicates,
    });
  } catch (error) {
    console.error("cms collection command failed", {
      action,
      message: error instanceof Error ? error.message.slice(0, 300) : "unknown",
    });
    fail(500, "INTERNAL_ERROR");
  }
}
