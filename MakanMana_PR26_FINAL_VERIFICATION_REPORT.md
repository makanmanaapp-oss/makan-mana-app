# MakanMana PR #26 — final verification report

Branch `fix/pr26-ui-unlimited-discovery-20260913`, base `cd4a04f0` (merged PR #26).
Statuses are only PASS / FAIL / BLOCKED / NOT RUN / PARTIAL / DEFERRED.

**PRODUCTION DEPLOYMENT EXECUTED 2026-09-13** (owner-authorized: Firestore rules
+ exactly three Functions). Test Kitchen chain remains BLOCKED at the Control
Center login boundary.

---

## Summary

| Area | Status |
|---|---|
| CODE | **PASS** |
| AUTOMATED TESTS | **PASS** |
| SAMSUNG DEVICE | **PASS** (20/20 checks) |
| SCALABILITY | **PASS** |
| FUNCTION DEPLOYMENT | **DONE** — 3 of 3, verified by revision |
| RULES | **DONE** — ruleset advanced, 8/8 deny tests pass |
| INDEXES | **NOT DEPLOYED** (none required) |
| SCALABLE STORAGE LIVE | **PASS** — candidate documents written in production |
| TEST KITCHEN | **PUBLISHED** — canonical `CCM-3e9e2d55...`, materialized in scalable storage (see 0E) |
| PRODUCTION AAB | **NOT TOUCHED** |
| PLAY RELEASE | **NOT TOUCHED** |

This is **not** a claim that MakanMana is 100% ready. The deployment half is
done and evidenced; the Test Kitchen canonical E2E is blocked at the Control
Center login boundary and has not run.

---

## 0. PRODUCTION DEPLOYMENT — 2026-09-13

| Item | Value |
|---|---|
| Firestore ruleset BEFORE | `24ac23e9-3646-4626-9878-d83e165cc7a4` |
| Firestore ruleset AFTER | **`f5bcafe3-46fd-4261-9661-19a7cf394b5a`** |
| Indexes deployed | **NONE** |
| Storage rules deployed | **NONE** |
| getSuggestions | `00049-vom` -> **`00050-kof`** |
| getNearbyPlaces | `00023-xeb` -> **`00024-rel`** |
| controlCenterMasterPlaceAdminBridge | `00002-dah` -> **`00003-vof`** |
| nextSuggestion | `00013-tot` -> `00013-tot` **UNCHANGED** |
| Services changed | **exactly 3** of 141 (full snapshot diffed) |

Rules verified against the LIVE ruleset with the Firebase Rules API `:test`
method: 8/8 DENY expectations met on
`/area_place_cache/{cell}/candidates/{id}` for get, list, create, update,
delete (authenticated), get and create (anonymous), and the parent document.
The candidate store is not public-readable or public-writable.

Scalable storage proven live: a normal radius change triggered discovery
(`discoveryPerformed=true, newlyDiscoveredCount=14, areaPoolTotal=109`), which
wrote `area_place_cache/w284z/candidates` with 6 documents where
**`docId == placeId`** on every one. The pre-existing 27-entry legacy array on
that cell was NOT rewritten, and legacy-only cell `w22rk` still reads normally.

Post-cutover smoke: Explore renders, Spin returns a real suggestion, zero
`severity>=ERROR` logs on either callable, 0 FATAL EXCEPTION on device.

**Rollback status: NOT REQUIRED.** No failure occurred. Rollback targets above.

---

## 0E. TEST KITCHEN PUBLISHED — 2026-09-13/14

### Vercel

| Item | Value |
|---|---|
| OLD production deployment | `dpl_2JiYfuvZpGiXYFMWeTdBJWJHorSK` (2026-09-11) |
| NEW production deployment | **`dpl_GxGW35dSs8gd7NXjjAWzRAWxmkYb`** (2026-09-14), READY, alias resolves to it |
| Source | `vercel redeploy dpl_2JiYfuvZpGiXYFMWeTdBJWJHorSK --target production` — same source by construction |
| `CONTROL_CENTER_JOB_SECRET` configured | **YES** (48 random bytes via `env update` on the existing Production entry — no duplicate, Preview untouched). Value never read, printed, or committed. |
| Other env vars | untouched — `ADMIN_*`, `FIREBASE_MASTER_PLACE_BRIDGE_URL`, Supabase, Firebase all unchanged |

**Commit verification limitation, stated honestly:** the deployment carries no
git metadata reachable from the CLI (`meta` empty, `gitSource` null, and
`inspect -F json` omits both), and the Vercel MCP is not authorized for this
scope. I could not read the SHA to compare. What *is* established: the `git-main`
alias on the old deployment, and that `vercel redeploy` rebuilds that
deployment's own source — so OLD commit == NEW commit holds by construction
rather than by my inspection. PR #39 was not merged, promoted, or deployed.

### Unauthenticated probe — the safe config test

Before using the secret, `POST /api/internal/commands/run` with no Authorization
returned **HTTP 401 "Unauthorized internal request."** — not 503. Proof the new
deployment sees the secret, obtained without touching the queue. It also
confirms the earlier 503 diagnosis was correct.

### Queue scope immediately before the run

`TOTAL CLAIMABLE (all targets) = 1` — only `c5fc14fd-...`. Re-checked after the
redeploy, per instruction.

### One authenticated runner pass

```
{"ok":true,"state":"processed","targets":[
  {"target":"firebase","configured":true,"claimed":1,"succeeded":1,"failed":0},
  {"target":"google_play_backend","configured":true,"claimed":0,"succeeded":0,"failed":0}]}
HTTP 200
```

One POST. No loop, no retry. Secret file deleted immediately; nothing committed.

### Command finalization

| id | status | attempts | completed_at |
|---|---|---|---|
| `c5fc14fd-...` **KEPT** | **`succeeded`** | 1 | 17:17:59.702Z |
| `b145ad7c-...` | `cancelled` | 0 | 13:40:04.512Z |
| `5e90b11a-...` | `cancelled` | 0 | 13:40:13.807Z |

`error_code` null, `error_message` null, `result_snapshot` present,
`last_attempt_at` 17:17:54.527Z.

**Nothing unrelated ran:** all 9 `admin_commands` rows inspected — only the 3
Test Kitchen rows carry 2026-09-13 timestamps; the other 6 are unchanged since
2026-08-18/27.

### Publication identity

| Field | Value |
|---|---|
| canonicalPlaceId | **`CCM-3e9e2d5534de7c3ae253961b6e3c4d88`** |
| publicationId | **`CCMASTER-7763019075cb7e218dbd726c`** |
| activePublicationId | `CCMASTER-7763019075cb7e218dbd726c` |
| areaCellId | **`w284k`** |
| versionNumber | 1 |
| published / candidateMaterialized | true / true |
| requestId | `93503666-d530-43bd-98e6-d37840ca0827` |

Firebase state: `place_registry/CCM-3e9e...` with `provenanceSource:
makanmana_master_registry` (**no fabricated Google id**), `lifecycleStatus:
active`, lat 3.2389, lng 101.42793; `place_publication_heads/CCM-3e9e...`
pointing at the active publication; `place_publications/CCMASTER-...` with
`publicationStatus: published`, `menuItems: [array 20]`, `halalStatus:
verified_halal`, `ratingState: rating_hidden`.

Exactly **one** Test Kitchen: 1 of 26 in `place_registry`, 1 of 26 in
`place_publications` (25 + 1). **The two cancelled duplicates created zero
publications.**

### Scalable candidate — the point of all of this

```
area_place_cache/w284k/candidates/CCM-3e9e2d5534de7c3ae253961b6e3c4d88
  placeId          = CCM-3e9e2d5534de7c3ae253961b6e3c4d88
  canonicalPlaceId = CCM-3e9e2d5534de7c3ae253961b6e3c4d88
  dataSource       = canonical
  name             = MakanMana Test Kitchen Puncak Alam
  lat / lng        = 3.2389 / 101.42793
```

`placeId == canonicalPlaceId` and `dataSource == canonical`. The first canonical
restaurant to materialize through the new subcollection storage in production.

### Supabase write-back — GAP, not a failure

The row remains `registry_status=draft`, `canonical_place_id=null`,
`published_at=null`. Investigated: **nothing in the Control Center writes these
back** — no writer exists in `lib/admin` or `lib/data`; the runner only calls
`control_center_finish_command`. The publication itself fully succeeded on the
Firebase side, which is what the app reads. Consequence:
`place-registry-read-models.ts` counts published rows by `registry_status ===
"published"`, so the Control Center dashboard will under-report this place
indefinitely. **FOLLOW-UP REQUIRED.**

### Samsung A05 — Test Kitchen E2E

Device `R93W904ASMH`, QA `com.makanmana.apps.qa` versionCode 17 (existing build;
client code unchanged). Not uninstalled, data not cleared. Production
`com.makanmana.apps` 0.1.8(13) untouched.

| # | Check | Status |
|---|---|---|
| 1 | Exact Explore search | **PASS** — "MakanMana Test Kitchen Puncak ...", real cover logo, 4.7 km |
| 2 | Exactly one result, no duplicate | **PASS** |
| 3 | Restaurant Detail opens | **PASS** — name, real address, "Buka sekarang", price, no crash |
| 4-8 | 20 menu items / 12+8 / scroll / persistence | **NOT RUN** — see below |
| 9-13 | Comment submit + persistence | **NOT RUN** — same cause |
| 14 | Explore eligibility | **PASS** — reachable via server-side search over the full pool |
| 15 | Spin health | **PASS** — real suggestion returned, 62% match |
| 16 | Candidate identity | **PASS** — verified server-side |
| 17 | Reject/Next | **PASS** (regression verified earlier this cutover) |
| 18 | canonical/provider dedupe | **PASS** — one card only |
| 19 | Navigation regression | **PASS** — Home, Explore, Profile, History, Spin |
| 20 | Logcat | **PASS** — 0 FATAL EXCEPTION, 0 ANR |

Explore pagination additionally proven live: page 1 ended with "Muat lagi", page
2 loaded further restaurants and offered "Muat lagi" again.

#### Why menu and comment are NOT RUN

The 20-item menu lives only in the **canonical** Restaurant Detail (Profil |
Ulasan | Menu tabs), gated behind
`RestaurantDetailFlags.canonicalRestaurantDetailEnabled`. Both activation paths
hard-gate on `isDebugBuild`: `qaCanonicalDetailAllowed` returns false when
`!isDebugBuild`, and `evaluateInternalCohort` returns `eligible: false` with
reason `release_build_public_stays_legacy_only`. A `--release` QA build therefore
renders the legacy detail, which has **no menu section at all** — confirmed by
scrolling to the end of the page twice.

This is the **EXPECTED DEBUG/QA FLAG STATE**, not missing code and not a
publication failure. The menu data is published and verified server-side
(`menuItems: [array 20]`). Verifying it on-device needs a debug build or an
explicit diagnostic override, which is a separate authorization.

#### One incident worth recording

The first search returned "Tiada hasil dijumpai". Root cause was **device
location**, not the publication: the app had fallen back to "Sekitar KL (lokasi
lalai)" while the Test Kitchen sits in cell `w284k` about 30 km away. The
device's real fix was 3.2198, 101.4652 — 4.6 km from the restaurant.
Re-resolving location via the location chip produced "Selangor - 15km", and the
search then returned the restaurant at 4.7 km, matching the computed distance.
No code or data was changed to make it appear.

