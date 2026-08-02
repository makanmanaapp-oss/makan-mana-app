# MakanMana Part 1 — Phase 1.7
# Shared Place Database, Coverage Cells & Approved Area Read Engine

**Status: EMULATOR-ONLY. The production mobile app still uses the existing `places_cache` and `place_details` path.**

This phase builds the Shared Place Database foundation described in PDF §5, so
approved coverage discovered for one user is reusable by every other user. It
follows Phases 1.1–1.6.

Everything is **additive**. `functions/src/index.ts` does not import the coverage
module, so the production path is untouched:

```
Google Places → places_cache / place_details → PlaceCandidate / PlaceSummary → Flutter cards
```

---

## 1. Geographic cell system

Source: `functions/src/domain/places/coverage/geohash.ts`

We implement a **small deterministic base32 geohash** rather than adding a
dependency. Geohash is a widely documented, stable grid: each base32 character
adds 5 bits, alternating longitude/latitude starting with longitude.

- `cellSystem` = `geohash_base32`
- Supported resolutions: 1–12 characters
- Default resolution: **6** (≈1.2 km × 0.6 km) — a meaningful urban
  "neighbourhood" that keeps the neighbour ring small

PDF §5.3 requires cell IDs that are *stable and not based on raw coordinates
that change too finely*. Raw latitude/longitude **never** becomes a document ID.

## 2. Stable cell IDs

`getCoverageCellId(lat, lng, resolution)` — pure, deterministic, identical for
every user at the same coordinate. Invalid coordinates throw
`InvalidCoordinateError`; malformed cell IDs throw `InvalidCellIdError`.

Companion helpers: `getCoverageCellCenter(cellId)`,
`getCoverageCellBounds(cellId)`. Coarse resolutions are prefixes of finer ones,
which makes hierarchical widening cheap.

## 3. Neighbour resolution

`getNeighboringCoverageCells(cellId)` returns **at most 8** cells in the fixed
order **N, NE, E, SE, S, SW, W, NW**. The centre cell is **excluded**
consistently; `getSearchableCellIds(cellId)` returns centre-first plus the eight
neighbours (≤9, no duplicates).

Latitudes are clamped at the poles and longitudes wrap across the antimeridian,
so results are always valid and bounded. Duplicates (which occur near the poles)
are removed.

`resolutionForRadius()` picks a resolution coarse enough that the 3×3 ring
covers the requested radius, and `getQueryCellIds()` caps the result at
`MAX_QUERIED_CELLS = 49`.

## 4. Place membership

`PlaceCoverageMembership` (`coverageMembership.ts`) holds `placeId`,
`publicationId`, `publicationVersion`, one canonical `homeCellId`, the
`searchableCellIds` list, the **exact** `lat`/`lng`, `placeStatus`,
`eligibilityState`, `indexedAt`, `contentHash`, `coverageVersion` and
`sourcePublicationHash`.

Rules enforced:

- exactly **one** canonical home cell per place
- neighbouring searchable cells allowed, deduplicated
- exact coordinates retained **because radius filtering needs them**
- merged aliases never become independent memberships
- a moved place produces a new membership (home cell recomputed)
- hidden/blocked publications remove the membership
- membership derives from the **active publication only**

`membershipContentHash()` deliberately excludes `indexedAt` and
`coverageVersion` so re-indexing identical content is idempotent.

## 5. Coverage cells

`PlaceCoverageCell` carries `cellId`, `cellSystem`, `cellResolution`,
`centerLat`/`centerLng`, `boundingBox`, `neighboringCellIds`,
`activePlaceCount`, `publishedPlaceIds`, `coverageVersion`, `freshnessSummary`,
`categoryCoverage`, `cuisineCoverage`, `sourceCoverage`, optional
`lastDiscoveryAt` / `lastRefreshAt` / `nextRefreshAt`, `createdAt`, `updatedAt`.

