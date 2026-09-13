# Scalable area cache — implementation report

Branch `fix/pr26-ui-unlimited-discovery-20260913`.
**Nothing in here is deployed.** See §Deployment.

---

## 1. The previous architecture

`area_place_cache/{cellId}` held every candidate for a cell inside ONE document:

```ts
{ cellId, candidates: PlaceCandidate[], lastDiscoveryAt, updatedAt }
```

written by `persistDiscovered` as:

```ts
const list = dedupeCanonicalCandidates(cands).slice(0, MAX_CANDIDATES_PER_CELL); // 400
batch.set(cellRef, { cellId, candidates: list, ... }, { merge: true });
```

## 2. The exact #401 failure

Two compounding defects.

**a) The slice was destructive.** `merge: true` merges *fields*. `candidates` is one
field holding an array, so writing a 400-entry array replaces the entire array.
Candidate #401 was not hidden until later — it was written out of the cell.

**b) Order decided who died, and order was arbitrary.**
`dedupeCanonicalCandidates` preserves **insertion order**; it does not rank. So
whether a published registry restaurant survived depended on where it happened
to land in the discovery array. A newly published restaurant, appended last in a
dense cell, was dropped first.

Proven, not argued: `cellCapScale.test.ts` asserts the precondition — with 500
provider candidates discovered before the curated one, the old insertion-order
slice loses `PLC-testkitchen`.

## 3. Why `400 -> 10000` was not the fix

A Firestore document is capped at ~1 MiB. Candidates carry name, address,
photoUrl, openingPeriods and matchReasonKeys — over 1 KB each in the live cache.
10,000 would exceed the document limit, and long before that every discovery
would rewrite a multi-hundred-KB array and every read would transfer it. The
array is the wrong shape; the fix is to stop storing an unbounded list in one
document.

## 4. `orderCanonicalFirst` — legacy mitigation, not the architecture

Shipped earlier as a stable partition putting direct-canonical candidates ahead
of provider ones. It guaranteed the entry sacrificed to the cap was never an
authoritative registry record.

It is **not** the scalability fix and is no longer what keeps a restaurant alive.
Its remaining job is migration ordering: `backfillCellCandidates` writes canonical
candidates first, so an interrupted backfill has already migrated the
authoritative restaurants rather than an arbitrary prefix.

## 5. Final architecture

```
area_place_cache/{cellId}                        // metadata only
  cellId, lastDiscoveryAt, updatedAt,
  candidateCount, schemaVersion: 2,
  candidates: [...]                              // FROZEN legacy, read-only

area_place_cache/{cellId}/candidates/{identity}  // one document per restaurant
  { candidate: PlaceCandidate, updatedAt }
```

### Identity scheme

`candidateDocId()` reuses the existing `canonicalCandidateKey` —
`canonicalPlaceId?.trim() || placeId`. No second identity scheme was invented.
The document id IS the dedupe key, so two writers racing on the same restaurant
converge on one document instead of appending twice — a property the array could
never have. Ids that Firestore would reject (`.`, `..`, `__x__`, `/`, >1500 bytes)
are refused rather than written.

A provider candidate later proven canonical keys by its canonical id, leaving the
old provider document behind. That is not a duplicate on the surface: the reader
runs the unchanged `dedupeCanonicalCandidates`, which collapses a provider alias
against its canonical restaurant.

### Write path

`persistDiscovered` writes one document per candidate, chunked at 450 ops to stay
under the 500-op batch limit, plus cell metadata. No array, no cap.

`controlCenterMasterPlaceAdminBridge` now writes the candidate document too, in
the same transaction as the cell write. Without this, publishing would land a
canonical restaurant in generation-1 storage only.

### Read path

`readCellCandidates` pages the subcollection, then `mergeCellCandidates` unions
it with the legacy array and runs the unchanged canonical dedupe.

## 6. Cursor contract

Ordering is `orderBy("__name__")` with `startAfter(lastDocId)`.

Deterministic because `__name__` ordering is lexicographic by UTF-8 byte order
over **unique** document ids: the order is total, two documents can never compare
equal, so there is no tie to break and no second sort key is needed.

Under concurrent writes, a document inserted mid-traversal either sorts **before**
the anchor — missed on this pass, present on the next read — or **after** it, and
is seen normally. It can never re-emit a document already returned. Test 12 pins
this.

**This needs no index.** `__name__` ordering is served automatically. The
alternative in the original design (`isDirectCanonical desc, updatedAt desc`)
would have required a composite index and therefore an index deployment;
ranking happens in memory after the read, so it buys nothing here.

`MAX_CANDIDATES_READ_PER_CELL = 5000` shapes ONE request. It is not storage:
everything remains stored and reachable by paging, and when it bites the reader
reports `truncated: true` rather than implying the cell was exhausted.

