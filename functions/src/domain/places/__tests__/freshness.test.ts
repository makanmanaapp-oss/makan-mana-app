import test from "node:test";
import assert from "node:assert/strict";

import { calculateFreshnessState } from "../index";
import { DAY, T } from "./fixtures";

// 18. Freshness jadi expired selepas expiresAt.
test("freshness state becomes expired after expiresAt", () => {
  const state = calculateFreshnessState(
    T + 8 * DAY, // now
    T, // fetchedAt
    T + 3 * DAY, // staleAfter
    T + 7 * DAY, // expiresAt
  );
  assert.equal(state, "expired");
});

// 19. Freshness = unknown bila timestamp tiada.
test("freshness state is unknown when timestamps are absent", () => {
  assert.equal(
    calculateFreshnessState(T, undefined, undefined, undefined),
    "unknown",
  );
  // fetchedAt hadir tetapi tiada staleAfter/expiresAt -> unknown.
  assert.equal(
    calculateFreshnessState(T, T, undefined, undefined),
    "unknown",
  );
});

// Tambahan: fresh sebelum staleAfter; aging/stale dalam tetingkap.
test("fresh before staleAfter, aging then stale within window", () => {
  assert.equal(
    calculateFreshnessState(T + 1 * DAY, T, T + 3 * DAY, T + 7 * DAY),
    "fresh",
  );
  // Selepas staleAfter, sebelum titik tengah (5 hari) -> aging.
  assert.equal(
    calculateFreshnessState(T + 4 * DAY, T, T + 3 * DAY, T + 7 * DAY),
    "aging",
  );
  // Selepas titik tengah, sebelum expiry -> stale.
  assert.equal(
    calculateFreshnessState(T + 6 * DAY, T, T + 3 * DAY, T + 7 * DAY),
    "stale",
  );
});
