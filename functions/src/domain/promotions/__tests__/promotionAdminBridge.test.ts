/**
 * WAVE 4 — Control Center → Firebase promotion receiver contract.
 *
 * Follows the Wave 3C convention exactly: the receiver's SECURITY posture is
 * asserted against its source (the same way menuCommentModeration.test.ts
 * guards socialModerationBridge.ts), and the DECISION it delegates to is
 * exercised directly as pure logic.
 *
 * That split is deliberate. The parts worth testing are "what is refused" and
 * "who decides", and both are visible without a live Firestore — while an
 * emulator test of the HTTP layer would mostly prove that fetch works.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {decidePromotionTransition} from "../promotionLifecycle";
import {
  PROMOTION_STATUS_ACTIVE,
  PROMOTION_STATUS_ARCHIVED,
  PROMOTION_STATUS_PAUSED,
} from "../promotionTypes";

const src = readFileSync(
  resolve(process.cwd(), "src/controlCenter/promotionAdminBridge.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 8, 12, 0, 0);

// ── AUTH / TRANSPORT ───────────────────────────────────────────────────────

test("1. the bridge authenticates with a constant-time bearer comparison", () => {
  assert.ok(src.includes("timingSafeEqual"), "must not leak timing on the secret");
  assert.ok(src.includes("PROMOTION_ADMIN_BRIDGE_SECRET"));
  assert.ok(src.includes("UNAUTHENTICATED"));
  // The secret must never be logged or echoed.
  assert.equal(/console\.(log|error|warn)\([^)]*secret/i.test(src), false);
});

test("2. non-POST is refused", () => {
  assert.ok(src.includes("METHOD_NOT_ALLOWED"));
});

test("3. the command family is an allowlist, not a prefix match", () => {
  assert.ok(src.includes('const COMMAND_PREFIX = "commercial.promotion."'));
  assert.ok(src.includes('const RESOURCE_TYPE = "restaurant_promotion"'));
  assert.ok(src.includes("ALLOWED_ACTIONS"));
  assert.ok(src.includes("UNSUPPORTED_COMMAND"));
  // Resource type must be checked, so a matching prefix alone never qualifies.
  assert.ok(src.includes("resourceType !== RESOURCE_TYPE"));
});

test("4. command type and payload must agree, or the request fails closed", () => {
  assert.ok(src.includes("fromPayload !== fromType"));
});

test("5. requestId and reason are mandatory at the receiver, not assumed", () => {
  assert.ok(src.includes("INVALID_REQUEST_ID"));
  assert.ok(src.includes("reason.length < 8"), "the bridge restates the floor itself");
  assert.ok(src.includes("INVALID_REASON"));
});

test("6. the target id is validated and cannot traverse collections", () => {
  assert.ok(src.includes('promotionId.includes("/")'));
  assert.ok(src.includes("INVALID_TARGET"));
});

// ── AUTHORITY ──────────────────────────────────────────────────────────────

test("7. browser-asserted identity is a CHECK, never the source of truth", () => {
  assert.ok(src.includes("assertedPlaceId"), "the console's claim is named as such");
  assert.ok(src.includes("assertedPlaceId !== canonicalPlaceId"));
  assert.ok(src.includes("restaurant_mismatch"));
  // Identity is read from the stored document.
  assert.ok(src.includes("text(stored.canonicalPlaceId"));
});

test("8. browser-observed status is never trusted as the effective status", () => {
  // The stored document's status is what the decision runs on.
  assert.ok(src.includes("isPromotionStatus(stored.status)"));
  assert.ok(src.includes("stored: storedStatus"));
});

test("9. the transition decision is the SHARED one, not a second copy", () => {
  assert.ok(src.includes("decidePromotionTransition"), "one implementation only");
  assert.equal(/function\s+decide\w*Transition/.test(src), false,
    "the bridge must not define its own transition logic");
});

test("10. timestamps are server-controlled", () => {
  assert.ok(src.includes("FieldValue.serverTimestamp()"));
  assert.equal(src.includes("body.updatedAt"), false, "no client timestamp is read");
  assert.equal(src.includes("payload.updatedAtMs"), false);
});

test("11. the write is allowlisted — content and identity are untouchable", () => {
  const update = src.slice(src.indexOf("const update: Record<string, unknown> = {"));
  const block = update.slice(0, update.indexOf("};"));
  for (const forbidden of ["title", "description", "terms", "canonicalPlaceId",
    "offerType", "eligibility", "startsAtMs", "endsAtMs", "createdByUid"]) {
    assert.equal(block.includes(`${forbidden}:`), false,
      `the admin plane must not write ${forbidden}`);
  }
  assert.ok(block.includes("status:"));
});

test("12. nothing is ever hard-deleted", () => {
  assert.equal(/\.delete\(/.test(src), false, "promotions are archived, not deleted");
  assert.ok(src.includes("{merge: true}"));
});

// ── IDEMPOTENCY ────────────────────────────────────────────────────────────

test("13. replay is safe and requestId reuse across targets is refused", () => {
  assert.ok(src.includes("promotion_admin_requests"));
  assert.ok(src.includes("runTransaction"), "the check and the write are atomic");
  assert.ok(src.includes("idempotent: true"));
  assert.ok(src.includes("REQUEST_ID_REUSED"));
  assert.ok(src.includes("prior.resourceId === promotionId"));
});

test("14. a rejected command writes nothing and emits no success audit", () => {
  // The audit log is emitted only after a non-idempotent successful outcome.
  const auditAt = src.indexOf("promotion_admin_status_changed");
  const guardAt = src.indexOf("if (!outcome.idempotent)");
  assert.ok(guardAt > 0 && auditAt > guardAt,
    "the audit event must sit behind the success guard");
  assert.ok(src.indexOf("if (!outcome.ok)") < guardAt,
    "failures return before the audit path");
});

test("15. no admin identifier is written to Firestore or echoed back", () => {
  // The bridge never receives an admin id at all, so it cannot store one.
  assert.equal(/adminId|actorAdminId/.test(src), false);

  // The success response body is exactly the lifecycle outcome — scoped to the
  // object literal, so a log line mentioning "admin bridge" is not mistaken for
  // a payload leak.
  const start = src.indexOf("response.status(200).json({");
  const body = src.slice(start, src.indexOf("});", start));
  for (const leak of ["admin", "uid", "secret", "reason"]) {
    assert.equal(body.toLowerCase().includes(leak), false,
      `the success response leaked ${leak}`);
  }
  assert.ok(body.includes("idempotent") && body.includes("from") && body.includes("to"));
});

// ── DELEGATED DECISION (pure) ──────────────────────────────────────────────

test("16. valid transitions the operator may command", () => {
  const pause = decidePromotionTransition({
    stored: PROMOTION_STATUS_ACTIVE, startsAtMs: NOW - HOUR, endsAtMs: NOW + HOUR,
    requested: PROMOTION_STATUS_PAUSED, nowMs: NOW,
  });
  assert.equal(pause.ok, true, pause.reason);

  const archive = decidePromotionTransition({
    stored: PROMOTION_STATUS_PAUSED, startsAtMs: NOW - HOUR, endsAtMs: NOW + HOUR,
    requested: PROMOTION_STATUS_ARCHIVED, nowMs: NOW,
  });
  assert.equal(archive.ok, true, archive.reason);
});

test("17. an expired offer cannot be resumed through the admin plane either", () => {
  const d = decidePromotionTransition({
    stored: PROMOTION_STATUS_PAUSED, startsAtMs: NOW - 3 * HOUR, endsAtMs: NOW - HOUR,
    requested: PROMOTION_STATUS_ACTIVE, nowMs: NOW,
  });
  assert.equal(d.ok, false);
  assert.match(d.reason, /expired/,
    "an operator gets exactly the same answer a merchant would");
});

test("18. the receiver allowlist matches what the Control Center emits", () => {
  // Control Center emits `commercial.promotion.${requested}` for these three.
  for (const action of ["active", "paused", "archived"]) {
    assert.ok(src.includes(`"${action}"`) || src.includes(`PROMOTION_STATUS_${action.toUpperCase()}`),
      `receiver must accept commercial.promotion.${action}`);
  }
  // And must NOT accept a status the console can never legitimately send.
  assert.equal(src.includes('"expired",'), false,
    "expiry is derived from the clock, never commanded");
});
