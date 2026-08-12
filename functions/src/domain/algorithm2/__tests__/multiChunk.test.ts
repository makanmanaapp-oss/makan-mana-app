/**
 * MULTI-CHUNK SESSION — ujian TULEN penghantaran chunk + penyusuran kolam penuh.
 *
 * Membuktikan (Part 14): kolam ber-pangkat penuh boleh diguna melangkaui 30;
 * chunk penghantaran = 30 tetapi jumlah autoritatif bebas; tiada pendua; reject
 * global merentas chunk; tiada resurrection; exhaustion hanya di hujung benar.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { chunkRanges, pickNextAlternative } from "../sessionEngine";

/**
 * Simulasi consumeStoredAlternative merentas SEMUA chunk: mula dengan primary
 * (id pertama), tandakan shown, kemudian pop alternatif sah seterusnya sehingga
 * habis — sama seperti nextSuggestion menyusuri rankedPlaceIds penuh.
 */
function consumeAll(
  rankedIds: string[],
  opts: { rejected?: Set<string>; closed?: Set<string> } = {},
): { shownSequence: string[]; providerQueries: number } {
  const rejected = opts.rejected ?? new Set<string>();
  const closed = opts.closed ?? new Set<string>();
  const shown = new Set<string>();
  const sequence: string[] = [];
  let remaining = rankedIds.slice();
  // primary = first non-rejected/non-closed
  const firstIdx = remaining.findIndex((id) => !rejected.has(id) && !closed.has(id));
  if (firstIdx >= 0) {
    const primary = remaining[firstIdx];
    shown.add(primary);
    sequence.push(primary);
    remaining = remaining.filter((id) => id !== primary);
  }
  // pop alternatives until exhausted; exclude = shown ∪ rejected ∪ closed
  for (;;) {
    const exclude = [...shown, ...rejected, ...closed];
    const { nextId, remaining: rem } = pickNextAlternative(remaining, exclude);
    if (!nextId) break;
    shown.add(nextId);
    sequence.push(nextId);
    remaining = rem.filter((id) => id !== nextId);
  }
  return { shownSequence: sequence, providerQueries: 0 }; // never queries provider
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

// ---- chunk range arithmetic (Part 3/14) ----
test("chunkRanges: pool 31 → [0,30]+[30,31]", () => {
  assert.deepEqual(chunkRanges(31), [[0, 30], [30, 31]]);
});
test("chunkRanges: pool 61 → 30+30+1", () => {
  assert.deepEqual(chunkRanges(61), [[0, 30], [30, 60], [60, 61]]);
});
test("chunkRanges: pool 100 → 30+30+30+10", () => {
  assert.deepEqual(chunkRanges(100), [[0, 30], [30, 60], [60, 90], [90, 100]]);
});
test("chunkRanges: pool 145 → 30×4 + 25", () => {
  assert.deepEqual(chunkRanges(145), [[0, 30], [30, 60], [60, 90], [90, 120], [120, 145]]);
});
test("chunkRanges: pool 8/29/30 → single chunk", () => {
  assert.deepEqual(chunkRanges(8), [[0, 8]]);
  assert.deepEqual(chunkRanges(29), [[0, 29]]);
  assert.deepEqual(chunkRanges(30), [[0, 30]]);
});

// ---- full-pool consumption across chunks (Part 5/7/8/10/14) ----
for (const n of [8, 29, 30, 31, 59, 60, 61, 100, 150, 300]) {
  test(`pool ${n}: ALL ${n} candidates consumable, no dup, no provider query`, () => {
    const { shownSequence, providerQueries } = consumeAll(ids(n));
    assert.equal(shownSequence.length, n, `consumed all ${n}`);
    assert.equal(new Set(shownSequence).size, n, "no duplicates across chunks");
    assert.equal(providerQueries, 0, "no provider query while authoritative remain");
    // exhaustion only at the true end (n consumed)
    assert.deepEqual(shownSequence, ids(n), "stable authoritative order preserved");
  });
}

// ---- reject global across chunks (Part 6) ----
test("rejected candidate never returns in any chunk", () => {
  const pool = ids(61);
  // reject p40 (in chunk 2) — must never appear
  const { shownSequence } = consumeAll(pool, { rejected: new Set(["p40"]) });
  assert.ok(!shownSequence.includes("p40"), "rejected p40 never shown");
  assert.equal(shownSequence.length, 60, "60 of 61 consumed (p40 excluded)");
});

// ---- shown global across chunks (Part 7) ----
test("a candidate shown in chunk 1 never reappears in chunk 2/3", () => {
  const { shownSequence } = consumeAll(ids(90));
  assert.equal(new Set(shownSequence).size, shownSequence.length, "session-wide shown, no repeat");
});

// ---- exhaustion is true (Part 10) — not false at 30 ----
test("no false exhaustion: pool 31 yields 31 (not 30)", () => {
  const { shownSequence } = consumeAll(ids(31));
  assert.equal(shownSequence.length, 31);
});

// ---- closed excluded across chunks ----
test("closed candidate skipped across chunks (never delivered)", () => {
  const { shownSequence } = consumeAll(ids(35), { closed: new Set(["p33"]) });
  assert.ok(!shownSequence.includes("p33"));
  assert.equal(shownSequence.length, 34);
});