`PlaceCoveragePool` (Part D) describes a multi-cell pool with `source` one of
`approved_database`, `approved_cache`, `partial_coverage`, `empty_coverage`. It
never contains raw staging records or dummy/sample data.

## 6. Publication-head indexing

`evaluateIndexingDecision(head, version, location, ctx)` is a **pure** gate.
A publication enters public coverage only when **all** hold:

1. it is the **active head** for that place
2. `publicationStatus === "published"`
3. its Phase 1.6 eligibility snapshot is `eligible`
4. it has **no** critical-expired freshness fields
5. it is not a merged/superseded alias
6. the business display state is public (not `blockedFromPublic`)
7. the coordinates are valid

Explicitly **not indexed**: draft, needs_review, approved-but-unpublished,
hidden, stale, superseded, rejected, permanently closed, merged alias, and
critical-expired blocked publications.

Temporarily closed places **are** indexed but carry
`primarySuggestionEligible: false` — they are excluded from area reads unless
explicitly requested.

`indexPublishedPlaceIntoCoverage()` then derives the cells, upserts the
membership idempotently, recomputes affected cells and their category/cuisine/
source metrics, appends a cache-invalidation event, and preserves the
publication version reference. If a previously indexed place becomes
ineligible, its membership is **removed**.

## 7. Exact radius filtering

**Non-negotiable rule #1.** `getPublishedPlacesByArea` runs a 13-step pipeline:
validate → centre cell → bounded neighbours → load memberships → dedupe by
canonical `placeId` → resolve active publication heads → exclude blocked
status/publication → **exact Haversine distance** → **exact radius filter** →
optional place-type/cuisine filters → deterministic sort → bounded pagination →
approved snapshots.

Cells are only a coarse pre-filter. Two tests prove this directly: a place in
the **same** cell but outside the radius is excluded, and a place in a
**neighbour** cell but inside the radius is included. The exclusion test derives
its far point from the actual cell bounds, so it cannot silently degrade.

Step 7 re-checks the live publication rather than trusting the membership, so a
stale membership can never leak data.

## 8. Browse sort

**Phase 1.7 area read only — this is not Part 2 recommendation ranking.**

1. distance ascending
2. completeness descending
3. rating evidence confidence descending
4. canonical `placeId` ascending — final tie-break

No mood, Food Memory, budget or Fit weighting is applied anywhere in this phase.

## 9. Coverage versioning

`coverageVersionFromMembers(members)` hashes the **set** of
`{placeId, publicationId, publicationVersion}` after sorting by `placeId`.
Properties, each covered by a test:

- **idempotent** — same mutation twice → same version
- **order-independent** — same set in a different order → same version
- **content-sensitive** — different membership set → different version
- **not wall-clock** — recomputation alone never changes the version
- usable directly inside cache keys

`calculateCoverageVersion(previousVersion, mutation, members)` returns the new
version plus a `changed` flag. `applyCoverageMutation` implements the Part E
mutation list: publication activated/superseded, rollback executed, hidden,
restored, permanently closed, moved, merge executed, tag coverage changed, media
changed, critical freshness blocked.

`combinedCoverageVersion(versionsByCell)` produces the pool version used in
cache keys (PDF §5.3: *card cache key mesti termasuk coveragePoolVersion*).

## 10. Coverage metrics

`CoverageMetrics` holds `cellId`, `activePublishedPlaces`, `placeTypeCounts`,
`cuisineCounts`, `mealSlotCounts`, `sourceTypeCounts`, `stalePlaceCount`,
`expiredCriticalCount`, `duplicateCandidateCount`, `missingImageCount`,
`unknownPriceCount`, `unknownHoursCount`, `lastComputedAt`, `coverageVersion`.

Metrics are **internal/admin only**. `FORBIDDEN_METRIC_FIELDS` lists identifiers
that must never appear (uid, userId, userLat/userLng, email, displayName,
moodId, favorites, history, deviceId); a test serialises the metrics and asserts
none of them are present.

