/**
 * Master pre-launch fix — peringkat re-rank KEUTAMAAN MOOD (tulen).
 * Membuktikan mood mengangkat calon padanan-kuat ke hadapan (isyarat penyusun
 * jelas) sambil kekalkan relevans asas sebagai tiebreak, dan kekal jujur (susunan
 * tidak berubah) bila tiada calon padanan-mood.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMoodPriority, moodPriorityTier } from "../sessionEngine";
import { PlaceCandidate } from "../../../types/place";

function pc(placeId: string, matchScore: number): PlaceCandidate {
  return {
    placeId, name: placeId, cuisine: "restaurant", emoji: "🍽️",
    rating: 4, userRatingCount: 100, priceLevel: 1, priceEstimate: "RM10",
    distanceKm: 1, matchScore, isOpen: true, isSample: false, source: "google_places",
    matchReasonKeys: [], negativeSignals: [], lat: 0, lng: 0, address: "", photoUrl: "",
    openingPeriods: [],
  } as unknown as PlaceCandidate;
}

test("moodPriorityTier bands", () => {
  assert.equal(moodPriorityTier(1.0), 3);
  assert.equal(moodPriorityTier(0.85), 3);
  assert.equal(moodPriorityTier(0.6), 2);
  assert.equal(moodPriorityTier(0.4), 1);
  assert.equal(moodPriorityTier(0.3), 0);
});

test("strong mood match is lifted above higher-base but weak-mood candidate", () => {
  // Base order A,B,C (by relevance). C has strong mood fit → should lead.
  const ranked = [pc("A", 90), pc("B", 88), pc("C", 70)];
  const fit: Record<string, number> = { A: 0.3, B: 0.3, C: 1.0 };
  const out = applyMoodPriority(ranked, (id) => fit[id] ?? 0.5);
  assert.equal(out[0].placeId, "C", "strong mood match leads");
  assert.deepEqual(out.map((p) => p.placeId), ["C", "A", "B"], "within-tier keeps base order");
});

test("no mood match (all equal tier) → order UNCHANGED (honest insufficient evidence)", () => {
  const ranked = [pc("A", 90), pc("B", 88), pc("C", 70)];
  const fit: Record<string, number> = { A: 0.3, B: 0.3, C: 0.3 };
  const out = applyMoodPriority(ranked, (id) => fit[id] ?? 0.5);
  assert.deepEqual(out.map((p) => p.placeId), ["A", "B", "C"], "order preserved");
});

test("within same tier, relevance order preserved (stable)", () => {
  const ranked = [pc("A", 90), pc("B", 88), pc("C", 86)];
  const fit: Record<string, number> = { A: 1.0, B: 1.0, C: 1.0 };
  const out = applyMoodPriority(ranked, (id) => fit[id] ?? 0.5);
  assert.deepEqual(out.map((p) => p.placeId), ["A", "B", "C"]);
});

test("mixed tiers ordered tier-desc then base-order", () => {
  const ranked = [pc("A", 90), pc("B", 88), pc("C", 86), pc("D", 84)];
  const fit: Record<string, number> = { A: 0.3, B: 0.7, C: 1.0, D: 0.5 };
  // tiers: A=0, B=2, C=3, D=1 → C(3), B(2), D(1), A(0)
  const out = applyMoodPriority(ranked, (id) => fit[id] ?? 0.5);
  assert.deepEqual(out.map((p) => p.placeId), ["C", "B", "D", "A"]);
});
