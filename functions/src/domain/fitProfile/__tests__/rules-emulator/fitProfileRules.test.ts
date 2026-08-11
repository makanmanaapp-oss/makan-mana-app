/**
 * Phase 2.16A — REAL client-perspective rules tests for fitness_profiles
 * bounded validation. Impossible body basics (e.g. height=0) must be rejected
 * even if a client bypasses the UI; valid profiles and non-body partial merges
 * still succeed; cross-UID writes denied.
 * Run: npm run test:rules (or the fitProfile-only variant).
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
import {doc, setDoc} from "firebase/firestore";

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) {
  throw new Error("FIRESTORE_EMULATOR_HOST unset — run via `npm run test:rules`.");
}
const [host, portStr] = HOST.split(":");
const PROJECT_ID = "demo-mm-fitprofile-rules";

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
});

const valid = {heightCm: 170, weightKg: 70, age: 25, gender: "male", userId: "uidA"};

test("rules: valid Fit profile is accepted for its owner", async () => {
  const db = env.authenticatedContext("uidA").firestore();
  await assertSucceeds(setDoc(doc(db, "fitness_profiles/uidA"), valid));
});

test("rules: height=0 rejected", async () => {
  const db = env.authenticatedContext("uidA").firestore();
  await assertFails(setDoc(doc(db, "fitness_profiles/uidA"), {...valid, heightCm: 0}));
});

test("rules: negative/extreme weight and impossible age rejected", async () => {
  const db = env.authenticatedContext("uidA").firestore();
  await assertFails(setDoc(doc(db, "fitness_profiles/uidA"), {...valid, weightKg: 0}));
  await assertFails(setDoc(doc(db, "fitness_profiles/uidA"), {...valid, weightKg: 999}));
  await assertFails(setDoc(doc(db, "fitness_profiles/uidA"), {...valid, age: 0}));
  await assertFails(setDoc(doc(db, "fitness_profiles/uidA"), {...valid, age: 200}));
});

test("rules: invalid trainingDays / sessionDuration / stepTarget rejected", async () => {
  const db = env.authenticatedContext("uidA").firestore();
  await assertFails(setDoc(doc(db, "fitness_profiles/uidA"), {...valid, trainingDaysPerWeek: 0}));
  await assertFails(setDoc(doc(db, "fitness_profiles/uidA"), {...valid, trainingDaysPerWeek: 8}));
  await assertFails(setDoc(doc(db, "fitness_profiles/uidA"), {...valid, sessionDurationMinutes: 0}));
  await assertFails(setDoc(doc(db, "fitness_profiles/uidA"), {...valid, sessionDurationMinutes: 1000}));
  await assertFails(setDoc(doc(db, "fitness_profiles/uidA"), {...valid, stepTarget: -1}));
  await assertFails(setDoc(doc(db, "fitness_profiles/uidA"), {...valid, stepTarget: 999999}));
});

test("rules: valid full profile with training fields accepted", async () => {
  const db = env.authenticatedContext("uidA").firestore();
  await assertSucceeds(setDoc(doc(db, "fitness_profiles/uidA"),
    {...valid, trainingDaysPerWeek: 4, sessionDurationMinutes: 30, stepTarget: 8000}));
});

test("rules: partial merge WITHOUT body basics still allowed (e.g. sport mood)", async () => {
  const db = env.authenticatedContext("uidA").firestore();
  await assertSucceeds(
    setDoc(doc(db, "fitness_profiles/uidA"), {selectedSportMood: "fighterCamp"}, {merge: true}),
  );
});

test("rules: a different UID cannot write another user's Fit profile", async () => {
  const db = env.authenticatedContext("uidB").firestore();
  await assertFails(setDoc(doc(db, "fitness_profiles/uidA"), valid));
});