---

## 0D. DUPLICATE CANCELLATION DONE — RUNNER BLOCKED (2026-09-13)

### Phase A — pre-mutation reverify: PASS

All three commands still `queued`, `attempt_count=0`, `completed_at`,
`next_attempt_at`, `last_attempt_at` all null, same `target_system=firebase`,
same `command_type`, same `resource_type`, same `resource_id`, same actor
`addc150b-d9df-43ce-bdfa-c5cf2e5329eb`, and **identical payloads**
(md5 `c561bed04ebfd3907d5d9f5739ea4b6b`, 8660 bytes). Nothing had started.

### Phase B — two duplicates cancelled via the audited lifecycle: PASS

`control_center_command_lifecycle(p_action => 'cancel', ...)`. No rows deleted.

| id | status | completed_at | next_attempt_at |
|---|---|---|---|
| `c5fc14fd-e59f-434d-8fba-73010a24038f` **KEPT** | `queued` | null | null |
| `b145ad7c-ec6e-4708-a56f-eaff9cffd2db` | **`cancelled`** | 13:40:04.512Z | null |
| `5e90b11a-6c14-4b2d-8b02-4a121b58f611` | **`cancelled`** | 13:40:13.807Z | null |

Audit evidence — `audit_logs` contains **two** `command.cancelled` rows
(13:40:04.512Z and 13:40:13.807Z), resource_type `place_registry_master`,
resource_id `65df6d95-…`, reason *"Cancel duplicate Test Kitchen publish
command; preserve earliest queued request for one-off execution."*

