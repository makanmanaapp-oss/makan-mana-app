/**
 * Phase 2.15A — Firestore adapter for the idempotent scan-meal save.
 * Injectable (takes a Firestore + FieldValue) so the same code path runs
 * against production and the Firestore emulator in tests.
 */
import type {Firestore} from "firebase-admin/firestore";

import {Tx, TxStore} from "./idempotentSave";

interface FieldValueLike {
  serverTimestamp(): unknown;
  increment(n: number): unknown;
}

export function createFirestoreTxStore(
  db: Firestore,
  FieldValue: FieldValueLike,
): TxStore {
  return {
    newMealId(): string {
      return db.collection("meal_logs").doc().id;
    },
    serverTimestamp(): unknown {
      return FieldValue.serverTimestamp();
    },
    async runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
      return db.runTransaction(async (transaction) => {
        const tx: Tx = {
          get: async (path) => {
            const snap = await transaction.get(db.doc(path));
            return {exists: snap.exists, data: snap.data()};
          },
          create: (path, data) => {
            transaction.create(db.doc(path), data);
          },
          setIncrement: (path, inc, extra) => {
            const payload: Record<string, unknown> = {...extra};
            for (const [k, v] of Object.entries(inc)) {
              payload[k] = FieldValue.increment(v);
            }
            transaction.set(db.doc(path), payload, {merge: true});
          },
        };
        return fn(tx);
      });
    },
  };
}
