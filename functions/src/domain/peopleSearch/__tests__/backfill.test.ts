// HOTFIX 4.6A — normalization + backfill (pure, Parts 10 & 16).
import assert from "node:assert/strict";
import test from "node:test";

import {backfillPage, ProfileRow} from "../peopleSearchBackfill";
import {
  computeLowerUpdate,
  LowerUpdate,
  normalizeLower,
  normalizeUsernameLower,
} from "../normalize";

// ---- normalization determinism (Part 10) ----
test("normalizeLower: case/trim/collapse spaces, unicode-safe", () => {
  assert.equal(normalizeLower("  Ahmad   Makan "), "ahmad makan");
  assert.equal(normalizeLower("AHMAD"), "ahmad");
  assert.equal(normalizeLower("Café Señor"), "café señor");
  assert.equal(normalizeLower(undefined), "");
});
test("normalizeUsernameLower: strips leading @, lowercases, no spaces", () => {
  assert.equal(normalizeUsernameLower("@Ahmad"), "ahmad");
  assert.equal(normalizeUsernameLower("@@ahmad"), "ahmad");
  assert.equal(normalizeUsernameLower("AhMaD"), "ahmad");
});

// ---- computeLowerUpdate (Part 16) ----
test("missing lower fields detected + correct values proposed", () => {
  const u = computeLowerUpdate("Ahmad", "Ahmad Food", {});
  assert.deepEqual(u, {usernameLower: "ahmad", displayNameLower: "ahmad food"});
});
test("already-current profile → null (skip, idempotent)", () => {
  const u = computeLowerUpdate("ahmad", "Ahmad Food", {
    usernameLower: "ahmad",
    displayNameLower: "ahmad food",
  });
  assert.equal(u, null);
});
test("empty username handled safely", () => {
  const u = computeLowerUpdate("", "Ahmad Food", {});
  assert.deepEqual(u, {displayNameLower: "ahmad food"});
});
test("empty displayName handled safely", () => {
  const u = computeLowerUpdate("ahmad", "", {usernameLower: "ahmad"});
  assert.equal(u, null);
});
test("only stale field updated (partial)", () => {
  const u = computeLowerUpdate("ahmad", "Ahmad Makan", {
    usernameLower: "ahmad",
    displayNameLower: "ahmad food", // stale
  });
  assert.deepEqual(u, {displayNameLower: "ahmad makan"});
});

// ---- backfillPage with fake IO ----
function fakeDeps(rows: ProfileRow[]) {
  const writes: Record<string, unknown>[] = [];
  return {
    writes,
    deps: {
      listProfiles: async (size: number, cursor?: string) => {
        const start = cursor ? rows.findIndex((r) => r.id === cursor) + 1 : 0;
        const page = rows.slice(start, start + size);
        const next = start + size < rows.length ? page[page.length - 1].id : null;
        return {docs: page, nextCursor: next};
      },
      writeLower: async (id: string, upd: LowerUpdate) => {
        const u = upd as Record<string, unknown>;
        writes.push({id, ...u});
        const r = rows.find((x) => x.id === id);
        if (r) Object.assign(r.data, u); // reflect for idempotency test
      },
    },
  };
}

test("dry-run changes NOTHING but reports counts", async () => {
  const rows: ProfileRow[] = [
    {id: "a", data: {username: "Ahmad", displayName: "Ahmad Food"}},
    {id: "b", data: {username: "beb", displayName: "Beb", usernameLower: "beb", displayNameLower: "beb"}},
  ];
  const {deps, writes} = fakeDeps(rows);
  const r = await backfillPage(deps, {dryRun: true, pageSize: 10});
  assert.equal(writes.length, 0); // no writes in dry-run
  assert.equal(r.scanned, 2);
  assert.equal(r.updated, 1); // 'a' needs update
  assert.equal(r.skipped, 1); // 'b' current
});

test("write mode updates missing, skips current, idempotent on rerun", async () => {
  const rows: ProfileRow[] = [
    {id: "a", data: {username: "Ahmad", displayName: "Ahmad Food"}},
    {id: "b", data: {username: "beb", displayName: "Beb", usernameLower: "beb", displayNameLower: "beb"}},
  ];
  const {deps, writes} = fakeDeps(rows);
  const r1 = await backfillPage(deps, {dryRun: false, pageSize: 10});
  assert.equal(r1.updated, 1);
  assert.equal(writes.length, 1);
  // rerun → idempotent (nothing to update)
  const r2 = await backfillPage(deps, {dryRun: false, pageSize: 10});
  assert.equal(r2.updated, 0);
  assert.equal(r2.skipped, 2);
});

test("no private fields copied (only lower derived)", async () => {
  const rows: ProfileRow[] = [
    {id: "a", data: {username: "Ahmad", displayName: "Ahmad Food", email: "secret@x.com", phone: "+60123"}},
  ];
  const {deps, writes} = fakeDeps(rows);
  await backfillPage(deps, {dryRun: false, pageSize: 10});
  const w = writes[0];
  assert.equal(w.email, undefined);
  assert.equal(w.phone, undefined);
  assert.deepEqual(Object.keys(w).sort(), ["displayNameLower", "id", "usernameLower"]);
});

test("batch boundaries: paging covers all rows", async () => {
  const rows: ProfileRow[] = Array.from({length: 5}, (_, i) => ({
    id: `u${i}`, data: {username: `u${i}`, displayName: `User ${i}`},
  }));
  const {deps} = fakeDeps(rows);
  let cursor: string | undefined;
  let total = 0;
  for (let guard = 0; guard < 10; guard++) {
    const r: {scanned: number; nextCursor: string | null} =
      await backfillPage(deps, {dryRun: true, pageSize: 2, cursor});
    total += r.scanned;
    if (!r.nextCursor) break;
    cursor = r.nextCursor;
  }
  assert.equal(total, 5);
});
