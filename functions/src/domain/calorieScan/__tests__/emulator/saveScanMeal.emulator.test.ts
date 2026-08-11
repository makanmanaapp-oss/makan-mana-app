/**
 * Phase 2.15A — server idempotency against the REAL Firestore emulator.
 * Run: npm run test:emulator (sets FIRESTORE_EMULATOR_HOST). Skipped otherwise.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {initializeApp, App} from "firebase-admin/app";
import {getFirestore, FieldValue} from "firebase-admin/firestore";

import {idempotentSaveScanMeal} from "../../idempotentSave";
import {createFirestoreTxStore} from "../../firestoreScanStore";
import {ScanMealValue} from "../../scanMealValidation";

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const skip = EMU ? false : "FIRESTORE_EMULATOR_HOST unset (run via npm run test:emulator)";

let app: App | undefined;
let seq = 0;

function db() {
  if (!app) app = initializeApp({projectId: process.env.GCLOUD_PROJECT ?? "demo-mm"});
  return getFirestore(app);
}
function store() {
  return createFirestoreTxStore(db(), FieldValue);
}
function meal(actionId: string, over: Partial<ScanMealValue> = {}): ScanMealValue {
  return {
    actionId,
    menuName: "Nasi Ayam",
    servingDesc: "1 plate",
    calories: 600,
    protein: 30,
    carbs: 70,
    fat: 20,
    isHealthy: true,
    mealTime: "lunch",
    calorieSource: "model",
    macroSource: "model",
    ...over,
  };
}
const DK = "20260804";

async function countMeals(uid: string): Promise<number> {
  const snap = await db().collection("meal_logs").where("userId", "==", uid).get();
  return snap.size;
}

test("emulator: first save creates one meal; retry replays same id", {skip}, async () => {
  const uid = `emu_${seq++}`;
  const act = `act_${uid}`;
  const r1 = await idempotentSaveScanMeal(store(), {uid, meal: meal(act), dateKey: DK});
  const r2 = await idempotentSaveScanMeal(store(), {uid, meal: meal(act), dateKey: DK});
  assert.equal(r1.status, "created");
  assert.equal(r2.status, "idempotentReplay");
  assert.equal(r2.mealId, r1.mealId);
  assert.equal(await countMeals(uid), 1);
  const metrics = await db().doc(`fitness_metrics/${uid}_${DK}`).get();
  assert.equal((metrics.data() as Record<string, number>).mealCount, 1);
});

test("emulator: concurrent same-actionId → exactly one meal", {skip}, async () => {
  const uid = `emu_${seq++}`;
  const act = `act_${uid}`;
  const [a, b] = await Promise.all([
    idempotentSaveScanMeal(store(), {uid, meal: meal(act), dateKey: DK}),
    idempotentSaveScanMeal(store(), {uid, meal: meal(act), dateKey: DK}),
  ]);
  assert.equal(a.mealId, b.mealId);
  assert.equal(await countMeals(uid), 1);
});

test("emulator: actionId is UID-scoped (no cross-UID collision/replay)", {skip}, async () => {
  const uidA = `emuA_${seq++}`;
  const uidB = `emuB_${seq++}`;
  const shared = "shared_action";
  const rA = await idempotentSaveScanMeal(store(), {uid: uidA, meal: meal(shared), dateKey: DK});
  const rB = await idempotentSaveScanMeal(store(), {uid: uidB, meal: meal(shared), dateKey: DK});
  assert.equal(rA.status, "created");
  assert.equal(rB.status, "created");
  assert.notEqual(rA.mealId, rB.mealId);
  assert.equal(await countMeals(uidA), 1);
  assert.equal(await countMeals(uidB), 1);
});

test("emulator: different actionIds create separate meals", {skip}, async () => {
  const uid = `emu_${seq++}`;
  await idempotentSaveScanMeal(store(), {uid, meal: meal("a1"), dateKey: DK});
  await idempotentSaveScanMeal(store(), {uid, meal: meal("a2"), dateKey: DK});
  assert.equal(await countMeals(uid), 2);
  const metrics = await db().doc(`fitness_metrics/${uid}_${DK}`).get();
  assert.equal((metrics.data() as Record<string, number>).mealCount, 2);
});
