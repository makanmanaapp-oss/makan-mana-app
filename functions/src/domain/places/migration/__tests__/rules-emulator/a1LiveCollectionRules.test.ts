/**
 * Phase A1 Part 8 — client-rules coverage for the three live Place Data
 * collections that previously relied on Firestore's default denial alone:
 * place_registry (25 docs), places_pool_v3 (4) and place_migration_batches (1).
 *
 * Default denial already blocked clients, so this is a hardening change, not a
 * fix for an open hole. What it buys is explicitness: every sibling Place Data
 * collection states `if false`, and a future rules edit that adds a broad match
 * can no longer silently expose these three.
 *
 * Note on scope: the Admin SDK does not evaluate client rules at all, so there
 * is deliberately no "Admin SDK bypasses rules" test here — that would assert a
 * property of the SDK, not of these rules. Server access is out of scope.
 *
 * Run: npm run test:rules
 */
import { before, after, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) {
  throw new Error("FIRESTORE_EMULATOR_HOST unset — run via `npm run test:rules`.");
}
const [host, portStr] = HOST.split(":");
const PROJECT_ID = "demo-mm-a1-live-rules";

/** The three collections this phase made explicit, with one seed document each. */
const LIVE_DOCS: readonly { path: string; data: Record<string, unknown> }[] = [
  {
    path: "place_registry/PLC-seed",
    data: { canonicalPlaceId: "PLC-seed", canonicalVersion: "1.14E.1", displayName: "Seed" },
  },
  {
    path: "places_pool_v3/v3_seed_cell",
    data: { cell: "v3_seed_cell", schemaVersion: 3, rawCount: 1 },
  },
  {
    path: "place_migration_batches/PMB-seed",
    data: { batchId: "PMB-seed", sourceCount: 1, migratedCount: 1 },
  },
];

/** Siblings that must not regress while the three above are added. */
const SIBLING_DOCS: readonly string[] = [
  "place_publications/PUB-seed",
  "place_publication_heads/PLC-seed",
  "place_migration_aliases/ALS-seed",
  "place_migration_audit/MAU-seed",
];

let env: RulesTestEnvironment;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(process.cwd(), "..", "firestore.rules"), "utf8"),
      host,
      port: Number(portStr),
    },
  });
});

after(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  // Seed with rules disabled so the documents genuinely exist; a denied read of
  // a missing document would pass for the wrong reason.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const d of LIVE_DOCS) await setDoc(doc(db, d.path), d.data);
    for (const p of SIBLING_DOCS) await setDoc(doc(db, p), { seeded: true });
  });
});

/** Every client identity we care about. None may reach these collections. */
function clients() {
  return [
    ["unauthenticated", env.unauthenticatedContext().firestore()] as const,
    ["normal user", env.authenticatedContext("user_normal").firestore()] as const,
    // "admin" is only a claim on a client SDK — it is still a client.
    ["admin-claim client", env.authenticatedContext("user_admin", { admin: true, role: "owner" }).firestore()] as const,
  ];
}

for (const { path } of LIVE_DOCS) {
  test(`${path}: every client identity is denied read`, async () => {
    for (const [label, db] of clients()) {
      await assertFails(getDoc(doc(db, path)));
      void label;
    }
  });

  test(`${path}: every client identity is denied write`, async () => {
    for (const [, db] of clients()) {
      await assertFails(setDoc(doc(db, path), { tampered: true }));
      await assertFails(updateDoc(doc(db, path), { tampered: true }));
      await assertFails(deleteDoc(doc(db, path)));
    }
  });
}

test("creating a new document in any of the three is denied for every client", async () => {
  for (const [, db] of clients()) {
    await assertFails(setDoc(doc(db, "place_registry/PLC-forged"), { canonicalPlaceId: "PLC-forged" }));
    await assertFails(setDoc(doc(db, "places_pool_v3/v3_forged"), { cell: "v3_forged" }));
    await assertFails(setDoc(doc(db, "place_migration_batches/PMB-forged"), { batchId: "PMB-forged" }));
  }
});

test("sibling Place Data rules did not regress", async () => {
  for (const path of SIBLING_DOCS) {
    for (const [, db] of clients()) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { tampered: true }));
    }
  }
});
