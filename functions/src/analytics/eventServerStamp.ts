/**
 * The one server clock for an event, decided once and never moved.
 *
 * WHY THIS EXISTS. Two `onDocumentCreated` listeners watch `events/`:
 * `aggregateAnalyticsEventOnCreate` (merchant metrics) and
 * `aggregateCmsAnalyticsEventOnCreate` (banner metrics). Each is handed the
 * CREATION snapshot, which never carries `serverTimestampMs` — the client
 * writes `timestamp`, not this field — so a guarded blind `set` from either
 * listener is in practice unconditional, and the second one overwrites the
 * first.
 *
 * That matters because the value is not decoration. `runReconcile` SELECTS a
 * day's events with a range filter on `serverTimestampMs`, and a Firestore
 * range filter returns nothing at all for a document that lacks the field.
 * So when the number a listener counted by is not the number that ends up
 * stored, the day a count landed in is not the day the repair searches it
 * under — and the repair REPLACES counters rather than adding to them, so a
 * real impression is silently erased from a day that had other traffic.
 *
 * Transactional, therefore, and write-once: the first stamper decides, and
 * every later caller is handed the value that is actually STORED. That is the
 * number the reconcile range-query will filter on, so the counted day and the
 * reconciled day cannot disagree.
 *
 * It does not make the stamp more ACCURATE — it is still a trigger's wall
 * clock, so a delayed delivery can still place a 23:59 event in the next day.
 * It makes the two writers AGREE, which is what stops data being destroyed.
 */
import {db} from "../config/firebase";

export async function ensureEventServerTimestampMs(
  ref: FirebaseFirestore.DocumentReference,
  nowMs: number,
): Promise<number> {
  return db.runTransaction(async (tx) => {
    const existing = (await tx.get(ref)).data()?.serverTimestampMs;
    if (typeof existing === "number" && Number.isFinite(existing)) return existing;
    tx.set(ref, {serverTimestampMs: nowMs}, {merge: true});
    return nowMs;
  });
}
