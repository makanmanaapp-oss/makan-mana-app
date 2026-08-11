/**
 * Master Mood/Diet/Fit fix — safetyKey MESTI menyebabkan contextHash BAHARU bila
 * allergy/halal/diet/fitGoal/sport/training berubah (Part L). Ini menjamin sesi
 * di-rank semula dengan penapis keselamatan terkini (tiada calon lama bercanggah
 * disajikan via guna-semula/consume). computeSafetyKey pula stabil & tidak dedah
 * nilai mentah (hash sahaja).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { computeContextHash, computeSafetyKey } from "../sessionEngine";

const baseCtx = {
  uid: "u1", lat: 3.22, lng: 101.47, radiusMeters: 3000,
  mood: "moodLapar", timeSegment: "dinner", plan: "pro", brainVersion: 5,
};

test("safetyKey: stabil untuk input sama; isih allergy (order-independent)", () => {
  const a = computeSafetyKey({ allergies: ["Seafood", "peanut"], halalPreference: true });
  const b = computeSafetyKey({ allergies: ["peanut", "SEAFOOD"], halalPreference: true });
  assert.equal(a, b, "allergy order/case tidak penting");
  assert.notEqual(a, "0");
});

test("safetyKey: allergy berbeza → key berbeza", () => {
  const none = computeSafetyKey({});
  const peanut = computeSafetyKey({ allergies: ["peanut"] });
  assert.notEqual(none, peanut);
});

test("safetyKey: halal berbeza → key berbeza", () => {
  assert.notEqual(computeSafetyKey({ halalPreference: false }), computeSafetyKey({ halalPreference: true }));
});

test("safetyKey: diet berbeza → key berbeza (dietTypes atau dietType)", () => {
  assert.notEqual(computeSafetyKey({}), computeSafetyKey({ dietTypes: ["vegetarian"] }));
  assert.notEqual(computeSafetyKey({}), computeSafetyKey({ dietType: "vegan" }));
  assert.equal(computeSafetyKey({ dietType: "none" }), computeSafetyKey({}), "'none' = tiada diet");
});

test("safetyKey: fitGoal / sportMood / trainingDay berbeza → key berbeza", () => {
  assert.notEqual(computeSafetyKey({}), computeSafetyKey({ fitGoal: "lose_weight" }));
  assert.notEqual(computeSafetyKey({}), computeSafetyKey({ sportMood: "post_workout" }));
  assert.notEqual(computeSafetyKey({}), computeSafetyKey({ trainingDay: true }));
});

test("contextHash: safetyKey berbeza → contextHash BAHARU (sesi baharu)", () => {
  const noAllergy = computeContextHash({ ...baseCtx, safetyKey: computeSafetyKey({}) });
  const withAllergy = computeContextHash({ ...baseCtx, safetyKey: computeSafetyKey({ allergies: ["peanut"] }) });
  assert.notEqual(noAllergy, withAllergy, "tambah alahan MESTI batalkan sesi");
});

test("contextHash: fitGoal berubah → contextHash baharu", () => {
  const maintain = computeContextHash({ ...baseCtx, safetyKey: computeSafetyKey({ fitGoal: "maintain" }) });
  const loss = computeContextHash({ ...baseCtx, safetyKey: computeSafetyKey({ fitGoal: "lose_weight" }) });
  assert.notEqual(maintain, loss);
});

test("contextHash: input sama (termasuk safetyKey) → hash sama (cache stabil)", () => {
  const sk = computeSafetyKey({ allergies: ["peanut"], halalPreference: true, fitGoal: "muscle_gain" });
  assert.equal(
    computeContextHash({ ...baseCtx, safetyKey: sk }),
    computeContextHash({ ...baseCtx, safetyKey: sk }),
  );
});

test("contextHash: mood masih membezakan (regression)", () => {
  const sk = computeSafetyKey({});
  assert.notEqual(
    computeContextHash({ ...baseCtx, mood: "moodPedas", safetyKey: sk }),
    computeContextHash({ ...baseCtx, mood: "moodHealthy", safetyKey: sk }),
  );
});

test("contextHash: tiada safetyKey (undefined) tetap deterministik (backward-safe)", () => {
  assert.equal(
    computeContextHash({ ...baseCtx }),
    computeContextHash({ ...baseCtx }),
  );
});
