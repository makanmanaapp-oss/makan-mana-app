# Area cache scalability — removing the restaurant ceiling

**Status: DESIGN + INTERIM GUARD SHIPPED IN SOURCE. SCHEMA MIGRATION NOT IMPLEMENTED.**
**DEPLOYMENT REQUIRES OWNER AUTHORIZATION.**

---

## 1. The defect, precisely

`functions/src/services/areaCandidatePoolService.ts`, `persistDiscovered`:

```ts
const list = dedupeCanonicalCandidates(cands).slice(0, MAX_CANDIDATES_PER_CELL); // 400
batch.set(db.collection("area_place_cache").doc(cellId),
  { cellId, candidates: list, lastDiscoveryAt: now, updatedAt: now },
  { merge: true });
```

Two separate problems.

**a) The slice is destructive, not cosmetic.** `merge: true` merges *fields*, and
`candidates` is one field holding an array. Writing a 400-item array replaces the
whole array. Candidate #401 is not "hidden until later" — it is written out of
the cell.

**b) Order decides who dies, and order is arbitrary.**
`dedupeCanonicalCandidates` preserves **insertion order**; it does not rank or
sort. So whether a published registry restaurant survives depended on where it
happened to land in the discovery array. A newly published restaurant appended
last in a dense cell was dropped first.

This is proven, not inferred — `cellCapScale.test.ts` asserts the precondition:
with 500 provider candidates discovered before the curated one, the old
insertion-order slice loses `PLC-testkitchen`.

## 2. What shipped now (no schema change)

`orderCanonicalFirst()` — a **stable partition** placing direct-canonical
(registry) candidates ahead of provider candidates, each group keeping its
relative order. A partition, not a sort: dedupe order carries ranking meaning
for provider candidates and a comparator would scramble it.

Effect: the cap can no longer cost an authoritative registry restaurant.
Provider candidates are rediscoverable from the provider; a curated restaurant
that silently vanishes is not.

**This does not remove the cap.** A dense cell still stops at 400 entries. It
only guarantees the entry sacrificed is never a registry record. 5 tests.

Files: `canonicalCandidatePool.ts` (pure helper), `areaCandidatePoolService.ts`
(call site). No schema, no rules, no indexes.

## 3. Why not just raise 400 → 10,000

Rejected, as the owner anticipated. A Firestore document is capped at ~1 MiB.
A candidate carries name, address, photoUrl, openingPeriods, matchReasonKeys —
measured against the live cache, entries average well over 1 KB. 10,000 would
blow the document limit, and long before that every discovery write would
rewrite a multi-hundred-KB array, and every read would transfer it.

The array itself is the wrong shape. The fix is to stop storing an unbounded
list inside one document.

## 4. Target schema — subcollection, one document per candidate

```
area_place_cache/{cellId}                       // metadata only
  cellId, lastDiscoveryAt, updatedAt, candidateCount, schemaVersion: 2

area_place_cache/{cellId}/candidates/{identity} // one doc per restaurant
  placeId, canonicalPlaceId, dataSource, name, cuisine, address,
  lat, lng, rating, userRatingCount, priceLevel, photoUrl,
  openingPeriods, isDirectCanonical: bool, updatedAt
```

`{identity}` is the existing stable key — `canonicalPlaceId` when known,
otherwise `placeId` — so the document id *is* the dedupe key. Two writers
racing on the same restaurant converge on one document instead of appending
twice.

Chosen over `shards/{shardId}` because:

- dedupe becomes a primary-key property rather than an array scan;
- a single restaurant updates without rewriting its neighbours;
- reads paginate natively with `orderBy` + `startAfter`;
- no shard-rebalancing logic, which is its own source of loss.

Sharding remains the fallback if per-document read cost ever dominates.

### Reads

Radius-aware behaviour is unchanged: cells are still selected geographically by
`storageCellForPlace`. Within the selected cells, candidates are read with a
bounded page size and `startAfter`, and `isDirectCanonical desc` keeps canonical
first for ranking. The cap disappears because nothing needs to fit in one
document.

## 5. Migration and backward compatibility

Non-destructive, reversible, and it never deletes the v1 array.

1. **Dual-read.** Reader loads the subcollection; if `schemaVersion != 2`, it
   falls back to the legacy `candidates` array. Both paths already produce
   `PlaceCandidate[]`, so ranking, dedupe and search are untouched.
2. **Dual-write.** Discovery writes the subcollection *and* keeps refreshing the
   legacy array (still capped at 400, still canonical-first) so a rollback loses
   nothing.
3. **Backfill.** A one-off job copies each cell's array into its subcollection
   and stamps `schemaVersion: 2`. Idempotent: the identity key means re-running
   overwrites rather than duplicates.
4. **Cutover.** Once every live cell reports `schemaVersion: 2`, stop the dual
   write. The legacy array stays until the owner authorizes its removal.

Rollback at any stage: revert the reader. The v1 array is still current.

## 6. Indexes and rules — NOT DEPLOYED

A collection-group or per-collection index is likely needed for
`orderBy(isDirectCanonical desc, updatedAt desc)` with `startAfter`.
`area_place_cache` is server-written and client-unreadable today; a subcollection
inherits no rule automatically, so `firestore.rules` needs a matching
`match /area_place_cache/{cellId}/candidates/{id} { allow read, write: if false; }`
to preserve the existing default-deny posture.

**Neither has been written or deployed. DEPLOYMENT REQUIRES OWNER AUTHORIZATION.**

## 7. What this does and does not change

Unchanged: registry is authoritative and unbounded; area cache stays an
acceleration layer; Explore pages at 12; Search filters the full pool then
paginates; Spin may keep a bounded session pool (a 30-alternative session is a
session size, never a claim about how many restaurants exist).

Changed: a cell can grow past 400 without a restaurant being written out of
existence.

## 8. Deployment impact

`areaCandidatePoolService.ts` is consumed by `getSuggestions` and
`getNearbyPlaces`. The interim guard therefore changes two of the four deployed
functions. Per the current instruction those were **not** redeployed. The guard
is inert until they are.

**Deploying it needs owner authorization**, and should be the same narrow
two-function deploy, not a broad one.
