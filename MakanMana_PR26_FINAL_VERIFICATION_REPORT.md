# MakanMana PR #26 — final verification report

Branch `fix/pr26-ui-unlimited-discovery-20260913`, base `cd4a04f0` (merged PR #26).
Statuses are only PASS / FAIL / BLOCKED / NOT RUN / PARTIAL / DEFERRED.

**NOTHING IN THIS BRANCH IS DEPLOYED.**

---

## Summary

| Area | Status |
|---|---|
| CODE | **PASS** |
| AUTOMATED TESTS | **PASS** |
| SAMSUNG DEVICE | **PASS** (20/20 checks) |
| SCALABILITY | **PASS** |
| FUNCTION DEPLOYMENT | **PENDING OWNER AUTHORIZATION** |
| RULES / INDEXES | **PENDING OWNER AUTHORIZATION** (rules only; no indexes needed) |
| TEST KITCHEN | **DEFERRED** |
| PRODUCTION AAB | **NOT TOUCHED** |
| PLAY RELEASE | **NOT TOUCHED** |

This is **not** a claim that MakanMana is 100% ready. Final production
verification and the Test Kitchen canonical E2E happen only after deployment is
authorized.

---

## 1. Owner decision package

**Branch** `fix/pr26-ui-unlimited-discovery-20260913`
**HEAD** `1c1de61` (+ this report)

### Changed files and why

| File | Why |
|---|---|
| `functions/src/domain/places/coverage/areaCacheStorage.ts` | NEW. Pure storage contract: identity scheme, legacy+new merge, cursor, batch chunking. Pure so 401/1000 are testable without Firestore. |
| `functions/src/domain/places/coverage/__tests__/areaCacheStorage.test.ts` | NEW. 26 tests incl. #401 and #1000 proven individually. |
| `functions/src/services/areaCandidatePoolService.ts` | Writes one document per candidate; paged subcollection read; merges both generations; legacy array frozen; idempotent backfill added. |
| `functions/src/controlCenter/masterPlaceAdminBridge.ts` | Publication writes the candidate document in the same transaction, so a published restaurant lands in authoritative storage. |
| `firestore.rules` | Explicit nested block for the subcollection. Rules do NOT cascade without a recursive wildcard. **PREPARED, NOT DEPLOYED.** |
| `functions/src/domain/places/canonical/canonicalCandidatePool.ts` | (earlier commit) `orderCanonicalFirst`, now demoted to legacy-array/backfill ordering. |
| `lib/features/explore/explore_pagination_controller.dart` | (earlier commit) search pagination unblocked. |
| `lib/features/settings/settings_screen.dart` | (earlier commit) restored Notification Settings entry. |
| `SCALABLE_AREA_CACHE_IMPLEMENTATION_REPORT.md`, `UI_RECONCILIATION_MATRIX.md`, `AREA_CACHE_SCALABILITY_DESIGN.md`, `PR26_UI_AND_SCALE_REPORT.md` | Documentation. |

### Test totals

| Suite | Result |
|---|---|
| `flutter analyze` | **No issues found** |
| `flutter test` | **1541 pass / 0 fail** |
| functions `npm run build` | clean |
| functions `npm test` | **1432 pass / 0 fail** |
| `git diff --check` | clean |

### Proof candidate #401 survives

`areaCacheStorage.test.ts` test 5: 401 candidates written, the 401st looked up
by its exact document id, found in storage AND after the read-path merge. The
comment records what it is — the exact entry the old cap deleted.

### Proof candidate #1000 survives

Test 6: 1000 candidates, the 1000th found by id, merged pool length exactly
1000. Test 11 additionally pages all 1000 by document id and asserts every one
is reached exactly once in stable order.

### Search pagination proof

15 tests in `explore_pagination_controller_test.dart`: page 1 = 12 of 37; page 2
sends query **and** cursor 12; no duplicate identity; query change resets cursor
and results; a stale in-flight page cannot overwrite a newer query;
`endOfResults` stops paging; 20 / 100 / 401 / 1000 all traverse completely.
The old guard `|| _query.isNotEmpty` has **not** been reintroduced.

### Minimum Functions deploy list

1. `getSuggestions`
2. `getNearbyPlaces`
3. `controlCenterMasterPlaceAdminBridge`

**`nextSuggestion` is NOT in the set** — its transitive import closure contains
neither changed module. Verified by closure over all 130 exports in
`functions/src/index.ts`, and independently by grep.

### Firestore rules / indexes

- **Rules:** nested `match /candidates/{candidateId} { allow read, write: if false; }`.
  Required because rules do not cascade into subcollections without a recursive
  wildcard, and the existing match has none.
- **Indexes:** **none.** `__name__` ordering is served automatically.

> **OWNER AUTHORIZATION REQUIRED FOR PRODUCTION RULE DEPLOY.**

### Rollback plan

1. **Functions:** redeploy the three from `cd4a04f0`, or roll Cloud Run back to
   `getsuggestions-00049-vom`, `getnearbyplaces-00023-xeb`,
   `controlcentermasterplaceadminbridge-00002-dah` (the revisions currently live).
2. **Rules:** re-deploy the previous `firestore.rules`. The subcollection then
   falls to the catch-all, which is also deny.
3. **Data:** nothing is deleted by this change. The legacy array is frozen, not
   removed, so the old reader still finds the pre-migration snapshot. Candidates
   discovered after cutover live only in the subcollection — rollback means
   returning to the pre-migration snapshot, which is a smaller and honest
   promise than "loses nothing".

### Commands that WOULD be run after authorization — NOT EXECUTED

```
# 1. functions (exactly three, never a broad deploy)
firebase deploy --project makanmana-c59f3 \
  --only "functions:getSuggestions,functions:getNearbyPlaces,functions:controlCenterMasterPlaceAdminBridge"

# 2. rules (separate, deliberate step)
firebase deploy --project makanmana-c59f3 --only firestore:rules

# 3. backfill — operator-invoked, idempotent, never automatic
#    backfillCellCandidates(cellId, Date.now()) per cell
```

---

## 2. UI status — no broad revert performed

Per the correction, no broad UI reconciliation was done. The premise had been
disproven by diff, goldens, tests and device evidence:

- rescue is a preservation branch (3 commits vs PR #26's 178);
- zero approved `lib/`/`test/` files are missing from PR #26;
- approved goldens are **byte-identical**;
- 182 approved tests pass unmodified on PR #26;
- `app_shell`, History, Groups, Food Profile are byte-identical.

The single proven regression — Settings losing its Notification Settings entry —
remains restored and is re-verified on device in this build.

## 3. Restaurant Detail feature flag — EXPECTED STATE, not a regression

| Question | Answer |
|---|---|
| Flag | `RestaurantDetailFlags.canonicalRestaurantDetailEnabled` |
| Default | `false` |
| QA activation | `qaCanonicalDetailAllowed` — `if (!isDebugBuild) return false;` **and** flavor must be `qa` |
| Cohort activation | `evaluateInternalCohort` — `if (!isDebugBuild)` returns `eligible: false`, reason string literally `release_build_public_stays_legacy_only` |
| Production intended | legacy detail; canonical stays off |
| Canonical route | `/restaurant/:id` renders `CanonicalRestaurantDetailScreen` only when the flag is on |
| Fallback path | legacy redesign layout in `restaurant_detail_screen.dart` |

Both activation paths hard-gate on `isDebugBuild`, so **any** `--release` build —
QA or production — renders legacy Restaurant Detail. The code names this outcome
itself. **EXPECTED DEBUG/QA FLAG STATE. Not modified.**

## 4. Samsung A05 physical QA — PASS (20/20)

Device `R93W904ASMH`. APK from this branch, SHA256
`fab2d701667cdffb51e83145aebb4c308394011c0aa5f7f3d93e79da3dbbf9c1`,
signer `ed9aaf48…` matching the installed app. `adb install -r` → Success.
**Not uninstalled. Data not cleared.** Production `com.makanmana.apps` 0.1.8(13)
untouched throughout.

| # | Check | Status |
|---|---|---|
| 1 | Boot | **PASS** |
| 2 | Home | **PASS** — approved layout |
| 3 | Profile | **PASS** — sectioned redesign |
| 4 | Settings | **PASS** |
| 5 | Settings → Notification Settings | **PASS** — restored entry present |
| 6 | Notification Settings full screen | **PASS** — toggles + per-category controls |
| 7 | Activity | **PASS** — chips, grouping, unread dots |
| 8 | Activity chip taps | **PASS** |
| 9 | Activity horizontal swipes | **PASS** |
| 10 | Chip state syncs with swipe | **PASS** — swipe to "Sebutan" scrolled and highlighted the chip |
| 11 | Social Feed | **PASS** — tabs, carousel, quote card |
| 12 | Compose | **PASS** — borderless "Cipta" |
| 13 | History | **PASS** — Sejarah Makan, 4 tabs |
| 14 | Groups | **PASS** — 4 groups, public + private |
| 15 | Explore | **PASS** |
| 16 | Bottom-nav taps | **PASS** |
| 17 | Bottom-nav horizontal swipes | **PASS** |
| 18 | Tap/swipe synchronization | **PASS** — both directions |
| 19 | Back navigation | **PASS** |
| 20 | No crash | **PASS** — 0 FATAL EXCEPTION, 0 ANR |

Note on 17: a swipe over the mood-chip carousel is consumed by that inner
horizontal list rather than the page view. That is correct gesture arbitration,
not a defect; page swipes were verified in a region without a horizontal child.

## 5. Test Kitchen — DEFERRED

Untouched. Still exactly one record, `MakanMana Test Kitchen Puncak Alam`,
`registry_status=draft`, null coordinates, null canonical id, **20 menu items
(12 makanan + 8 minuman)**. Not published, not duplicated, no fabricated Google
Place ID.

20 is the MENU COUNT. It is not restaurant capacity.

## 6. Remaining blockers

1. Deployment of the three functions + rules — **awaiting owner authorization**.
2. Backfill of existing cells — operator-invoked after deployment.
3. Test Kitchen publish → canonical materialization → Search → Detail → 20 menu
   → comment persistence → Explore → Spin → dedupe → final regression.
4. `syncPlaceCoverageToControlCenter` / `syncPlaceReferencesToControlCenter`
   read the parent doc's `candidates` array, so their coverage counts will
   understate reality once cells outgrow the frozen snapshot. Not deploy-coupled;
   `candidateCount` carries the true total. Flagged, not changed — out of scope.
5. Explore placeholder images — separate follow-up, evidenced as not a PR #26
   regression.
