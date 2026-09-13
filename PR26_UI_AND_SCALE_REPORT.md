# PR #26 — UI reconciliation + unlimited discovery

Branch: `fix/pr26-ui-unlimited-discovery-20260913`
Base:   `cd4a04f00d9ab0e631fd119efabcc304284bdc3c` (merged PR #26)
Approved baseline: `rescue/ui-baseline-2026-09-07` @ `0a952416ff1ef66d6836dac49339084a2883f5c5`

Statuses are only PASS / FAIL / BLOCKED / NOT RUN.

---

## 1. UI reconciliation — PASS (1 regression found and fixed)

Full evidence in `UI_RECONCILIATION_MATRIX.md`. The headline is that the premise
did not survive contact with the diff:

- Branches diverge at `60f6bf1`: rescue **3** commits, PR #26 **178**. Rescue is
  a preservation branch, not a newer one.
- **Zero** `lib/` or `test/` files exist in rescue but not PR #26. PR #26 adds 26.
- **The approved goldens are byte-identical** across both commits.
- `lib/features`: 47 files differ, **7,183 insertions vs 635 deletions** —
  overwhelmingly PR #26 *adding* Wave 3–6 work.
- **182 approved tests pass unmodified on PR #26**, including
  `main_navigation_pager`, "Activity swipes through tabs and keeps chips in
  sync", "tapping a chip moves Activity content without refetching",
  Home hero voice, Home layout order, Profile redesign, Malaysia state resolver,
  location consistency, history edge-swipe handoff.
- `app_shell.dart`, History, Groups and Food Profile are **byte-identical** —
  the shell was already correct and was not touched.

### The one proven regression — FIXED

Settings lost the "Notifikasi (PROMPT 4)" section.

| `RoutePaths.notificationSettings` | rescue | PR26 (before) | now |
|---|---|---|---|
| Settings | 1 | **0** | 1 |
| Activity | 1 | 1 | 1 |

Never a dead feature — the route and screen survived and Activity still linked
to it. What was lost is one approved entry point, in the place users look for
settings. Restored verbatim between Appearance and Language, `firebaseReady`
gate intact. Commit `ddd40f7`.

### What was deliberately NOT reverted

Everything else differing is later intentional work: the Wave 5 CMS slot (which
renders nothing without an eligible banner), `homeClockProvider`, the Merchant
Center profile entry, Wave 3C live quote reads, `markOpened`→`markRead`, and the
Explore search delegation + `canonicalPlaceId ?? placeId` route — the last two
being PR #26 itself. Reverting any of it would undo PR #26 (Section N).

### Not a UI regression: the older Restaurant Detail seen on device

Canonical Restaurant Detail is gated behind a debug/QA flag on this lineage, so a
release build renders the legacy layout. That is a flag state, not lost UI code.

---

## 2. Search pagination — PASS

`ExplorePaginationController.loadMore()` bailed on `_query.isNotEmpty`, capping
every search at the first server page (12). That read as "MakanMana only has 12
matching restaurants".

The server was never the limit: `getNearbyPlaces` runs
`searchCanonicalCandidates` over the **full ranked pool** and only then calls
`paginateRanked(ranked, cursor, 12)`, returning `nextCursor` / `endOfResults`.
`_fetch` already carried both query and cursor. The client guard was the entire
cap, so removing it is the whole fix. Commit `3d6eb35`.

15 tests, all passing:

| Requirement (Section I) | Test |
|---|---|
| query with >12 matches | S1 — 37 matches, page 1 = 12 |
| page 1 = 12 | S1 |
| page 2 adds remaining | S2 — 24 after page 2, query + cursor 12 both sent |
| no duplicate identity across pages | S3 — 37 unique, ends |
| changing query resets cursor/results | S4 |
| stale request cannot overwrite | S5 — in-flight old page discarded |
| endOfResults stops correctly | S6 |

Plus scale: **20 / 100 / 401 / 1000** restaurants each page through completely,
no loss, no duplicates. 401 is deliberate — past `MAX_CANDIDATES_PER_CELL`.

---

## 3. Explore pagination — PASS (unchanged, already correct)

12 is a page size, not a ceiling: page 1 → 12, page 2 → next 12, until
`endOfResults`. Existing tests cover append, cross-page dedupe and termination.

---

## 4. Restaurant scalability — PARTIAL (guard shipped, ceiling remains by design)

Two defects found in `persistDiscovered`:

1. `.slice(0, 400)` followed by `set()` — because `candidates` is one array
   field, candidate #401 is **written out of the cell**, not merely hidden.
2. `dedupeCanonicalCandidates` preserves **insertion order**, not rank — so a
   newly published registry restaurant appended last in a dense cell was
   dropped first.

`orderCanonicalFirst()` (stable partition, canonical first) guarantees the entry
sacrificed is never an authoritative registry record. 5 tests, including a
precondition proving the old slice really did lose the curated restaurant.
Commit `0edea0a`.

**The cap itself is NOT removed.** The schema that removes it — per-candidate
subcollection, dual read/write, idempotent backfill, reversible cutover — is
designed in `AREA_CACHE_SCALABILITY_DESIGN.md` and is **NOT implemented**.
Any index/rules it needs are marked **DEPLOYMENT REQUIRES OWNER AUTHORIZATION**.

---

## 5. Canonical PR #26 behaviour — PASS (preserved)

`placeId == canonicalPlaceId` for direct canonical, `dataSource = canonical`,
canonical/provider dedupe (exact normalized name, ≤35 m, one side canonical),
full-pool search before pagination, canonical detail route, bounded curated
bonus `0.015`, Reject/Next canonical identity. Functions suite **1406 pass**.

---

## 6. Validation — PASS

| Check | Result |
|---|---|
| `flutter analyze` | **No issues found** |
| `flutter test` | **1541 pass** |
| functions `npm run build` | clean |
| functions `npm test` | **1406 pass** |
| `git diff --check` | clean |

---

## 7. Samsung A05 visual QA — PARTIAL

Device `R93W904ASMH device`. APK built from this branch,
SHA256 `3f15b37fa20ea3214e3f92535af99878133225e235534c95deb5bdfa335c1b5b`,
signer `ed9aaf48…` matching the installed app, `adb install -r` → Success.
Not uninstalled, data not cleared. Production `com.makanmana.apps` 0.1.8(13)
untouched.

| Screen | Status | Evidence |
|---|---|---|
| Boot | **PASS** | 0 FATAL EXCEPTION, process alive |
| Home | **PASS** | approved layout: hero, greeting, location chip, Spin, mood chips, suggestion card |
| Profile | **PASS** | approved sectioned redesign + Merchant Center entry |
| Settings | **PASS** | restored **Notifikasi** section visible between Penampilan and Bahasa |
| Notification Settings | **PASS** | opens from the restored entry; push/in-app toggles + per-category controls render |
| Explore | **PASS** | list renders, no duplicates |
| Explore search | **PARTIAL** | results render and scroll past the old 12-cap, list terminates cleanly — but see below |
| Activity, Social, Compose, History, Groups, swipe nav | **NOT RUN** | widget tests pass; not re-photographed |

### Why search pagination is PARTIAL on device, not PASS

Server logs for this session show `areaPoolTotal: 27`, `activePlaceCount: 24` —
the eligible pool at that location holds **27 restaurants**. A search there spans
about two pages: enough to cross the old cap, too small to demonstrate scale
convincingly. Flutter renders to a canvas with no accessibility text, so the row
count could not be asserted programmatically.

The behaviour is proven conclusively by the 15 unit tests. On-device it is
**consistent with** the fix, not independently proven. Called PARTIAL, not PASS.

---

## 8. Test Kitchen E2E — NOT RUN (deferred by instruction)

Still an unpublished draft (`registry_status=draft`, null coordinates, null
canonical id, 20 menu items intact). Publication is gated behind an
authenticated Control Center action plus production-write/external-action env
gates. Deferred per Section Q until this build is accepted.

---

## 9. Deployment status — NOTHING DEPLOYED

The four PR #26 functions were **not** redeployed. The cell-cap guard touches
`areaCandidatePoolService.ts`, consumed by `getSuggestions` and
`getNearbyPlaces`, so it is inert in production until authorized. No rules, no
indexes, no storage rules, no AAB, no Play release.

## 10. Safety

Main dirty checkout untouched (`rescue/ui-baseline-2026-09-07` @ `0a952416…`,
350 uncommitted entries). The rescue branch was read only, never modified. All
work isolated in `makan_mana-pr26-ui-scale-20260913`.

## 11. Honest readiness

UI reconciliation and search pagination are done and evidenced. Restaurant
scalability is **half** done: registry restaurants can no longer be deleted by
the cap, but the cap still exists and its removal is designed, not built.
Device visual QA covers the changed screens; the rest is untested, not passed.

**Do not call this ready.** Remaining: sharding implementation + migration,
device re-check of the untested screens, and the whole Test Kitchen E2E chain.
