/**
 * FINAL RECOMMENDATION REPAIR — ujian TULEN invarian anti-ulang + reject memory.
 *
 * Menutup regresi paling merbahaya (Part 19): reject tidak pernah dibangkitkan
 * semula oleh relaksasi/alias/tutup; TTL ber-sebab + progresif; permanent avoid
 * kekal; closed tidak pernah layak dalam eat-now. Ujian sisi-perkhidmatan (I/O)
 * relaksasi diliputi oleh ujian emulator + QA peranti; di sini kita buktikan
 * PRIMITIF tulen yang laluan relaksasi bergantung padanya.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BASE_TTL_BY_REASON,
  PERMANENT_TTL_MS,
  isPermanentTtl,
  normalizeRejectReason,
  rejectTtlMs,
} from "../rejectPolicy";
import {
  activeRejectMemoryIds,
  buildExcludeIds,
} from "../sessionEngine";
import { applyHardSafety } from "../safetyFilter";
import { RecommendationUserContext } from "../recommendationContext";
import { place } from "./fixtures";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const NOW = 1_700_000_000_000;

function ctx(over: Partial<RecommendationUserContext> = {}): RecommendationUserContext {
  return {
    uid: "u1", plan: "pro", language: "ms", lat: null, lng: null,
    radiusMeters: 3000, selectedMood: null, localHour: 12,
    allergies: [], halalPreference: false, dietType: null, dietTypes: [],
    favouriteCuisines: [], avoidedCuisines: [], cuisinesToTry: [],
    spicyPreference: null, budgetMin: null, budgetMax: null, preferredPriceLevel: null,
    preferredDistanceKm: 5, repeatTolerance: 0.5, explorationLevel: 0.5,
    topAcceptedCuisines: [], recentCuisines: [], recentMealPlaceIds: [],
    commonRejectReasons: [], fitGoal: null, sportMood: null, trainingDay: false,
    calorieTarget: null, proteinTarget: null, recoveryContext: false,
    budgetLeftToday: null, budgetLeftWeek: null, overspendState: "unknown",
    walletDataAvailable: false,
    ...over,
  } as RecommendationUserContext;
}

// ---- Reason-scoped TTL (Part 4) -------------------------------------------
// 1
test("reason base TTLs are explicit and distinct", () => {
  assert.equal(BASE_TTL_BY_REASON.not_mood, 6 * HOUR);
  assert.equal(BASE_TTL_BY_REASON.recently_ate, 3 * DAY);
  assert.equal(BASE_TTL_BY_REASON.too_far, 24 * HOUR);
  assert.equal(BASE_TTL_BY_REASON.too_expensive, 48 * HOUR);
  assert.equal(BASE_TTL_BY_REASON.do_not_suggest_again, PERMANENT_TTL_MS);
});

// 2
test("not_mood single reject is short (6h), not a permanent penalty", () => {
  assert.equal(rejectTtlMs("not_mood", 1), 6 * HOUR);
  assert.equal(isPermanentTtl(rejectTtlMs("not_mood", 1)), false);
});

// 3
test("do_not_suggest_again is permanent regardless of count", () => {
  assert.equal(rejectTtlMs("do_not_suggest_again", 1), PERMANENT_TTL_MS);
  assert.ok(isPermanentTtl(rejectTtlMs("do_not_suggest_again", 1)));
});

// 4
test("repeated rejects escalate suppression progressively", () => {
  // count 2 → >= 24h ; count 3 → >= 30 days
  assert.ok(rejectTtlMs("not_mood", 2) >= 24 * HOUR);
  assert.ok(rejectTtlMs("not_mood", 3) >= 30 * DAY);
  assert.ok(rejectTtlMs("too_far", 3) >= 30 * DAY);
});

// 5
test("recently_ate is stronger than not_mood at a single reject", () => {
  assert.ok(rejectTtlMs("recently_ate", 1) > rejectTtlMs("not_mood", 1));
});

// 6
test("normalizeRejectReason maps client variants to canonical reasons", () => {
  assert.equal(normalizeRejectReason("Not In Mood"), "not_mood");
  assert.equal(normalizeRejectReason("just_ate"), "recently_ate");
  assert.equal(normalizeRejectReason("too-far"), "too_far");
  assert.equal(normalizeRejectReason("over_budget"), "too_expensive");
  assert.equal(normalizeRejectReason("never"), "do_not_suggest_again");
  assert.equal(normalizeRejectReason("weird"), "other");
  assert.equal(normalizeRejectReason(null), "other");
});

// ---- Active reject-memory ids (TTL respected) -----------------------------
// 7
test("active reject-memory excludes place + canonical alias while unexpired", () => {
  const ids = activeRejectMemoryIds(
    [{ placeId: "p1", canonicalPlaceId: "c1", rejectedAt: NOW, expiresAt: NOW + DAY }],
    NOW,
  );
  assert.deepEqual(ids, ["c1", "p1"]);
});

// 8
test("expired reject-memory is not returned", () => {
  const ids = activeRejectMemoryIds(
    [{ placeId: "p1", canonicalPlaceId: null, rejectedAt: NOW - 2 * DAY, expiresAt: NOW - DAY }],
    NOW,
  );
  assert.deepEqual(ids, []);
});

// ---- Same-session suppression (Part 19 #1) --------------------------------
// 9
test("same-session rejected id is in the exclude set", () => {
  const excl = buildExcludeIds({ sessionShown: ["a"], sessionRejected: ["r1"], rejectMemoryIds: [] });
  assert.ok(excl.includes("r1"));
  assert.ok(excl.includes("a"));
});

// ---- Hard-safety reject/closed invariants (the relaxation choke point) -----
// 10
test("reject-memory id is filtered by hard safety (never eligible)", () => {
  const cands = [place({ placeId: "r1" }), place({ placeId: "ok" })];
  const res = applyHardSafety(cands, ctx(), { rejectMemoryIds: new Set(["r1"]) });
  assert.deepEqual(res.eligible.map((p) => p.placeId), ["ok"]);
  assert.equal(res.counts.reject_memory, 1);
});

// 11
test("canonical alias in reject-memory filters the equivalent place", () => {
  const cands = [place({ placeId: "prov1", canonicalPlaceId: "canonA" }), place({ placeId: "ok" })];
  const res = applyHardSafety(cands, ctx(), { rejectMemoryIds: new Set(["canonA"]) });
  assert.deepEqual(res.eligible.map((p) => p.placeId), ["ok"]);
});

// 12
test("closed place is filtered in eat-now (excludeClosed default true)", () => {
  const cands = [place({ placeId: "closed", isOpen: false }), place({ placeId: "open" })];
  const res = applyHardSafety(cands, ctx(), {});
  assert.deepEqual(res.eligible.map((p) => p.placeId), ["open"]);
  assert.equal(res.counts.closed, 1);
});

// 13 — RELAXATION INVARIANT: relaxing SHOWN must NOT relax reject-memory/closed.
// We simulate the repaired relaxation: suppressed = (shown+rejected) minus shown,
// but reject-memory + excludeClosed always retained. Rejected/closed stay out.
test("relaxing SHOWN keeps reject-memory AND closed suppressed", () => {
  const cands = [
    place({ placeId: "shown1" }),
    place({ placeId: "rejected1" }),
    place({ placeId: "closedX", isOpen: false }),
    place({ placeId: "fresh" }),
  ];
  const sessionShown = ["shown1"];
  const rejectMemory = new Set(["rejected1"]);
  // Repaired relaxation drops ONLY shown from the suppressed set:
  const mergedExclude = new Set(["shown1"]); // session shown
  const keepSuppressed = new Set([...mergedExclude].filter((id) => !new Set(sessionShown).has(id)));
  const res = applyHardSafety(cands, ctx(), {
    suppressedIds: keepSuppressed, // empty after removing shown
    rejectMemoryIds: rejectMemory, // RETAINED
    excludeClosed: true, // RETAINED
  });
  const ids = res.eligible.map((p) => p.placeId);
  assert.ok(ids.includes("shown1"), "shown becomes eligible again after relax");
  assert.ok(ids.includes("fresh"));
  assert.ok(!ids.includes("rejected1"), "rejected NEVER resurrected");
  assert.ok(!ids.includes("closedX"), "closed NEVER resurrected in eat-now");
});

// 14
test("hard safety still removes allergy conflict above suppression", () => {
  const cands = [place({ placeId: "sea", name: "Tomyam Seafood", cuisine: "seafood" })];
  const res = applyHardSafety(cands, ctx({ allergies: ["seafood"] }), {});
  assert.equal(res.eligible.length, 0);
  assert.equal(res.counts.allergy_conflict, 1);
});

// 15
test("permanent avoid TTL stays permanent even after long time", () => {
  const ttl = rejectTtlMs("do_not_suggest_again", 5);
  assert.ok(NOW + ttl > NOW + 3000 * DAY);
});

// 16
test("other/unknown reason defaults to a safe 24h suppression", () => {
  assert.equal(rejectTtlMs("other", 1), 24 * HOUR);
});