The kept command was not altered.

### Phase C — queue scope proof: PASS

Query used the claim function's exact criteria
(`status='queued' AND coalesce(next_attempt_at, now()) <= now() AND attempt_count < 5`),
across **all** target systems:

```
TOTAL CLAIMABLE QUEUED COMMANDS (all targets): 1
  target=firebase  id=c5fc14fd-e59f-434d-8fba-73010a24038f
  type=place.publish_master_registry  resource=65df6d95-…
```

The kept Test Kitchen command was the **sole** claimable command anywhere. No
unrelated command could have been touched.

### Phase D/E — one-off runner: **FAILED, and not for a reason a retry fixes**

One POST to `/api/internal/commands/run`. Response:

```
HTTP 503  {"ok":false,"error":"Internal job secret is not configured."}
```

That message comes from `verifyBearer(request, process.env.CONTROL_CENTER_JOB_SECRET, …)`:

```ts
if (!expected) return { ok: false, status: 503, error: missingMessage };
...
if (!presented || !safeEqual(presented, expected))
  return { ok: false, status: 401, error: "Unauthorized internal request." };
```

**503 means the SERVER's own `CONTROL_CENTER_JOB_SECRET` is falsy at runtime.**
A wrong or empty token from the caller returns **401**, not 503. So this is not a
credential mistake on my side — the running deployment has no job secret.