## 11. Coverage-health policy

`evaluateCoverageHealth(metrics, config, now)` → `healthState`, `incomplete`,
`discoveryRequired`, `refreshRequired`, `reasons[]`, `priority`.

Precedence: **empty → critical → stale → low → adequate → healthy**.

| Config | Default |
| --- | --- |
| `minimumPlacesForCoveredCell` | 5 |
| `targetPlacesForHealthyCell` | 12 |
| `minimumCuisineDiversity` | 3 |
| `minimumPlaceTypeDiversity` | 2 |
| `maxCoverageAgeMs` | 14 days |
| `criticalExpiredRatio` | 0.25 |
| `unknownHoursRatio` | 0.5 |
| `unknownPriceRatio` | 0.6 |

**The product target of 100 places is deliberately not a per-cell rule.** An
area pool spans up to nine neighbouring cells, so a per-cell healthy target of
12 already exceeds 100 places across the pool while remaining configurable. A
test asserts both properties.

## 12. Discovery queue

`PlaceDiscoveryRequest` carries `requestId`, `cellId`, `neighboringCellIds`,
`reason`, `requestedAt`, `requestedBySystem`, `priority`, `status`,
`attemptCount`, optional `nextAttemptAt` / `lastErrorCode`, `providerScope` and
`idempotencyKey`.

- Reasons: `empty_coverage`, `low_coverage`, `stale_coverage`,
  `missing_category`, `user_area_request`, `scheduled_refresh`,
  `critical_expiry`
- Statuses: `queued`, `processing`, `completed`, `partially_completed`,
  `failed`, `cancelled` (failed/partial may be re-queued)
- `idempotencyKey` = hash(cell, reason, providerScope) — no timestamp, so repeat
  requests never duplicate
- `requestedBySystem` records a **system**, never a user id

**Area reads never wait for discovery.** The read enqueues and returns
approved coverage immediately; if enqueueing throws, the approved results are
still returned with a `discovery_enqueue_failed` warning. **No Google Places
call is made in this phase.**

## 13. Area cache

`AreaPlaceCacheEntry` holds `cacheKey`, `centerCellId`, `queriedCellIds`,
`radiusBucket`, `filterHash`, `publicationPoolVersion`, `placeIds`,
`publicationIds`, `generatedAt`, `expiresAt`, `sourceMode`.

The cache key combines **cell + radius bucket + canonical filter hash + pool
version**. Raw coordinates are never the key: two users metres apart in the same
cell and radius bucket produce the *same* key — which is exactly what makes the
database shared. Changing the coverage version yields a different key, and
`isCacheEntryUsable()` additionally rejects entries whose pool version no longer
matches or whose TTL (15 min default) has passed.

## 14. Pagination

Opaque base64url cursor containing `poolVersion`, `requestHash`, `lastPlaceId`
and `offset`.

- `maxResults` bounded by `MAX_AREA_RESULTS = 50`
- a changed coverage version → `stale_page_token`
- a token from a different request shape → `page_token_request_mismatch`
- a malformed token → `invalid_page_token`
- duplicate place IDs never appear across pages (test walks three pages)

## 15. Security boundary

`firestore.rules` gains explicit `allow read, write: if false` for
`food_coverage_cells`, `place_coverage_memberships`, `coverage_metrics`,
`place_discovery_queue` and `area_place_cache`. Equivalent to the catch-all,
added for auditability; nothing existing was loosened and **no browser-admin
direct access was added**.

Verified from a real client perspective with `@firebase/rules-unit-testing`:
authenticated and unauthenticated users cannot read, write, query, enqueue
discovery, alter coverage versions, write cache or alter metrics. A regression
test confirms `places_cache` remains readable-when-signed-in and non-writable.

The future mobile read must go through a trusted backend, **not** direct broad
collection queries.

## 16. Golden scenarios

