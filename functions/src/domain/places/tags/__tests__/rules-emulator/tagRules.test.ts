/**
 * Phase 1.5 — ujian rules SEBENAR perspektif klien untuk koleksi tag
 * (@firebase/rules-unit-testing, emulator offline). Jalankan: npm run test:rules.
 */
import { before, after, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) {
  throw new Error("FIRESTORE_EMULATOR_HOST unset — run via `npm run test:rules`.");
}
const [host, portStr] = HOST.split(":");
const PROJECT_ID = "demo-mm-tag-rules";

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
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "place_tag_definitions/restaurant"), { tagId: "restaurant", familyId: "place_type" });
    await setDoc(doc(db, "place_tag_sets/mm_1/evidence/malay"), { tagId: "malay", status: "approved" });
    await setDoc(doc(db, "place_tag_sets/mm_1/audit/a1"), { auditId: "a1", action: "tag_proposed" });
    await setDoc(doc(db, "place_tag_sets/mm_1"), { placeId: "mm_1" });
  });
});

const alice = () => env.authenticatedContext("alice").firestore();
const unauth = () => env.unauthenticatedContext().firestore();

// 32. Normal user cannot read/write trusted tag definitions.
test("user cannot read place_tag_definitions", async () => {
  await assertFails(getDoc(doc(alice(), "place_tag_definitions/restaurant")));
});
test("user cannot write place_tag_definitions", async () => {
  await assertFails(setDoc(doc(alice(), "place_tag_definitions/cafe"), { familyId: "place_type" }));
  await assertFails(deleteDoc(doc(alice(), "place_tag_definitions/restaurant")));
});
test("query place_tag_definitions is denied", async () => {
  await assertFails(getDocs(collection(alice(), "place_tag_definitions")));
});

// 33. Normal user cannot write tag sets (incl. evidence).
test("user cannot write place_tag_sets and evidence", async () => {
  await assertFails(setDoc(doc(alice(), "place_tag_sets/mm_2"), { placeId: "mm_2" }));
  await assertFails(setDoc(doc(alice(), "place_tag_sets/mm_1/evidence/vegan_options"), { tagId: "vegan_options" }));
  await assertFails(getDoc(doc(alice(), "place_tag_sets/mm_1/evidence/malay")));
});

// 34. Normal user cannot approve/reject tag evidence (any write denied).
test("user cannot approve/reject tag evidence", async () => {
  await assertFails(updateDoc(doc(alice(), "place_tag_sets/mm_1/evidence/malay"), { status: "approved" }));
  await assertFails(updateDoc(doc(alice(), "place_tag_sets/mm_1/evidence/malay"), { status: "rejected" }));
});

// 35. Normal user cannot read tag audit.
test("user cannot read tag audit", async () => {
  await assertFails(getDoc(doc(alice(), "place_tag_sets/mm_1/audit/a1")));
  await assertFails(setDoc(doc(alice(), "place_tag_sets/mm_1/audit/a2"), { action: "x" }));
});

// Unauthenticated denied too.
test("unauth cannot read tag collections", async () => {
  await assertFails(getDoc(doc(unauth(), "place_tag_definitions/restaurant")));
  await assertFails(getDoc(doc(unauth(), "place_tag_sets/mm_1")));
});