Corroborating: `vercel env pull --environment=production` returns **empty values
for every sensitive variable** (`CONTROL_CENTER_JOB_SECRET`,
`CONTROL_CENTER_SYNC_SECRET`, `MERCHANT_BRIDGE_SECRET`,
`FIREBASE_MASTER_PLACE_BRIDGE_URL`, and both `ADMIN_*_ENABLED` flags). The flags
cannot truly be empty — the Publish button worked — so the CLI is writing
placeholders for sensitive values rather than decrypting them. That makes the
pull useless as a way to obtain the secret, and it is consistent with the server
itself not having one.

**The runner endpoint is therefore unusable by anyone, not just by me.** That is
the real reason nothing has drained the queue since 2026-08-27 — deeper than the
missing cron reported in 0C.

Also noted: the deployment currently serving `makanmana-control-center.vercel.app`
is `dpl_2JiYfuvZpGiXYFMWeTdBJWJHorSK`, created **2026-09-11** — not the
`dpl_8TbmZZTgnqH5V7T6ZxY1nCkZDEst` deployed on 2026-09-13. Something re-promoted
an older deployment. Worth checking, as an older build may predate env changes.

### State after the failed pass — intact

| id | status | attempts |
|---|---|---|
| `c5fc14fd-…` KEPT | **`queued`** | 0 |
| `b145ad7c-…` | `cancelled` | 0 |
| `5e90b11a-…` | `cancelled` | 0 |

Auth failed before any claim, so the kept command was not consumed and is still
executable the moment the runner works. Nothing unrelated ran.

### What unblocks it — owner action, outside my authorization

1. Set a real value for **`CONTROL_CENTER_JOB_SECRET`** in Vercel production
   (it appears unset/empty at runtime), then redeploy the Control Center so the
   running deployment picks it up.
2. Check why `dpl_2JiYfuvZpGiXYFMWeTdBJWJHorSK` (Sep 11) is serving instead of
   the Sep 13 deployment.
3. Then one POST to `/api/internal/commands/run`, which will claim exactly the
   one kept command.

I did **not** set the env var, rotate any secret, or redeploy the Control
Center — none of that is authorized. Temporary env files were deleted; nothing
was committed.