| # | Scenario | Result |
| --- | --- | --- |
| A | User A searches an area with approved coverage | reads existing pool, no provider wait |
| B | User B enters the same area | identical queried cells, coverage versions and publication IDs |
| C | 20 approved places, discovery queued | 20 returned immediately, discovery separate and idempotent |
| D | Neighbour-cell restaurant inside exact radius | included |
| E | Same-cell restaurant outside exact radius | excluded |
| F | Place hidden after publication | membership removed, version changed, cache invalidated |
| G | Restaurant moves | old membership removed, new home cell, publication history preserved |
| H | Membership spans several cells | one canonical result |
| I | Empty area | honest empty response, discovery queued, **no dummy restaurants** |
| J | Discovery provider fails | approved coverage still readable and intact |

## 17. Emulator-only status

No production integration occurred. `functions/src/index.ts` does not import the
coverage module and no file outside `coverage/` references it. No
`place_registry`, `places_cache` or `place_details` document was written — an
emulator test asserts those collections stay empty after indexing. No Google
Places call was made. No deployment was performed.

## 18. Future dependency — Phase 1.8 (admin coverage map)

Phase 1.8 will render `PlaceCoverageCell` + `CoverageMetrics` +
`evaluateCoverageHealth` as an admin coverage map, and drive the discovery queue
from `discoveryRequired` / `refreshRequired` with `priority`. `reasons[]` is
designed to be shown directly as admin to-dos.

## 19. Future dependency — Phase 1.9 (Flutter card / read path)

Phase 1.9 will switch the mobile read to `getPublishedPlacesByArea` behind a
trusted backend callable and map `AreaPlaceResult.snapshot.displayState`
(Phase 1.6 honest display state) onto the card. The invariant to carry forward:
the client renders the derived state and never recomputes `open_now`, price or
rating from raw fields; the browse sort here is **not** the final ranking.

## 20. Future dependency — Phase 1.12 (legacy migration)

Phase 1.12 will map existing `places_cache` / `place_details` records into
canonical places, then publish and index them. `PlaceAlias` of type
`google_place_id` (Phase 1.4) keeps user favourites and deep links intact while
`PlaceLocation.canonicalCellId` gets backfilled from `getCoverageCellId`.

## 21. Explicit statement

> **The production mobile app still uses the existing `places_cache` and
> `place_details` path.**

---

## Phase 1.14C.1 update — new trusted location fields on place_details
Enrichment adds (merge-only) provider-derived fields to `place_details`:
`location{latitude,longitude}`, `formattedAddress`, `businessStatus`,
`regularOpeningHours`, `currentOpeningHours`, `googleMapsUri`, plus provenance
(`locationSource=google_places_details`, `locationSourceApi`, `locationFieldMask`,
`locationResponseChecksum`, `enrichmentSchemaVersion`) and freshness
(`providerFetchedAt`, `locationVerifiedAt`, `locationFreshUntil`). Legacy fields
(displayName/rating/userRatingCount/priceLevel/photoUrl/lastFetchedAt) are
preserved. `places_cache` remains an area cache and is never per-place truth.
The trusted-correction view now reads `formattedAddress`.

---

## Phase 1.14C-R + 1.14D closeout (PARTIAL PASS)
Repeat zero-write dry-run: SAFE 25 / HELD 600 / CONFLICT 1, two-run checksum identical, zero writes. Locked 25-SAFE batch executed via the APPROVED emulator-only executor (25 migrated, idempotent, marker=emulator_complete, rollback proven); production canonical collections stayed 0. Canonical migration to production is impossible with approved tooling (emulator-only by Phase 1.12 design) and forbidden to rebuild here. Trusted callable is deploy-ready but NOT deployed (owner chose PARTIAL PASS; needs dedicated-SA wiring + IAM actAs grant). Production stays legacyOnly, all flags OFF, App Check enforcement OFF, no restore, no Play upload. See MAKANMANA_PART1_FINAL_CLOSEOUT.md.
