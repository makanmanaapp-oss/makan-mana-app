import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {resolve as pathResolve} from "node:path";

import {
  MAX_PLACE_ID_LENGTH,
  resolveCanonicalPlaceIdWith,
  type CanonicalAliasRecord,
  type CanonicalResolutionDeps,
} from "../canonicalResolution";
import {restaurantFollowDocId} from "../restaurantFollow";
import {normalizeCanonicalPlaceId} from "../identity";

/**
 * Wave 3B final micro-corrective — canonical identity must resolve WITHOUT an
 * active publication so an unfollow can never orphan the canonical follow doc.
 */

const ALIAS = "google:ABC";
const CANONICAL = "canonical-123";
const UID = "user-1";

function deps(heads: string[], aliases: Record<string, CanonicalAliasRecord>): CanonicalResolutionDeps {
  const headSet = new Set(heads);
  return {
    headExists: async (id) => headSet.has(id),
    readAlias: async (id) => (Object.prototype.hasOwnProperty.call(aliases, id) ? aliases[id] : null),
  };
}

// A — alias input resolves to the canonical id (follow identity is canonical).
test("A. alias input resolves to the canonical id", async () => {
  const d = deps([CANONICAL], {[ALIAS]: {canonicalPlaceId: CANONICAL}});
  assert.equal(await resolveCanonicalPlaceIdWith(ALIAS, d), CANONICAL);
});

// B — THE BLOCKER: no active publication (no head at all) but the alias mapping
// still resolves, so unfollow can reach the canonical follow document.
test("B. alias still resolves to canonical when the restaurant has no publication head", async () => {
  const d = deps([], {[ALIAS]: {canonicalPlaceId: CANONICAL}}); // head deliberately absent
  assert.equal(await resolveCanonicalPlaceIdWith(ALIAS, d), CANONICAL);
});

test("B2. multi-hop alias chain resolves without any publication head", async () => {
  const d = deps([], {
    "provider:OLD": {canonicalPlaceId: "mid-1"},
    "mid-1": {canonicalPlaceId: CANONICAL},
  });
  assert.equal(await resolveCanonicalPlaceIdWith("provider:OLD", d), CANONICAL);
});

// C — direct canonical id works, with or without a publication head.
test("C. direct canonical id resolves (head present, and head absent)", async () => {
  assert.equal(await resolveCanonicalPlaceIdWith(CANONICAL, deps([CANONICAL], {})), CANONICAL);
  // unpublished + no alias mapping → it is still its own canonical identity
  assert.equal(await resolveCanonicalPlaceIdWith(CANONICAL, deps([], {})), CANONICAL);
});

// D — alias and direct canonical target the SAME follow document id.
test("D. alias and canonical unfollow target the same follow document id", async () => {
  const d = deps([], {[ALIAS]: {canonicalPlaceId: CANONICAL}});
  const viaAlias = await resolveCanonicalPlaceIdWith(ALIAS, d);
  const viaCanonical = await resolveCanonicalPlaceIdWith(CANONICAL, d);
  assert.equal(viaAlias, viaCanonical);
  assert.equal(restaurantFollowDocId(UID, viaAlias!), restaurantFollowDocId(UID, viaCanonical!));
  // and it is NOT the alias-scoped id
  assert.notEqual(restaurantFollowDocId(UID, viaAlias!), restaurantFollowDocId(UID, ALIAS));
});

// E — blocked / cyclic / invalid resolution fails closed (null).
test("E. blocked, cyclic and invalid alias chains fail closed", async () => {
  assert.equal(await resolveCanonicalPlaceIdWith(ALIAS, deps([], {[ALIAS]: {status: "blocked", canonicalPlaceId: CANONICAL}})), null);
  // direct cycle
  assert.equal(await resolveCanonicalPlaceIdWith("a", deps([], {a: {canonicalPlaceId: "b"}, b: {canonicalPlaceId: "a"}})), null);
  // self cycle
  assert.equal(await resolveCanonicalPlaceIdWith("a", deps([], {a: {canonicalPlaceId: "a"}})), null);
  // alias with missing target
  assert.equal(await resolveCanonicalPlaceIdWith(ALIAS, deps([], {[ALIAS]: {}})), null);
  // empty / oversized input
  assert.equal(await resolveCanonicalPlaceIdWith("   ", deps([], {})), null);
  assert.equal(await resolveCanonicalPlaceIdWith("x".repeat(MAX_PLACE_ID_LENGTH + 1), deps([], {})), null);
});