### Phases G/H/I — NOT RUN

Publication has not executed, so canonicalPlaceId, publicationId, the scalable
candidate document and the entire Samsung Test Kitchen E2E remain untested.

---

## 0C. TEST KITCHEN PUBLICATION — COMMAND FIRED BUT NEVER EXECUTED

**Correction to 0B below: the click DID fire.** 0B was accurate when written
(12:30Z); the owner's click landed at 12:44-12:45Z, after that check.

### The commands exist

`admin_commands`, `command_type = place.publish_master_registry`,
`resource_id = 65df6d95-e940-4f9a-850d-091e725c41ac`:

| id | created | status | error |
|---|---|---|---|
| `c5fc14fd-e59f-434d-8fba-73010a24038f` | 12:44:49.425Z | **queued** | none |
| `b145ad7c-ec6e-4708-a56f-eaff9cffd2db` | 12:44:50.966Z | **queued** | none |
| `5e90b11a-6c14-4b2d-8b02-4a121b58f611` | 12:45:32.702Z | **queued** | none |

Three, from what the owner reports as one click — the form has no pending state
or submit-disable, so it is double-submittable.

### Root cause: nothing drains the queue

Publication is asynchronous. `publishMasterPlaceFormAction` only *enqueues*;
execution requires `processConfiguredCommands`, whose sole caller is
`POST /api/internal/commands/run`, gated by `CONTROL_CENTER_JOB_SECRET`.

- **No cron in the repo** — no `vercel.json`, no `crons` key anywhere.
- **No Vercel cron** — `vercel crons ls` returns *"No cron jobs found"*.
- **No UI action** calls the runner.
- The runner *would* handle this type: `http-command-adapter.ts` routes
  `place.publish_master_registry` to `getMasterPlaceBridgeConfig()`.

So the queue is drained only by an external POST that nothing currently makes.
The 4 historical commands (last succeeding 2026-08-27) were drained by
something no longer running.

**This is not specific to this publish.** Every authoritative command type —
user admin, coupon, AI brain, social moderation, promotion, CMS, master place —
enqueues into the same table and depends on the same absent runner.

### Why the UI was silent

The form action **succeeded**. It enqueued and returned. There is no success or
error UX, and nothing to report anyway, because the work happens later. Unchanged
UI was not evidence of failure — as the owner noted.

### If the queue is drained, what happens

`resolveCanonicalId` falls back to `CCM-${hash(masterRegistryId)}`, derived from
the stable Supabase row id, so all three commands resolve to the **same**
canonicalPlaceId. Consequences:

- ONE canonical restaurant in `place_registry` — **no duplicate Test Kitchen**;
- ONE `place_publication_heads/{canonical}`, `activePublicationId` set by
  whichever command runs last;
- **THREE** `place_publications` docs, because `publicationId =
  CCMASTER-${hash(requestId)}` keys on requestId, not on identity;
- ONE candidate document at `area_place_cache/{cell}/candidates/{canonical}`.

Untidy but not identity-corrupting. Deduplicating the queued commands to one
before draining would avoid the two spare publication rows.

### Nothing was mutated

No retry, no queue drain, no SQL, no direct Firestore write, no secret pulled to
disk. Production deployment state from section 0 unchanged.

---

## 0B. (superseded by 0C) TEST KITCHEN PUBLICATION — as assessed at 12:30Z

Asked to continue from Phase 11 after publication. **The publication did not
happen.** Stopped here rather than proceeding; Phases 12-23 all depend on it.

### What DID happen

The coordinates were saved.

| Field | Value |
|---|---|
| `latitude` | **3.2389** |
| `longitude` | **101.42793** |
| `updated_at` | **2026-09-13 12:27:26Z** |
| `menu_items` | 20 (unchanged) |
| `halal_status` / `price_range` / `phone` | unchanged |

### What did NOT happen

