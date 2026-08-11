/**
 * Algorithm 2 / Phase 2.3C — sumber bukti waktu operasi (backend).
 * hours_unverified dipancarkan HANYA bila openingPeriods tiada; sebab openNow
 * (Supper) HANYA bila ketersediaan disahkan. Tiada perubahan skor/ranking.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { scoreCandidateV2 } from "../scoringModel";
import { ctx, openPlace } from "./scoringFixtures";
import { place } from "./fixtures";

test("C-Hours1: unknown hours emit hours_unverified", () => {
  const p = place({ placeId: "h_unk", cuisine: "malay", openingPeriods: null, isOpen: true, rating: 4.2, userRatingCount: 200, distanceKm: 1.0 });
  const s = scoreCandidateV2(p, ctx());
  assert.ok(s.negativeSignals.includes("hours_unverified"));
});

test("C-Hours2: verified hours do NOT emit hours_unverified", () => {
  const p = openPlace({ placeId: "h_ok", cuisine: "malay", rating: 4.2, userRatingCount: 200, distanceKm: 1.0 });
  const s = scoreCandidateV2(p, ctx());
  assert.ok(!s.negativeSignals.includes("hours_unverified"));
});

test("C-Hours3: unknown hours never produce openNow reason (no false open claim)", () => {
  const unknown = place({ placeId: "sup_unk", cuisine: "mamak", openingPeriods: null, isOpen: true, rating: 4.2, userRatingCount: 200, distanceKm: 1.0 });
  const sUnknown = scoreCandidateV2(unknown, ctx({ selectedMood: "moodSupper" }));
  // Sifat keselamatan: tidak disahkan → TIADA dakwaan openNow + isyarat jujur.
  assert.ok(!sUnknown.reasons.includes("openNow"));
  assert.ok(sUnknown.negativeSignals.includes("hours_unverified"));
});
