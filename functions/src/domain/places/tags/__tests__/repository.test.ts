import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryTagStore, SEED_TAG_DEFINITIONS } from "../index";
import { TrustedActor } from "../../staging/stagingAudit";
import { T, ev } from "./fixtures";

const ACTOR: TrustedActor = { actorUid: "server_admin", actorRole: "admin" };

async function seededStore() {
  const store = new InMemoryTagStore({ now: () => T });
  for (const d of SEED_TAG_DEFINITIONS) await store.seedDefinition(d);
  return store;
}

test("seed + get definition + resolve alias", async () => {
  const store = await seededStore();
  assert.equal((await store.getDefinition("restaurant"))?.familyId, "place_type");
  assert.equal(await store.resolveAlias("malaysian"), "malay");
  assert.equal(await store.resolveAlias("western_food"), "western"); // deprecated → replacement
  assert.equal(await store.resolveAlias("zzz"), null);
});

test("list by family is bounded + paginated", async () => {
  const store = await seededStore();
  const p1 = await store.listByFamily("cuisine", { limit: 3 });
  assert.equal(p1.items.length, 3);
  assert.ok(p1.nextCursor);
  const p2 = await store.listByFamily("cuisine", { limit: 3, cursor: p1.nextCursor });
  assert.ok(p2.items.length > 0);
});

test("propose evidence + approve via valid transition (server actor)", async () => {
  const store = await seededStore();
  await store.createProposedEvidence("mm_1", ev("cuisine", "malay"), ACTOR);
  const approved = await store.transitionEvidenceStatus("mm_1", "malay", "approved", ACTOR);
  assert.equal(approved.status, "approved");
  assert.equal(approved.approvedBy, "server_admin");
  // Peralihan tidak sah ditolak (approved → proposed).
  await assert.rejects(() => store.transitionEvidenceStatus("mm_1", "malay", "proposed" as never, ACTOR));
});

test("store normalized tag set + audit append-only", async () => {
  const store = await seededStore();
  await store.storeNormalizedTagSet("mm_2", [ev("place_type", "restaurant"), ev("cuisine", "malay")], ACTOR);
  const set = await store.getTagSet("mm_2");
  assert.equal(set.length, 2);
  const audit = await store.listAudit("mm_2");
  assert.ok(audit.length >= 1);
  assert.ok(audit.every((a) => a.actorUid === "server_admin"));
});

// 36 & 37. No place_registry write / publish / delete surface.
test("repository exposes no registry, publish or delete operation", async () => {
  const store = await seededStore();
  const names = Object.getOwnPropertyNames(Object.getPrototypeOf(store));
  const forbidden = names.filter((n) => /registry|publish|promote|delete/i.test(n));
  assert.deepEqual(forbidden, []);
});
