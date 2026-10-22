import assert from "node:assert/strict";
import {test} from "node:test";
import {place} from "./fixtures";
import {RECOMMENDATION_COOLDOWN_MS as TTL, blockedUntil, enforceRecommendationPolicy as policy, mergeOutletMemory, type OutletMemory} from "../recommendationPolicy";
const NOW = Date.parse("2026-10-22T15:59:59Z");
const a = place({placeId: "a", matchScore: 99});
const b = place({placeId: "b", matchScore: 40});
const ids = (rows: ReturnType<typeof policy>) => rows.map((p) => p.placeId);

test("cooldown is 26 rolling hours, not a MYT day", () => assert.equal(TTL, 93600000));
test("a shown outlet is still excluded one millisecond before 26 hours", () => assert.deepEqual(policy([a], () => ({lastShownAt: NOW}), NOW + TTL - 1), []));
test("an outlet becomes eligible exactly at 26 hours", () => assert.deepEqual(ids(policy([a], () => ({lastShownAt: NOW}), NOW + TTL)), ["a"]));
test("Malaysia midnight does not clear shown memory", () => assert.deepEqual(policy([a], () => ({lastShownAt: NOW}), NOW + 2000), []));
test("even an expired legacy 6-hour mood reject has a 26-hour floor", () => assert.deepEqual(policy([a], () => ({rejectedAt: NOW, expiresAt: NOW + 6 * 3600000}), NOW + 25 * 3600000), []));
test("a later reject starts its own minimum 26 hours", () => assert.equal(blockedUntil({lastShownAt: NOW, lastRejectedAt: NOW + 600000}), NOW + 600000 + TTL));
test("longer suppression is not shortened", () => assert.equal(blockedUntil({lastShownAt: NOW, suppressedUntil: NOW + 30 * 86400000}), NOW + 30 * 86400000));
test("expired reject remains behind a lower-scoring un-rejected outlet", () => assert.deepEqual(ids(policy([a, b], (p) => p.placeId === "a" ? {lastRejectedAt: NOW - TTL, rejectCount: 1} : {}, NOW)), ["b", "a"]));
test("all rejected candidates can be used only after cooldown, oldest first", () => assert.deepEqual(ids(policy([a, b], (p) => ({lastRejectedAt: NOW - TTL - (p.placeId === "b" ? 2000 : 1000), rejectCount: 1}), NOW)), ["b", "a"]));
test("permanent avoid remains blocked even after a ten-year sentinel expires", () => assert.deepEqual(policy([a], () => ({permanentAvoid: true, expiresAt: NOW - 1}), NOW), []));
test("legacy permanent reason is preserved during alias merge", () => assert.equal(mergeOutletMemory([{reason: "do_not_suggest_again", expiresAt: 1}]).permanentAvoid, true));
test("merging identities keeps the latest shown and strongest suppression", () => assert.deepEqual(mergeOutletMemory([{lastShownAt: NOW, rejectCount: 1}, {lastShownAt: NOW - 1, suppressedUntil: NOW + TTL, rejectCount: 3}]), {lastShownAt: NOW, rejectCount: 3, permanentAvoid: false, suppressedUntil: NOW + TTL}));
test("canonical and provider representations are not emitted twice", () => assert.equal(policy([{...a, canonicalPlaceId: "PLC-a"}, {...b, canonicalPlaceId: "PLC-a"}], () => ({}), NOW).length, 1));
test("different branches stay distinct despite matching names", () => assert.equal(policy([{...a, name: "Same brand"}, {...b, name: "Same brand"}], () => ({}), NOW).length, 2));
test("closed outlets cannot fill a low-supply result", () => assert.deepEqual(policy([{...a, isOpen: false}], () => ({}), NOW), []));
test("twenty eligible outlets produce twenty unique deliveries, then empty", () => {
  const pool = Array.from({length: 20}, (_, i) => place({placeId: `outlet-${i}`}));
  const memory = new Map<string, OutletMemory>();
  const shown = [];
  for (let n = 0; n < 21; n++) {
    const next = policy(pool, (p) => memory.get(p.placeId) ?? {}, NOW)[0];
    if (next) { shown.push(next.placeId); memory.set(next.placeId, {lastShownAt: NOW}); }
    else assert.equal(n, 20);
  }
  assert.equal(new Set(shown).size, 20);
});
test("prefetched but unissued alternatives remain eligible", () => assert.deepEqual(ids(policy([a, b], (p) => p.placeId === "a" ? {lastShownAt: NOW} : {}, NOW)), ["b"]));
