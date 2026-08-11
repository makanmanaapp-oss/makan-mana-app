/**
 * Phase 2.15A — server idempotency proven with an in-memory transactional
 * store that models Firestore semantics (serialized conflicting transactions;
 * create() conflicts surface at commit). Runs under `node --test`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {idempotentSaveScanMeal, lockPathFor, Tx, TxStore} from "../idempotentSave";
import {ScanMealValue} from "../scanMealValidation";

interface Buffered {
  creates: Array<{path: string; data: Record<string, unknown>}>;
  incrs: Array<{path: string; inc: Record<string, number>; extra: Record<string, unknown>}>;
}

/** Faithful-enough in-memory model: transactions run one at a time (Firestore
 * serializes conflicting docs); writes buffer and apply on commit; create()
 * throws if the path already exists at commit. */
class InMemoryTxStore implements TxStore {
  data = new Map<string, Record<string, unknown>>();
  private queue: Promise<unknown> = Promise.resolve();
  private idN = 0;

  newMealId(): string {
    this.idN += 1;
    return `meal_${this.idN}`;
  }
  serverTimestamp(): unknown {
    return "ST";
  }

  async runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    // Chain onto the queue so transactions do not interleave.
    const run = this.queue.then(async () => {
      const buf: Buffered = {creates: [], incrs: []};
      const tx: Tx = {
        get: async (path) => {
          const d = this.data.get(path);
          return {exists: d !== undefined, data: d};
        },
        create: (path, data) => buf.creates.push({path, data}),
        setIncrement: (path, inc, extra) => buf.incrs.push({path, inc, extra}),
      };
      const result = await fn(tx);
      // Commit: creates must not clobber existing docs.
      for (const c of buf.creates) {
        if (this.data.has(c.path)) {
          throw new Error(`ALREADY_EXISTS: ${c.path}`);
        }
      }
      for (const c of buf.creates) this.data.set(c.path, c.data);
      for (const s of buf.incrs) {
        const cur = (this.data.get(s.path) ?? {}) as Record<string, number>;
        const next: Record<string, unknown> = {...cur, ...s.extra};
        for (const [k, v] of Object.entries(s.inc)) {
          next[k] = ((cur[k] as number) ?? 0) + v;
        }
        this.data.set(s.path, next);
      }
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  countMeals(uid: string): number {
    let n = 0;
    for (const [p, d] of this.data) {
      if (p.startsWith("meal_logs/") && d.userId === uid) n += 1;
    }
    return n;
  }
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

test("first save creates exactly one meal + lock + metrics", async () => {
  const s = new InMemoryTxStore();
  const r = await idempotentSaveScanMeal(s, {uid: "A", meal: meal("act1"), dateKey: DK});
  assert.equal(r.status, "created");
  assert.equal(s.countMeals("A"), 1);
  assert.ok(s.data.has(lockPathFor("A", "act1")));
  const m = s.data.get(`fitness_metrics/A_${DK}`) as Record<string, number>;
  assert.equal(m.caloriesIn, 600);
  assert.equal(m.mealCount, 1);
});

test("retry with same actionId returns same meal, no duplicate", async () => {
  const s = new InMemoryTxStore();
  const r1 = await idempotentSaveScanMeal(s, {uid: "A", meal: meal("act1"), dateKey: DK});
  const r2 = await idempotentSaveScanMeal(s, {uid: "A", meal: meal("act1"), dateKey: DK});
  assert.equal(r2.status, "idempotentReplay");
  assert.equal(r2.mealId, r1.mealId);
  assert.equal(s.countMeals("A"), 1);
});

test("retry does not duplicate metrics (mealCount stays 1)", async () => {
  const s = new InMemoryTxStore();
  await idempotentSaveScanMeal(s, {uid: "A", meal: meal("act1"), dateKey: DK});
  await idempotentSaveScanMeal(s, {uid: "A", meal: meal("act1"), dateKey: DK});
  const m = s.data.get(`fitness_metrics/A_${DK}`) as Record<string, number>;
  assert.equal(m.mealCount, 1);
  assert.equal(m.caloriesIn, 600);
});

test("concurrent same-actionId requests create exactly one meal", async () => {
  const s = new InMemoryTxStore();
  const [a, b] = await Promise.all([
    idempotentSaveScanMeal(s, {uid: "A", meal: meal("act1"), dateKey: DK}),
    idempotentSaveScanMeal(s, {uid: "A", meal: meal("act1"), dateKey: DK}),
  ]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, ["created", "idempotentReplay"]);
  assert.equal(a.mealId, b.mealId);
  assert.equal(s.countMeals("A"), 1);
});

test("different actionIds create separate meals", async () => {
  const s = new InMemoryTxStore();
  const r1 = await idempotentSaveScanMeal(s, {uid: "A", meal: meal("act1"), dateKey: DK});
  const r2 = await idempotentSaveScanMeal(s, {uid: "A", meal: meal("act2"), dateKey: DK});
  assert.notEqual(r1.mealId, r2.mealId);
  assert.equal(s.countMeals("A"), 2);
  const m = s.data.get(`fitness_metrics/A_${DK}`) as Record<string, number>;
  assert.equal(m.mealCount, 2);
});

test("actionId is UID-scoped: another UID cannot replay/collide", async () => {
  const s = new InMemoryTxStore();
  const rA = await idempotentSaveScanMeal(s, {uid: "A", meal: meal("shared"), dateKey: DK});
  const rB = await idempotentSaveScanMeal(s, {uid: "B", meal: meal("shared"), dateKey: DK});
  assert.equal(rA.status, "created");
  assert.equal(rB.status, "created"); // B is NOT blocked by A's lock
  assert.notEqual(rA.mealId, rB.mealId);
  assert.equal(s.countMeals("A"), 1);
  assert.equal(s.countMeals("B"), 1);
  assert.ok(s.data.has(lockPathFor("A", "shared")));
  assert.ok(s.data.has(lockPathFor("B", "shared")));
  // Lock paths are distinct so B never reads A's lock/mealId.
  assert.notEqual(lockPathFor("A", "shared"), lockPathFor("B", "shared"));
});

test("missing macros stay null in stored meal (not zero)", async () => {
  const s = new InMemoryTxStore();
  await idempotentSaveScanMeal(s, {
    uid: "A",
    meal: meal("act1", {protein: null, carbs: null, fat: null, macroSource: "not_estimated"}),
    dateKey: DK,
  });
  const doc = s.data.get("meal_logs/meal_1") as Record<string, unknown>;
  assert.equal(doc.proteinEstimate, null);
  assert.equal(doc.carbsEstimate, null);
  assert.equal(doc.fatEstimate, null);
  // Metrics increment 0 for null macros (do not inflate totals).
  const m = s.data.get(`fitness_metrics/A_${DK}`) as Record<string, number>;
  assert.equal(m.protein, 0);
  assert.equal(m.caloriesIn, 600);
});
