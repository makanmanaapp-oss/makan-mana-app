/**
 * Phase 1.4 — ujian rules SEBENAR perspektif klien untuk koleksi dedup
 * (@firebase/rules-unit-testing, emulator offline). Jalankan: npm run test:rules.
 * Gagal serta-merta jika FIRESTORE_EMULATOR_HOST tiada — tiada fallback produksi.
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
const PROJECT_ID = "demo-mm-dedup-rules";

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
    await setDoc(doc(db, "place_merge_queue/dq1"), { duplicateCandidateId: "dq1", reviewStatus: "open" });
    await setDoc(doc(db, "place_aliases/al1"), { aliasId: "al1", canonicalPlaceId: "mm_1" });
    await setDoc(doc(db, "place_merge_plans/mp1"), { mergePlanId: "mp1", status: "draft" });
    await setDoc(doc(db, "place_merge_plans/mp1/audit/a1"), { auditId: "a1", action: "merge_plan_created" });
  });
});

const alice = () => env.authenticatedContext("alice").firestore();
const unauth = () => env.unauthenticatedContext().firestore();

// 31 & 32. Normal user cannot read/write merge queue.
test("user cannot read place_merge_queue", async () => {
  await assertFails(getDoc(doc(alice(), "place_merge_queue/dq1")));
});
test("user cannot write place_merge_queue", async () => {
  await assertFails(setDoc(doc(alice(), "place_merge_queue/dq2"), { x: 1 }));
  await assertFails(updateDoc(doc(alice(), "place_merge_queue/dq1"), { reviewStatus: "merged" }));
  await assertFails(deleteDoc(doc(alice(), "place_merge_queue/dq1")));
});
test("query place_merge_queue is denied", async () => {
  await assertFails(getDocs(collection(alice(), "place_merge_queue")));
});

// 33 & 34. Normal user cannot read/write aliases.
test("user cannot read place_aliases", async () => {
  await assertFails(getDoc(doc(alice(), "place_aliases/al1")));
});
test("user cannot write place_aliases", async () => {
  await assertFails(setDoc(doc(alice(), "place_aliases/al2"), { canonicalPlaceId: "mm_9" }));
});

// 35. Normal user cannot access merge plans (+ audit).
test("user cannot access place_merge_plans", async () => {
  await assertFails(getDoc(doc(alice(), "place_merge_plans/mp1")));
  await assertFails(setDoc(doc(alice(), "place_merge_plans/mp2"), { status: "approved" }));
  await assertFails(getDoc(doc(alice(), "place_merge_plans/mp1/audit/a1")));
  await assertFails(setDoc(doc(alice(), "place_merge_plans/mp1/audit/a2"), { action: "x" }));
});

// Unauthenticated juga dinafikan.
test("unauth cannot read dedup collections", async () => {
  await assertFails(getDoc(doc(unauth(), "place_merge_queue/dq1")));
  await assertFails(getDoc(doc(unauth(), "place_aliases/al1")));
  await assertFails(getDoc(doc(unauth(), "place_merge_plans/mp1")));
});
