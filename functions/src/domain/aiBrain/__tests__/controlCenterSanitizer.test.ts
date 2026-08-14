import assert from "node:assert/strict";
import {test} from "node:test";

import {aiBrainUserRef, sanitizeAiBrainProfile} from "../controlCenterSanitizer";

const UID = "firebase-user-1234567890";

test("Control Center AI Brain ref is stable and does not expose UID", () => {
  const first = aiBrainUserRef(UID);
  const second = aiBrainUserRef(UID);
  assert.equal(first, second);
  assert.ok(first.startsWith("fb_"));
  assert.ok(!first.includes(UID));
});

test("Control Center AI Brain sanitizer allow-lists operational fields only", () => {
  const row = sanitizeAiBrainProfile(UID, {
    brainVersion: 5,
    schemaVersion: 2,
    privacyVersion: 1,
    insufficientData: false,
    confidence: {overall: 0.42, cuisine: 0.5},
    sourceEventCount: 15,
    sourceMealCount: 3,
    preferredDistanceKm: 4.5,
    preferredPriceLevel: 2,
    commonRejectReasons: {too_far: 3, too_expensive: 1},
    learnedTopCuisines: {malay: 0.8},
    learnedAvoidedCuisines: {fast_food: 0.2},
    preferredTimeSlots: {lunch: 4},
    eventWindowDays: 30,
    mealWindowDays: 60,
    lastCalculatedAtMs: 1_700_000_000_000,
    resetBoundaryMs: 1_699_000_000_000,
    recentAcceptedPlaceIds: ["secret-place"],
    recentRejectedPlaceIds: ["secret-reject"],
    recentMoodTags: ["moodLapar"],
    allergies: ["nuts"],
    gps: {lat: 3.1, lng: 101.6},
    receipt: "secret",
    tokens: "secret-token",
  });

  assert.equal(row.brain_version, 5);
  assert.equal(row.confidence_overall, 0.42);
  assert.deepEqual(row.common_reject_reasons, {too_far: 3, too_expensive: 1});
  assert.deepEqual(row.top_cuisines, {malay: 0.8});
  assert.equal(row.last_calculated_at, "2023-11-14T22:13:20.000Z");

  const keys = Object.keys(row);
  for (const forbidden of [
    "userId", "recentAcceptedPlaceIds", "recentRejectedPlaceIds", "recentMoodTags",
    "allergies", "gps", "receipt", "tokens",
  ]) {
    assert.ok(!keys.includes(forbidden), `forbidden field leaked: ${forbidden}`);
  }
});

test("Control Center AI Brain sanitizer clamps malformed numeric values", () => {
  const row = sanitizeAiBrainProfile(UID, {
    brainVersion: -3,
    confidence: {overall: 9},
    preferredPriceLevel: 99,
    sourceEventCount: -20,
    sourceMealCount: Number.NaN,
  });
  assert.equal(row.brain_version, 0);
  assert.equal(row.confidence_overall, 1);
  assert.equal(row.preferred_price_level, 4);
  assert.equal(row.source_event_count, 0);
  assert.equal(row.source_meal_count, 0);
});

test("Control Center AI Brain reset profile uses reset timestamp when last calculation is zero", () => {
  const row = sanitizeAiBrainProfile(UID, {
    brainVersion: 6,
    insufficientData: true,
    lastCalculatedAtMs: 0,
    resetAtMs: 1_710_000_000_000,
    resetBoundaryMs: 1_710_000_000_000,
  });
  assert.equal(row.last_calculated_at, undefined);
  assert.equal(row.source_updated_at, "2024-03-09T16:00:00.000Z");
  assert.equal(row.reset_boundary_at, "2024-03-09T16:00:00.000Z");
});