test("E2. hop budget is bounded (long chains do not loop forever)", async () => {
  const aliases: Record<string, CanonicalAliasRecord> = {};
  for (let i = 0; i < 50; i++) aliases[`h${i}`] = {canonicalPlaceId: `h${i + 1}`};
  const result = await resolveCanonicalPlaceIdWith("h0", deps([], aliases), 8);
  assert.equal(result, "h8"); // stops after the bounded hops, never hangs
});

// ── Callable wiring: unfollow no longer falls back to the caller's alias ──
const followSrc = readFileSync(pathResolve(process.cwd(), "src/callable/restaurantFollowControl.ts"), "utf8");
const serviceSrc = readFileSync(pathResolve(process.cwd(), "src/services/restaurantProfileV2ReadService.ts"), "utf8");

test("unfollow resolves through the server canonical resolver, with no alias fallback", () => {
  assert.ok(followSrc.includes("await resolveCanonicalRestaurantPlaceId(canonicalPlaceId)"));
  // the previous publication-dependent fallback must be gone
  assert.equal(followSrc.includes("profile?.canonicalPlaceId ?? canonicalPlaceId"), false);
  assert.equal(/followRef\(uid,\s*canonicalPlaceId\)/.test(followSrc), false);
  assert.ok(followSrc.includes("followRef(uid, resolvedId)"));
  assert.ok(followSrc.includes("aggregateRef(resolvedId)"));
});

// E (callable) — unresolvable input performs a safe idempotent no-op BEFORE any
// document reference is built, so no alias-scoped aggregate can be created.
test("E3. unfollow no-ops before touching any document when resolution fails", () => {
  const guard = followSrc.indexOf("if (!resolvedId) {");
  const firstRef = followSrc.indexOf("const fRef = followRef(uid, resolvedId)");
  assert.ok(guard > 0, "must guard on failed resolution");
  assert.ok(firstRef > guard, "the no-op must return before any ref/transaction");
  assert.ok(followSrc.includes('return {status: "OK", following: false, changed: false};'));
});

// F — follow still requires a currently published restaurant.
test("F. follow still requires a published Restaurant Profile V2", () => {
  assert.ok(followSrc.includes("readPublishedRestaurantProfileV2(canonicalPlaceId)"));
  assert.ok(followSrc.includes('throw new HttpsError("not-found", "restaurant_not_published")'));
  assert.ok(followSrc.includes("followRef(uid, profile.canonicalPlaceId)"));
});

test("public Restaurant Profile V2 still requires an ACTIVE publication", () => {
  assert.ok(serviceSrc.includes("export async function resolveCanonicalRestaurantPlaceId"));
  assert.ok(serviceSrc.includes("if (!head.exists) return null;"));
  assert.ok(serviceSrc.includes("if (!activePublicationId) return null;"));
  assert.ok(serviceSrc.includes("if (!publication.exists) return null;"));
  // the resolver is server-only: not exported through any callable/client surface
  const indexSrc = readFileSync(pathResolve(process.cwd(), "src/index.ts"), "utf8");
  assert.equal(indexSrc.includes("resolveCanonicalRestaurantPlaceId"), false);
});

// NOTE: follow doc-id legality + the worst-case UTF-8 byte-length proof and the
// round-trip decode tests live with the follow domain (restaurantFollow.test.ts).
// The canonical place-id contract used by that proof is asserted here.
test("the canonical place-id contract used by the doc-id bound is ASCII-bounded", () => {
  const worstPlace = ":".repeat(MAX_PLACE_ID_LENGTH);
  assert.equal(normalizeCanonicalPlaceId(worstPlace), worstPlace, "must be a VALID canonical id");
  assert.equal(Buffer.byteLength(worstPlace, "utf8"), MAX_PLACE_ID_LENGTH, "canonical ids are ASCII → 1 byte/char");
  assert.equal(normalizeCanonicalPlaceId("😀"), null, "non-ASCII canonical ids are rejected by contract");
});
