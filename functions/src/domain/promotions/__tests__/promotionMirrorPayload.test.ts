/**
 * WAVE 4 — promotion mirror payload contract.
 *
 * The mirror is what an operator acts on, so the claims here are: it never
 * carries a person's identifier, it never sends a row Supabase would silently
 * drop, and its event id is a real idempotency key — stable for the same state,
 * different for a new one.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  PROMOTION_MIRROR_ENTITY_TYPE,
  promotionMirrorEventId,
  toPromotionMirrorRecord,
} from "../promotionMirrorPayload";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 8, 12, 0, 0);

function stored(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    canonicalPlaceId: "canon-1",
    restaurantDisplayName: "Warung Pak Din",
    title: "Set lunch RM12",
    description: "Nasi + air",
    terms: "Sehingga stok habis",
    offerType: "amount_off",
    offerLabel: "RM5 off",
    minSpendSen: 1200,
    eligibility: {audience: "all", plans: []},
    status: "active",
    startsAtMs: NOW - HOUR,
    endsAtMs: NOW + HOUR,
    publishedAtMs: NOW - HOUR,
    archivedAtMs: null,
    updatedAtMs: NOW,
    createdByUid: "merchant-uid-abc",
    updatedByUid: "merchant-uid-abc",
    updatedByRequestId: "req-123",
    lastAdminReason: "policy review",
    ...overrides,
  };
}

test("entity type matches the Control Center contract exactly", () => {
  assert.equal(PROMOTION_MIRROR_ENTITY_TYPE, "restaurant_promotion");
});

test("mirror record carries the operational fields an operator needs", () => {
  const r = toPromotionMirrorRecord("promo-1", stored(), NOW);
  assert.ok(r);
  assert.equal(r!.promotion_id, "promo-1");
  assert.equal(r!.canonical_place_id, "canon-1");
  assert.equal(r!.restaurant_display_name, "Warung Pak Din");
  assert.equal(r!.title, "Set lunch RM12");
  assert.equal(r!.offer_type, "amount_off");
  assert.equal(r!.status, "active");
  assert.equal(r!.effective_status, "active");
  assert.equal(r!.starts_at_ms, NOW - HOUR);
  assert.equal(r!.ends_at_ms, NOW + HOUR);
  assert.equal(r!.published_at_ms, NOW - HOUR);
  assert.equal(r!.last_request_id, "req-123");
});

test("NO merchant or admin identifier reaches the mirror", () => {
  const serialized = JSON.stringify(toPromotionMirrorRecord("promo-1", stored(), NOW));
  for (const leak of ["merchant-uid-abc", "createdByUid", "updatedByUid", "admin"]) {
    assert.equal(serialized.includes(leak), false, `mirror leaked ${leak}`);
  }
});

test("a field added to storage later cannot leak into the mirror", () => {
  const serialized = JSON.stringify(toPromotionMirrorRecord("promo-1", stored({
    internalMargin: 0.42,
    actorAdminId: "admin-999",
    merchantMemberId: "member-777",
  }), NOW));
  assert.equal(serialized.includes("admin-999"), false);
  assert.equal(serialized.includes("member-777"), false);
  assert.equal(serialized.includes("internalMargin"), false);
});

test("effective status is carried, so the console is never behind the app", () => {
  // Stored intent still says active; the window closed an hour ago.
  const r = toPromotionMirrorRecord("promo-1", stored({
    startsAtMs: NOW - 3 * HOUR, endsAtMs: NOW - HOUR,
  }), NOW);
  assert.equal(r!.status, "active", "the intent is mirrored unchanged");
  assert.equal(r!.effective_status, "expired", "and the truth travels with it");
});

test("a terminal state is mirrored truthfully, never dropped", () => {
  const archived = toPromotionMirrorRecord("promo-1", stored({
    status: "archived", archivedAtMs: NOW,
  }), NOW);
  assert.equal(archived!.status, "archived");
  assert.equal(archived!.effective_status, "archived");
  assert.equal(archived!.archived_at_ms, NOW);
});

test("a row Supabase would silently drop is never sent", () => {
  // Migration 0039 requires these four non-empty before it will insert.
  assert.equal(toPromotionMirrorRecord("", stored(), NOW), null);
  assert.equal(toPromotionMirrorRecord("p", stored({canonicalPlaceId: "  "}), NOW), null);
  assert.equal(toPromotionMirrorRecord("p", stored({title: ""}), NOW), null);
  assert.equal(toPromotionMirrorRecord("p", stored({status: ""}), NOW), null);
  assert.equal(toPromotionMirrorRecord("p", null, NOW), null);
});

test("plan eligibility is summarised, and a malformed one degrades to 'all'", () => {
  const plan = toPromotionMirrorRecord("p", stored({
    eligibility: {audience: "plan", plans: ["pro"]},
  }), NOW);
  assert.equal(plan!.eligibility_audience, "plan");
  assert.deepEqual(plan!.eligibility_plans, ["pro"]);

  const broken = toPromotionMirrorRecord("p", stored({
    eligibility: {audience: "plan", plans: []},
  }), NOW);
  assert.equal(broken!.eligibility_audience, "all",
    "a plan gate with no plans is not a gate");
});

test("event id is stable for the same state and different for a new one", () => {
  const a = promotionMirrorEventId("promo-1", NOW);
  const b = promotionMirrorEventId("promo-1", NOW);
  const c = promotionMirrorEventId("promo-1", NOW + 1);
  assert.equal(a, b, "a replay must be recognisable as a duplicate");
  assert.notEqual(a, c, "a genuine later change must be a new event");
  assert.equal(promotionMirrorEventId("promo-1", null), null);
  assert.equal(promotionMirrorEventId("", NOW), null);
});
