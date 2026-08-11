/**
 * Phase 2.15A — server-enforced idempotent save for a Calorie Scan meal.
 *
 * The idempotency decision lives here (pure orchestration over an injected
 * transactional store), so it can be proven with `node --test` using an
 * in-memory store AND wired to a real Firestore transaction in the callable.
 *
 * Guarantee: for a given (uid, actionId), at most ONE meal_logs doc, ONE
 * metrics increment and ONE lock are created. Retries return the same mealId.
 * The lock is UID-scoped (`users/{uid}/scan_saves/{actionId}`) so one user can
 * never replay or read another user's actionId.
 */
import {
  buildMealLogDoc,
  buildMetricsIncrements,
  ScanMealValue,
} from "./scanMealValidation";

export interface TxDoc {
  exists: boolean;
  data?: Record<string, unknown>;
}

/** Minimal transaction surface (a subset of Firestore's Transaction). */
export interface Tx {
  get(path: string): Promise<TxDoc>;
  /** Create a document; conflicts (already-exists) surface at commit. */
  create(path: string, data: Record<string, unknown>): void;
  /** Merge-set with a set of fields to apply as numeric increments. */
  setIncrement(path: string, increments: Record<string, number>, extra: Record<string, unknown>): void;
}

export interface TxStore {
  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Pre-generate a unique meal id (Firestore doc().id in prod). */
  newMealId(): string;
  /** Server timestamp sentinel (FieldValue.serverTimestamp() in prod). */
  serverTimestamp(): unknown;
}

export interface SaveResult {
  status: "created" | "idempotentReplay";
  mealId: string;
}

export function lockPathFor(uid: string, actionId: string): string {
  return `users/${uid}/scan_saves/${actionId}`;
}

/**
 * Idempotently save a validated scan meal. UID-scoped lock; atomic within one
 * transaction. Returns {created} the first time, {idempotentReplay} on retry.
 */
export async function idempotentSaveScanMeal(
  store: TxStore,
  params: {uid: string; meal: ScanMealValue; dateKey: string},
): Promise<SaveResult> {
  const {uid, meal, dateKey} = params;
  const lockPath = lockPathFor(uid, meal.actionId);

  return store.runTransaction(async (tx) => {
    const lock = await tx.get(lockPath);
    if (lock.exists) {
      const mealId = (lock.data?.mealId as string | undefined) ?? "";
      return {status: "idempotentReplay", mealId};
    }

    const mealId = store.newMealId();
    const now = store.serverTimestamp();

    tx.create(`meal_logs/${mealId}`, buildMealLogDoc(uid, meal, dateKey, now));

    tx.setIncrement(
      `fitness_metrics/${uid}_${dateKey}`,
      buildMetricsIncrements(meal),
      {userId: uid, date: dateKey, source: "photo_scan", updatedAt: now},
    );

    // The lock records only idempotency metadata — never image content.
    tx.create(lockPath, {
      actionId: meal.actionId,
      uid,
      mealId,
      calories: meal.calories,
      createdAt: now,
    });

    return {status: "created", mealId};
  });
}
