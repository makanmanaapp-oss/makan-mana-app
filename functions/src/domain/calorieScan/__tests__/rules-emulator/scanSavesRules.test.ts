/**
 * Phase 2.15A-D — REAL client-perspective rules tests for the Calorie Scan
 * idempotency records `users/{uid}/scan_saves/{actionId}`.
 * Run: npm run test:rules (or the calorieScan-only variant).
 *
 * Proves: no client (unauthenticated, the UID owner, or a different UID) can
 * create/read/update/delete/list scan_saves; existing user subcollections
 * (e.g. meals) remain accessible to their owner.
 */
import {before, after, beforeEach, test} from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) {
  throw new Error("FIRESTORE_EMULATOR_HOST unset — run via `npm run test:rules`.");
}
const [host, portStr] = HOST.split(":");
const PROJECT_ID = "demo-mm-scansaves-rules";

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
  if (env) await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  // Seed a lock via Admin SDK (rules disabled) so read/update/delete/list have
  // an existing target — proving the DENY, not just a missing doc.
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users/uidA/scan_saves/act1"), {
      actionId: "act1",
      uid: "uidA",
      mealId: "meal_1",
      calories: 600,
    });
  });
});

const path = "users/uidA/scan_saves/act1";

test("rules: unauthenticated client cannot read or write scan_saves", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, path)));
  await assertFails(setDoc(doc(db, "users/uidA/scan_saves/new1"), {x: 1}));
});

test("rules: UID owner cannot create/read/update/delete/list scan_saves", async () => {
  const db = env.authenticatedContext("uidA").firestore();
  await assertFails(setDoc(doc(db, "users/uidA/scan_saves/new1"), {x: 1})); // create
  await assertFails(getDoc(doc(db, path))); // read
  await assertFails(updateDoc(doc(db, path), {calories: 1})); // update
  await assertFails(deleteDoc(doc(db, path))); // delete
  await assertFails(getDocs(collection(db, "users/uidA/scan_saves"))); // list
});

test("rules: a different authenticated UID cannot access another's scan_saves", async () => {
  const db = env.authenticatedContext("uidB").firestore();
  await assertFails(getDoc(doc(db, path)));
  await assertFails(setDoc(doc(db, "users/uidA/scan_saves/new1"), {x: 1}));
  await assertFails(getDocs(collection(db, "users/uidA/scan_saves")));
});

test("rules: existing user subcollections still work for their owner (meals)", async () => {
  const db = env.authenticatedContext("uidA").firestore();
  await assertSucceeds(
    setDoc(doc(db, "users/uidA/meals/m1"), {name: "Nasi Ayam"}),
  );
  await assertSucceeds(getDoc(doc(db, "users/uidA/meals/m1")));
  // ...but not another user's meals (existing isOwner rule).
  const other = env.authenticatedContext("uidB").firestore();
  await assertFails(getDoc(doc(other, "users/uidA/meals/m1")));
});