| Check | Expected after publish | Actual |
|---|---|---|
| `registry_status` | `published` | **`draft`** |
| `canonical_place_id` | non-null | **null** |
| `published_at` | timestamp | **null** |
| `firebase_id` | non-null | **null** |
| `admin_commands` rows for `place.publish_master_registry` | >= 1 | **0 — none, ever** |
| Firebase ledger `control_center_master_place_commands` | >= 1 | **0 entries** |
| Firestore `place_registry` | 26 | **25 (unchanged)** |
| Firestore `place_publications` | 26 | **25 (unchanged)** |
| Firestore `place_publication_heads` | 26 | **25 (unchanged)** |
| "Test Kitchen" anywhere in Firestore | present | **0 matches in any collection** |

### Diagnosis

`requestMasterPlacePublish` ends in `enqueueAuthoritativeCommand({commandType:
"place.publish_master_registry", ...})`. The `admin_commands` table holds 4
historical commands across other types, the most recent succeeding on
2026-08-27 — so the mechanism itself works. There has never been a
`place.publish_master_registry` row. The publish path was therefore **never
entered**; this is not a failure downstream of it.

Two explanations fit the evidence, and I cannot separate them from outside the
authenticated session:

1. **Publish was pressed before the coordinates were saved.**
   `requestMasterPlacePublish` throws *"Master registry place requires valid
   coordinates before publication"* and enqueues nothing. Consistent with
   `updated_at` being the save. A retry after saving would now pass that guard.
2. **The Publish button is disabled.**
   `externalEnabled = writesEnabled && externalActionsEnabled &&
   hasConfiguredMasterPlaceBridge()`. If `ADMIN_PRODUCTION_WRITES_ENABLED` or
   `ADMIN_EXTERNAL_ACTIONS_ENABLED` is not `"true"`, the button renders greyed
   and the sidebar reads *"Safe mode — Production writes locked"*.

Both env names exist in Vercel production; their values are encrypted and were
**not** read.

### What the owner needs to check

In the Control Center, on the Test Kitchen record:

1. Sidebar footer — does it read **"Writes enabled"** or **"Safe mode"**?
   Safe mode means the button is disabled and no amount of clicking will work.
2. If writes are enabled: press **"Publish Approved Data to App"** again now
   that the coordinates are saved, and report any red error text.

**Nothing was mutated in production during this investigation.** No retry was
attempted, no SQL publish, no direct Firestore write, no fabricated
canonicalPlaceId. Deployment state from section 0 is unchanged.

---

## 1. Owner decision package

**Branch** `fix/pr26-ui-unlimited-discovery-20260913`
**HEAD** `d5dd80a`

### Changed files and why

| File | Why |
|---|---|
| `functions/src/domain/places/coverage/areaCacheStorage.ts` | NEW. Pure storage contract: identity scheme, legacy+new merge, cursor, batch chunking. Pure so 401/1000 are testable without Firestore. |
| `functions/src/domain/places/coverage/__tests__/areaCacheStorage.test.ts` | NEW. 26 tests incl. #401 and #1000 proven individually. |
| `functions/src/services/areaCandidatePoolService.ts` | Writes one document per candidate; paged subcollection read; merges both generations; legacy array frozen; idempotent backfill added. |
| `functions/src/controlCenter/masterPlaceAdminBridge.ts` | Publication writes the candidate document in the same transaction, so a published restaurant lands in authoritative storage. |
| `firestore.rules` | Explicit nested block for the subcollection. Rules do NOT cascade without a recursive wildcard. **DEPLOYED 2026-09-13.** |
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

> Authorization received and rules deployed 2026-09-13. Ruleset `24ac23e9` -> `f5bcafe3`.

### Rollback plan

1. **Functions:** roll Cloud Run back to the pre-cutover revisions
   `getsuggestions-00049-vom`, `getnearbyplaces-00023-xeb`,
   `controlcentermasterplaceadminbridge-00002-dah`.
2. **Rules:** re-release ruleset `24ac23e9-3646-4626-9878-d83e165cc7a4`, or
   re-deploy the previous `firestore.rules`. The subcollection then falls to the
   catch-all, which is also deny.
3. **Data:** nothing is deleted by this change. The legacy array is frozen, not
   removed, so the old reader still finds the pre-migration snapshot. Candidates
   discovered after cutover live only in the subcollection — rollback means
   returning to the pre-migration snapshot, which is a smaller and honest
   promise than "loses nothing".

### Commands actually executed 2026-09-13 (backfill still NOT run)

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
