# Place Data A1 — Index requirements

**Nothing was deployed. No speculative index was added.**

## Method

Every Firestore access in `domain/places/**`, `domain/rollout/**`, `services/**`
and `callable/**` was read and classified by shape. A composite index is needed
only for a query combining two range/equality fields, or equality + `orderBy` on
a different field.

## Active (deployed) read paths — **no composite index required**

The deployed callables reach Place Data almost entirely by **document id**, not
by query:

| Path | Shape | Class |
| --- | --- | --- |
| `canonicalReadService` → `place_migration_aliases` | `.doc(id).get()` | `SINGLE_FIELD_AUTOMATIC` |
| `canonicalReadService` → `place_registry` | `.doc(canonicalId).get()` | `SINGLE_FIELD_AUTOMATIC` |
| `canonicalReadService` → `place_publication_heads` | `.doc(canonicalId).get()` | `SINGLE_FIELD_AUTOMATIC` |
| `canonicalReadService` → `place_publications` | `.doc(activePubId).get()` | `SINGLE_FIELD_AUTOMATIC` |
| `expandedPoolService` → `places_pool_v3` | `.doc(cellId)` | `SINGLE_FIELD_AUTOMATIC` |
| `submitPlaceCorrection` → `place_correction_submissions` | one `where("submittedBy","==",…).limit(100)` | `SINGLE_FIELD_AUTOMATIC` |
| `submitPlaceCorrection` → alias / head / publication / details | `.doc(id).get()` | `SINGLE_FIELD_AUTOMATIC` |

**Composite indexes required by active queries: 0.**

That is a consequence of the canonical design — the alias chain resolves to an
id, and every subsequent hop is a point read. It is also why the pilot migration
needed no index deployment.

## Future, undeployed query surfaces

These repositories are written and tested but **not deployed**; their
collections are absent from production. They combine filters with ordering and
**will** need composite indexes when their phase deploys.

| Repository | `where` | `orderBy` | Class |
| --- | --- | --- | --- |
| `firestorePublicationRepository` | 7 | 5 | `REQUIRED_BY_FUTURE_UNDEPLOYED_QUERY` |
| `firestoreCoverageRepository` | 4 | 3 | `REQUIRED_BY_FUTURE_UNDEPLOYED_QUERY` |
| `firestoreDedupRepository` | 3 | 2 | `REQUIRED_BY_FUTURE_UNDEPLOYED_QUERY` |
| `firestoreRepository` (staging) | 3 | 2 | `REQUIRED_BY_FUTURE_UNDEPLOYED_QUERY` |
| `firestoreTagRepository` | 2 | 2 | `REQUIRED_BY_FUTURE_UNDEPLOYED_QUERY` |
| `firestoreCorrectionRepository` | 2 | 3 | `REQUIRED_BY_FUTURE_UNDEPLOYED_QUERY` |
| `firestoreMigrationRepository` | 1 | 0 | `SINGLE_FIELD_AUTOMATIC` |

Deriving their exact field tuples is deferred to the phase that deploys them —
writing index definitions now, against collections that do not exist and query
shapes that may still change, is precisely the speculative work this phase
forbids.

## Recommendation for the pilot closure

**Deploy no index.** The closure changes batch metadata and rules only; it adds
no query. The 15 pre-existing production indexes and the 4 PD-1 `events`
indexes are untouched.