## 7. Migration and backward compatibility

- **Dual read, always.** Not "fall back if schemaVersion != 2" — the reader
  unconditionally merges legacy array + subcollection. A cell part-way through
  backfill reads correctly from both.
- **Legacy array frozen.** Still read, never rewritten. This was a deliberate
  change after adversarial review found that rebuilding it made
  `persistDiscovered` a read-modify-write with no transaction, so a Control
  Center publish landing between read and write was silently overwritten — and
  made "rollback loses nothing" untrue past 400, with *which* 400 survived
  depending on Map iteration order.
- **Backfill** (`backfillCellCandidates`) is idempotent, canonical-first, and
  leaves the legacy array in place. Not wired to any trigger or schedule.
- **Rollback** means returning to the frozen pre-migration snapshot. Post-
  migration discoveries live only in the subcollection. That is a smaller and
  honest promise than the original design made.

## 8. Test results

### Storage contract — `areaCacheStorage.test.ts`, 26 pass

| Case | Result |
|---|---|
| 20 / 100 / 399 / 400 / 401 / 1000 candidates in one cell | all retained, all retrievable |
| **candidate #401 specifically** | stored and retrieved — the exact entry the old cap deleted |
| **candidate #1000 specifically** | stored and retrieved |
| canonical arriving last among 900 providers | survives; order is irrelevant now |
| 1200 candidates across 6 cells | 1200 retained, unique |
| restaurant in two overlapping cells | appears once |
| legacy-only / new-only / mixed cell | all read |
| same identity in both generations | returned once, subcollection wins |
| provider alias (legacy) vs canonical (subcollection) | collapses to canonical |
| unrelated nearby restaurant | NOT collapsed — no new fuzzy matching |
| paging 1000 by document id | every one reached once, stable order |
| document inserted mid-traversal | cannot duplicate an earlier page |
| empty page | ends traversal, no loop |
| 1000 writes | chunk 450/450/100, nothing dropped |

### Legacy cap guard — `cellCapScale.test.ts`, 5 pass

Includes the precondition proving the old insertion-order slice really did lose
the curated restaurant.

### Search pagination — `explore_pagination_controller_test.dart`, 15 pass

Unchanged by this work and re-verified: page 1 = 12 of 37, page 2 sends query +
cursor 12, no duplicate identity, query change resets, stale request discarded,
`endOfResults` stops — and 20 / 100 / 401 / 1000 page through completely.

The old guard `if (state.loading || state.endOfResults || _query.isNotEmpty)`
has **not** been reintroduced.

### Totals

| Suite | Result |
|---|---|
| functions `npm test` | **1432 pass / 0 fail** |
| functions `npm run build` | clean |
| Flutter `flutter test` | see final report |
| `flutter analyze` | see final report |

## 9. Functions affected — minimum deploy set

Traced by import closure over all 130 exports in `functions/src/index.ts`, then
cross-checked independently.

| Function | Why |
|---|---|
| `getSuggestions` | imports `areaCandidatePoolService` |
| `getNearbyPlaces` | imports `areaCandidatePoolService` |
| `controlCenterMasterPlaceAdminBridge` | now writes the candidate document |

**`nextSuggestion` is NOT affected** — its transitive import closure contains
neither module. The task brief suspected it might; the closure says otherwise.
127 other exports reach neither module.

### Downstream caveat (not a blocker, not fixed here)

`syncPlaceCoverageToControlCenter` and `syncPlaceReferencesToControlCenter` read
the parent document's `candidates` array. Under the new schema that array is a
frozen snapshot, so their coverage counts will **understate** reality once cells
grow past it. They import neither changed module, so they are not deploy-coupled.
`candidateCount` on the cell document carries the true total when someone teaches
them to read it. Flagged rather than changed, because it is outside this task.

## 10. Firestore rules and indexes

**Rules — prepared, NOT deployed.** Firestore rules do not cascade into
subcollections unless the match uses a recursive wildcard, and
`match /area_place_cache/{cacheKey}` does not. Without an explicit block the new
path would be governed only by the catch-all. Added to `firestore.rules`:

```
match /area_place_cache/{cacheKey} {
  allow read, write: if false;
  match /candidates/{candidateId} {
    allow read, write: if false;
  }
}
```

**Indexes — none required.** `__name__` ordering is served automatically.

> **OWNER AUTHORIZATION REQUIRED FOR PRODUCTION RULE/INDEX DEPLOY.**

## 11. Deployment

**NOTHING DEPLOYED.** The four PR #26 functions currently in production are
unchanged and still serving. The scalable storage is inert until the three
functions above are deployed and the rules block ships with them.
