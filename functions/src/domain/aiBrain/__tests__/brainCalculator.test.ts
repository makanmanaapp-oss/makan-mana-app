/**
 * Algorithm 2 / Phase 2.4 — ujian AI Brain calculator (tulen).
 * Penapis event sebenar · pengiraan berpadu · reput · keyakinan jujur ·
 * pemisahan profil/pembelajaran · brainVersion · privasi · sempadan reset.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeBrain, realEventExclusionReason, isRealEvent, confidenceFrom,
  decayWeight, BrainEvent, BrainMeal, EVENT_HALFLIFE_DAYS,
} from "../brainCalculator";

const NOW = 1_700_000_000_000;
const DAY = 86400_000;

function evt(eventType: string, o: Partial<BrainEvent> & { ageDays?: number } = {}): BrainEvent {
  return {
    eventType,
    placeId: o.placeId ?? "p1",
    timeSlot: o.timeSlot ?? "lunch",
    mood: o.mood ?? "moodLapar",
    timestampMs: NOW - (o.ageDays ?? 1) * DAY,
    metadata: o.metadata ?? null,
    isSample: o.isSample,
    sourceMode: o.sourceMode ?? null,
    resultSource: o.resultSource ?? null,
  };
}
function meal(o: Partial<BrainMeal> & { ageDays?: number } = {}): BrainMeal {
  return {
    cuisine: o.cuisine ?? "malay",
    cuisineTags: o.cuisineTags ?? null,
    mealTimeMs: NOW - (o.ageDays ?? 1) * DAY,
    source: o.source ?? "suggestion",
    satisfactionRating: o.satisfactionRating ?? null,
    wouldRepeat: o.wouldRepeat ?? null,
    priceLevel: o.priceLevel ?? 2,
    placeId: o.placeId ?? "p1",
    tags: o.tags ?? null,
    healthTags: o.healthTags ?? null,
  };
}
const base = (over: Partial<Parameters<typeof computeBrain>[0]> = {}) => computeBrain({
  uid: "u", events: [], meals: [], profile: {}, oldBrain: {}, now: NOW, ...over,
});

// ---------------- REAL EVENT FILTER (Part D / O11-16) ----------------
test("B11: mock_fallback excluded", () => assert.equal(realEventExclusionReason(evt("accept", { resultSource: "mock_fallback" })), "mock_fallback"));
test("B12: demo_preview excluded", () => assert.equal(realEventExclusionReason(evt("accept", { resultSource: "demo_preview" })), "demo_preview"));
test("B13a: isSample excluded", () => assert.equal(realEventExclusionReason(evt("accept", { isSample: true })), "isSample"));
test("B13b: offline_fallback excluded", () => assert.equal(realEventExclusionReason(evt("accept", { resultSource: "offline_fallback" })), "offline_fallback"));
test("B15: malformed excluded", () => assert.equal(realEventExclusionReason({ ...evt("accept"), eventType: "" as string }), "malformed"));
test("B16: real owner action included", () => assert.equal(isRealEvent(evt("accept")), true));

test("B-filter: excluded events counted, not learned", () => {
  const r = base({ events: [evt("accept", { resultSource: "mock_fallback" }), evt("accept", { resultSource: "demo_preview" }), evt("accept")], meals: [meal()] });
  assert.equal(r.diagnostics.excludedEvents, 2);
  assert.ok(r.diagnostics.excludedByReason.mock_fallback === 1);
});

// ---------------- CALCULATION (Part F / O17-30) ----------------
test("B17: zero signals -> insufficientData + brainVersion increments", () => {
  const r = base({ oldBrain: { brainVersion: 4 } });
  assert.equal(r.insufficientData, true);
  assert.equal(r.diagnostics.newBrainVersion, 5);
  assert.equal((r.brainDoc.confidence as { overall: number }).overall, 0);
});
test("B18: one accept remains low confidence", () => {
  const r = base({ events: [evt("accept")] });
  assert.equal(r.insufficientData, false);
  assert.ok(r.diagnostics.confidenceAfter < 0.2);
});
test("B19: repeated real signals increase confidence", () => {
  const few = base({ events: [evt("accept")], meals: [meal()] });
  const many = base({ events: Array.from({ length: 12 }, (_, i) => evt("accept", { placeId: `p${i}` })), meals: Array.from({ length: 12 }, (_, i) => meal({ placeId: `p${i}` })) });
  assert.ok(many.diagnostics.confidenceAfter > few.diagnostics.confidenceAfter);
});
test("B22: reject too_far reduces distance only (budget unchanged)", () => {
  const noRej = base({ events: [evt("accept", { metadata: { distanceKm: 5 } })], meals: [meal({ priceLevel: 2 })] });
  const farRej = base({ events: [evt("accept", { metadata: { distanceKm: 5 } }), evt("reject", { metadata: { reason: "too_far" } }), evt("reject", { placeId: "p2", metadata: { reason: "too_far" } })], meals: [meal({ priceLevel: 2 })] });
  assert.ok((farRej.brainDoc.preferredDistanceKm as number) < (noRej.brainDoc.preferredDistanceKm as number));
  assert.equal(farRej.brainDoc.preferredPriceLevel, noRej.brainDoc.preferredPriceLevel);
});
test("B23: reject too_expensive reduces budget only", () => {
  const noRej = base({ meals: [meal({ priceLevel: 3 }), meal({ placeId: "p2", priceLevel: 3 })] });
  const expRej = base({ meals: [meal({ priceLevel: 3 }), meal({ placeId: "p2", priceLevel: 3 })], events: [evt("reject", { metadata: { reason: "too_expensive" } }), evt("reject", { placeId: "p3", metadata: { reason: "too_expensive" } })] });
  assert.ok((expRej.brainDoc.preferredPriceLevel as number) < (noRej.brainDoc.preferredPriceLevel as number));
});
test("B24: skip counts as skip, not reject", () => {
  const r = base({ events: [evt("suggestion_skipped"), evt("accept", { placeId: "p2" })] });
  assert.ok((r.brainDoc.skipRate as number) > 0);
  assert.equal(r.brainDoc.rejectRate, 0);
});
test("B25: wouldRepeat strengthens cuisine preference", () => {
  const plain = base({ meals: [meal({ cuisine: "thai" })] });
  const repeat = base({ meals: [meal({ cuisine: "thai", wouldRepeat: true, satisfactionRating: 5 })] });
  const pTop = (plain.brainDoc.learnedTopCuisines as Record<string, number>).thai ?? 0;
  const rTop = (repeat.brainDoc.learnedTopCuisines as Record<string, number>).thai ?? 0;
  assert.ok(rTop >= pTop);
});
test("B26: wouldNotRepeat creates bounded avoidance", () => {
  const r = base({ meals: [meal({ cuisine: "sushi", wouldRepeat: false }), meal({ cuisine: "malay", placeId: "p2" })] });
  assert.ok(Object.keys(r.brainDoc.learnedAvoidedCuisines as Record<string, number>).includes("sushi"));
});
test("B27: decay reduces old signal weight", () => {
  assert.ok(decayWeight(28 * DAY, EVENT_HALFLIFE_DAYS) < decayWeight(1 * DAY, EVENT_HALFLIFE_DAYS));
  assert.ok(Math.abs(decayWeight(EVENT_HALFLIFE_DAYS * DAY, EVENT_HALFLIFE_DAYS) - 0.5) < 1e-9);
});
test("B28: recent evidence not dominated by old (cuisine confidence)", () => {
  const recent = base({ meals: Array.from({ length: 6 }, (_, i) => meal({ cuisine: "korean", placeId: `r${i}`, ageDays: 2 })) });
  const old = base({ meals: Array.from({ length: 6 }, (_, i) => meal({ cuisine: "korean", placeId: `o${i}`, ageDays: 55 })) });
  assert.ok((recent.brainDoc.confidence as { cuisine: number }).cuisine > (old.brainDoc.confidence as { cuisine: number }).cuisine);
});
test("B29: brain fields remain bounded", () => {
  const r = base({ events: Array.from({ length: 20 }, (_, i) => evt(i % 2 ? "accept" : "reject", { placeId: `p${i}`, metadata: { distanceKm: 3, reason: "too_far" } })), meals: Array.from({ length: 10 }, (_, i) => meal({ placeId: `m${i}`, priceLevel: 2 })) });
  const b = r.brainDoc;
  for (const k of ["repeatTolerance", "explorationLevel", "healthyPreference", "heavyFoodFrequency", "acceptRate", "rejectRate", "skipRate"]) {
    const v = b[k] as number; assert.ok(v >= 0 && v <= 1, `${k}=${v}`);
  }
  assert.ok((b.preferredDistanceKm as number) >= 1 && (b.preferredDistanceKm as number) <= 15);
  assert.ok((b.preferredPriceLevel as number) >= 0 && (b.preferredPriceLevel as number) <= 4);
});
test("B30: no sensitive VALUES written (allergy notes/email/gps)", () => {
  const b = base({ events: [evt("accept")], meals: [meal()], profile: { allergies: ["kacang"], email: "x@y.z", currentLat: 3.22, currentLng: 101.4 } }).brainDoc;
  const json = JSON.stringify(b);
  // Nilai sensitif SEBENAR tidak boleh bocor (nama medan "allergies" dalam
  // senarai excludedSensitiveFields adalah metadata, bukan data).
  for (const bad of ["kacang", "x@y.z", "3.22", "101.4"]) {
    assert.ok(!json.includes(bad), `leaked ${bad}`);
  }
  // Medan alahan/halal sendiri tidak wujud dalam brain.
  assert.equal((b as Record<string, unknown>).allergies, undefined);
});

// ---------------- PROFILE VS LEARNED (Part G / O31-35) ----------------
test("B31: declared allergy never appears in brain", () => {
  const r = base({ events: [evt("accept")], meals: [meal()], profile: { allergies: ["seafood"], halalPreference: true } });
  assert.equal((r.brainDoc as Record<string, unknown>).allergies, undefined);
  assert.equal((r.brainDoc as Record<string, unknown>).halalPreference, undefined);
});
test("B33: learned favourite is separate field from profile favourite", () => {
  const r = base({ meals: [meal({ cuisine: "japanese" })], profile: { favoriteCuisines: ["western"] } });
  assert.ok("learnedTopCuisines" in r.brainDoc);
});

// ---------------- VERSION (Part H / O39) ----------------
test("B39: brainVersion increments exactly once per compute", () => {
  const a = base({ events: [evt("accept")], oldBrain: { brainVersion: 7 } });
  const b = base({ events: [evt("accept")], oldBrain: { brainVersion: 7 } });
  assert.equal(a.diagnostics.newBrainVersion, 8);
  assert.equal(b.diagnostics.newBrainVersion, 8); // deterministik, satu kenaikan
});

// ---------------- CONFIDENCE + RESET BOUNDARY ----------------
test("B-conf: confidence honest for sparse data", () => {
  assert.equal(confidenceFrom(0), 0);
  assert.ok(confidenceFrom(1) < 0.1);
  assert.ok(confidenceFrom(50) > 0.85);
});
test("B45: reset boundary excludes pre-reset signals", () => {
  const events = [evt("accept", { ageDays: 10 }), evt("accept", { placeId: "p2", ageDays: 2 })];
  const withBoundary = base({ events, resetBoundaryMs: NOW - 5 * DAY }); // only 2-day event counts
  const noBoundary = base({ events });
  assert.ok(withBoundary.diagnostics.totalRealSignals < noBoundary.diagnostics.totalRealSignals);
  assert.equal(withBoundary.diagnostics.totalRealSignals, 1);
});
