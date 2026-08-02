# MakanMana PART 1 — Phase 1.12: Legacy place data migration foundation, canonical read adapters, alias resolution and safe feature-flag rollout

> **Historical record.** This document records the verified baseline at the phase
> in which it was created. For the latest repository-wide test counts and
> deployment status, refer to `MAKANMANA_PART1_PHASE_1_14A_REVIEW_PACK.md` and
> `MAKANMANA_PART1_CONTROLLED_DEPLOY.md`.
>
> **Phase 1.14C production dry-run finding:** a zero-write dry-run over 625 production
> `place_details` records classified **624 HELD / 1 CONFLICT / 0 SAFE**. Root cause:
> `place_details` has **no coordinates/address**, so canonical validation fails and the
> migration correctly holds (no fabrication). A trusted source with location must exist
> before any migration batch. See `MAKANMANA_PART1_PHASE_1_14C_PRODUCTION_DRY_RUN.md`.

Status: **implemented, additive, every flag defaults to the legacy path.**
Scope: Cloud Functions domain (emulator only) + Flutter read adapters + Control
Center (mock only). Nothing is deployed. No live data is migrated. No production
canonical read is enabled.

> **No production legacy place data was migrated, deleted or switched to
> canonical reads in this phase.**

---

## 1. Legacy inventory

`functions/src/domain/places/migration/legacyInventory.ts`

The inventory **observes** legacy data and records what it saw. It never writes,
modifies or deletes a legacy document — there is no code path that could.

`LegacyPlaceInventoryRecord` carries the legacy record ID, collection, full
document path, legacy place ID, optional provider ID, the display fields, the
reference pointers that aim at it, a content hash and an inventory status.

Collections inspected (emulator/test): `places_cache`, `place_details`,
`favorites`, `meals`, `suggestions`, `suggestion_sessions`, `history`,
`deep_links`.

Statuses: `discovered`, `eligible`, `incomplete`, `duplicate_candidate`,
`ambiguous`, `blocked`, `planned`, `migrated_in_emulator`, `skipped`.

The content hash deliberately **excludes** discovery timestamps, so re-scanning
unchanged data produces an identical hash — that is what makes a repeated
dry-run idempotent. Changing a single legacy field changes the hash.

## 2. Reference impact

`referenceImpact.ts`

Before an ID moves, we need to know what points at it. `LegacyPlaceReferenceImpact`
counts favorites, meals, history, suggestions, sessions, deep links and
corrections, and lists any path it does not recognise.

**Favorites, meals and deep links are critical.** Breaking them means a user
loses personal data or a shared link dies. An unknown reference path always
raises a warning and, combined with critical references, holds the candidate.

The scan is bounded (`DEFAULT_REFERENCE_SCAN_LIMITS`) and reports truncation
rather than silently scanning without limit.

## 3. Migration candidates

`migrationCandidate.ts`

Deterministic: identical legacy input always produces the same `contentHash`.

Decisions: `ready`, `review_required`, `ambiguous`, `branch_conflict`,
`insufficient_identity`, `blocked`, `skip`, `already_mapped`.

The stable identity key is **provider ID → legacy place ID**. A name is never
part of the key: "Restoran Ali" in Shah Alam and "Restoran Ali" in Bangi are two
shops, and keying on the brand would merge them.

Branch detection and duplicate signals reuse the Phase 1.4 engine rather than
re-implementing them.

## 4. Alias preservation

`migrationAlias.ts`

This is what keeps favorites, meals, history, suggestions and deep links from
breaking. Every legacy ID stays resolvable forever.

Alias types: `legacy_document_id`, `google_place_id`, `internal_place_id`,
`deep_link_place_id`, `provider_place_id`, `merchant_id`.

Rules enforced by `checkAliasProposal`:

- one legacy ID resolves to exactly one canonical ID;
- an existing alias is never silently overwritten (collision → block);
- a circular chain fails safely rather than looping;
- an unknown alias returns an explicit `not_found`;
- an alias may not target a sibling branch.

Resolution reuses Phase 1.4's `resolveCanonicalPlaceId`, so there is exactly one
alias resolver in the codebase.

## 5. Migration plans

`migrationPlan.ts` — `PlaceMigrationPlan` with 10 statuses and a controlled
transition table. `targetCollectionMode` has exactly one legal value:
**`emulator_only`**. No production mode is defined anywhere in the type system.

`computePlanHash` excludes timestamps, author and status, so the same legacy
data yields the same plan; a single changed legacy byte yields a different one,
which means a stale plan can never be executed silently against new data.

## 6. Dry-run flow

`dryRunPlanner.ts` — `buildLegacyMigrationPlan` runs the full 12-step pipeline
purely: no I/O, no `Date.now()`, no side effects.

1. inventory → 2. normalise identity → 3. resolve duplicates → 4. detect
branches → 5. resolve existing aliases → 6. scan references → 7. validate the
canonical snapshot → 8. compute hold reasons → 9. propose aliases → 10. build
the rewrite preview → 11. compute the deterministic plan hash → 12. emit the
dry-run summary.

The summary carries `zeroProductionWritesConfirmed: true` as a literal type — a
plan that claimed otherwise would not compile.

When an existing alias already resolves a legacy ID, the planner **adopts** that
mapping (`already_mapped`) instead of proposing a competing one. That is the
non-overwriting behaviour, and it is covered by a test.

## 7. Hold reasons

All 18 are implemented: `missing_stable_identity`, `name_only_match`,
`ambiguous_duplicate`, `branch_conflict`, `coordinate_conflict`,
`phone_conflict`, `alias_collision`, `circular_alias`, `missing_location`,
`invalid_location`, `critical_reference_unresolved`,
`canonical_validation_failed`, `publication_not_eligible`,
`source_provenance_missing`, `unsupported_legacy_shape`,
`malformed_legacy_data`, `unknown_reference_path`, `manual_review_required`.

`candidateIsExecutable` returns false whenever any hold reason is present. A held
candidate can never execute, in any mode.

## 8. Reference rewrite preview

`referenceRewrite.ts` — preview only in this phase; emulator execution is allowed
for tests. `aliasPreserved` is typed as literal `true`: the legacy value always
stays alongside the canonical ID, which is precisely what makes rollback
possible. Unknown reference paths are `held`, never previewed as writable.

Favorites, meals and deep links are marked `required`.

## 9. Checkpoints and resume

`migrationCheckpoint.ts` — checkpoint identity is derived from the plan, batch
and the **set** of processed candidates, never from wall-clock time.

- `recordCandidate` on an already-processed candidate is a no-op → replay is
  idempotent and a candidate is never executed twice.
- `verifyCheckpoint` recomputes the checksum and cross-checks the tallies; a
  mismatch fails safely and execution is refused.
- `remainingCandidates` drives resume.

## 10. Emulator execution

`emulatorExecution.ts` — pure. It computes what should be created and returns it;
the repository persists it. It refuses to run when the target is not the
emulator, the dry run is incomplete, the plan is not approved, or the checkpoint
is corrupt.

It never writes `place_registry`, never deletes `places_cache` or
`place_details`, never deletes user data, and never publishes. Every created
record carries `emulatorOnly: true` and `published: false` as literal types.

## 11. Rollback

`rollbackPlan.ts` — every step is typed `destructive: false`.

Rollback deactivates emulator canonical records, marks aliases `rolled_back`
(never deletes them) and restores references from the preserved legacy values.
Legacy documents were never touched, so there is nothing to restore there. The
audit trail survives. `applyRollback` is idempotent.

After rollback the legacy ID resolves to `not_found` again, which is what makes
the dual-read adapter fall back to legacy — the safety property and the rollback
mechanism are the same mechanism.

## 12. Shadow read

`shadowRead.ts` (backend) and `lib/features/place_migration/read_comparison.dart`
(client) — the same rules, mirrored.

Comparison is on **state**, not raw values: "unknown" vs "unknown" is a match;
"unknown" vs a real value is a mismatch. Compared fields: title, address,
coordinates, rating state, review-count state, price state, hours state,
business state, image state, halal state, tag IDs.

Title, coordinates, business state and halal state are **critical** — a mismatch
there means the user would see a different shop or different safety information.

## 13. Dual read

`lib/features/place_migration/place_read_repository.dart`

`PlaceReadRepository` with three implementations: `LegacyPlaceReadRepository`,
`CanonicalPlaceReadRepositoryStub` (not connected to Firebase) and
`DualPlaceReadRepository`.

Modes: `legacyOnly` (**production default**), `shadowRead`,
`canonicalPreferredWithLegacyFallback`, `canonicalOnlyTest`.

Guarantees, each covered by a test:

- canonical error → legacy;
- canonical timeout → legacy;
- missing alias → legacy;
- circular alias → legacy;
- blocked canonical record → legacy;
- missing canonical record → legacy;
- in shadow mode the legacy result is produced **first** and canonical work
  cannot delay it past the timeout;
- the caller always sees the stable `placeId` it asked for;
- requesting both a legacy ID and its canonical ID returns one result, not two.

## 14. Feature flags

`place_migration_flags.dart` — one coordinator that knows every canonical flag
and which combinations are unsafe.

Production defaults: read mode `legacyOnly`, shadow read off, diagnostics off,
canonical cards off, canonical detail off, corrections off.

Rejected combinations:

| Combination | Reason |
| --- | --- |
| canonical-only mode in release | `canonicalOnlyInRelease` |
| shadow read in release | `shadowReadInRelease` |
| diagnostics in release | `diagnosticsInRelease` |
| canonical read without a completion marker | `canonicalReadWithoutMigrationMarker` |
| canonical cards without a working adapter | `canonicalCardsWithoutAdapter` |
| canonical detail with a canonical-only stub | `canonicalDetailWithCanonicalOnlyStub` |
| correction submit in release without a trusted callable | `correctionSubmitWithoutTrustedCallable` |

`apply()` validates first and changes **nothing** when validation fails — a
rejected combination never leaves flags half-set.

## 15. Completion marker

`completionMarker.ts` — in this phase only `emulator_complete` (and
`rolled_back`) can be created. `production_ready` and `production_complete` are
refused outright with `forbidden_status_in_this_phase`.

`productionCanonicalReadAllowed()` requires a `production_complete` marker, which
cannot exist, so it always returns false. The flag coordinator references this
rule, which is why canonical production reads cannot be switched on.

A marker is also refused when held candidates remain, when any production write
is reported, or when any legacy deletion is reported.

## 16. QA diagnostics

`migration_diagnostics.dart` — debug/test only. `snapshotFor()` returns `null`
whenever diagnostics are off **or** the build is a release build, so no widget
can render it accidentally.

Exposed: read mode, source used, alias resolution result, legacy fallback reason,
shadow mismatch count, migration plan ID, canonical publication version, legacy
place ID, canonical place ID.

Not exposed: any UID, display name, email or user location. A test asserts the
label set contains none of those words.

## 17. Security boundary

`firestore.rules` denies **all** client access — read, query, create, update,
delete — to ten collections:

`place_migration_inventory`, `place_migration_candidates`,
`place_migration_plans`, `place_migration_checkpoints`,
`place_migration_aliases`, `place_migration_audit`, `place_read_comparisons`,
`migration_completion_markers`, `place_migration_emulator_canonical`,
`place_migration_rollback_plans`.

Specifically, a client cannot alter a checkpoint, write an alias or set a
completion marker — any of which would let a client fake "migration complete"
and trigger canonical reads.

The browser admin has no direct access either: the Control Center runs entirely
on mock repositories in this phase.

## 18. Control Center workspace

Routes: `/place-data/migration` and `/place-data/migration/[planId]` (SSG, both
with `loading.tsx` and `error.tsx`).

13 views: legacy inventory (landing page), then per plan — migration candidates,
ready queue, hold queue, branch conflicts, alias collisions, reference impact
(with rewrite preview), dry-run summary, checkpoints, shadow-read comparison,
feature-flag preview, rollback preview, audit trail.

Mock actions: run inventory, build dry-run, place on hold, resolve conflict,
approve emulator, simulate emulator execution, pause, resume, simulate rollback,
preview feature flags. **There is no production execute button**, and an e2e test
asserts its absence by scanning the rendered text.

Eight permissions (spec name → identifier):

| Spec | Identifier |
| --- | --- |
| `places.migration.view` | `view_place_migration` |
| `places.migration.dry_run` | `dry_run_place_migration` |
| `places.migration.review` | `review_place_migration` |
| `places.migration.approve_emulator` | `approve_emulator_place_migration` |
| `places.migration.execute_emulator` | `execute_emulator_place_migration` |
| `places.migration.rollback_emulator` | `rollback_emulator_place_migration` |
| `places.migration.audit` | `view_place_migration_audit` |
| `places.migration.flags_preview` | `preview_place_migration_flags` |

No production permission exists. Role behaviour: Owner does everything; Admin
gets view/dry-run/review but not approve, execute or rollback; Data Reviewer
inspects candidates, conflicts and references; Publisher gets flag preview only;
Auditor is read-only audit; Analyst sees aggregate metrics only.

## 19. Testing

| Suite | Command | Result |
| --- | --- | --- |
| Backend unit (all domains) | `npm test` | 451 pass |
| Backend emulator | `npm run test:emulator` | 44 pass |
| Firestore rules | `npm run test:rules` | 147 pass |
| Flutter (all) | `flutter test` | 630 pass |
| Flutter migration suite | `flutter test test/place_migration_test.dart` | 38 pass |
| Migration verification | `npm run verify:place-migration` | 39 checks |
| Migration e2e | `npx playwright test tests/e2e/place-migration.spec.ts` | 12 pass |
| Migration a11y | `npx playwright test tests/accessibility/place-migration-a11y.spec.ts` | 4 pass |

## 20. Explicit statement

> **No production legacy place data was migrated, deleted or switched to
> canonical reads in this phase.**

Additionally: nothing was deployed, `functions/src/index.ts` was not touched, no
`place_registry` write occurred, no legacy collection was deleted, and every
mobile feature flag remains at its safe default.

---

## Phase 1.14C.1 update — trusted location enrichment (unblocks SAFE)
The 1.14C blocker (`place_details` had no coordinates → 0 SAFE) is resolved for a
first cohort. A bounded **25**-record batch was enriched via Google Places
*Details* with provider-derived `location{latitude,longitude}` + `formattedAddress`
(+ provenance/freshness). In a **zero-write** migration preview those 25 classify
**SAFE (25/HELD 0/CONFLICT 0)**; the branch-conflict record from 1.14C stays
excluded. The dry-run tool (`readPlaceDetailsInventory`) now reads
`location`/`formattedAddress`, so a standard re-run reflects SAFE candidates.
Idempotent (25/25 checksum match), merge-only, no migration/alias/marker write.
Next gate: **Phase 1.14C-R** first canonical migration *test* batch (10–25).
See `MAKANMANA_PART1_PHASE_1_14C_1_LOCATION_ENRICHMENT.md`.

---

## Phase 1.14C-R + 1.14D closeout (PARTIAL PASS)
Repeat zero-write dry-run: SAFE 25 / HELD 600 / CONFLICT 1, two-run checksum identical, zero writes. Locked 25-SAFE batch executed via the APPROVED emulator-only executor (25 migrated, idempotent, marker=emulator_complete, rollback proven); production canonical collections stayed 0. Canonical migration to production is impossible with approved tooling (emulator-only by Phase 1.12 design) and forbidden to rebuild here. Trusted callable is deploy-ready but NOT deployed (owner chose PARTIAL PASS; needs dedicated-SA wiring + IAM actAs grant). Production stays legacyOnly, all flags OFF, App Check enforcement OFF, no restore, no Play upload. See MAKANMANA_PART1_FINAL_CLOSEOUT.md.

---

## SUPERSEDED by Phase 1.14E (production enablement)
The emulator-only limitation is resolved: a production-safe canonical executor + read adapter were built and the first 25-SAFE cohort was migrated to REAL production canonical storage (place_registry/publications/heads/aliases + batch checkpoint), verified and idempotent. submitPlaceCorrection is deployed with the dedicated runtime SA (minimal actAs IAM). Rules unchanged (server-only). Public/global stays legacyOnly; global completion false; 601 unmigrated. Status PARTIAL PASS (live device/authenticated-cohort QA env-limited). See MAKANMANA_PART1_PHASE_1_14E_PRODUCTION_ENABLEMENT.md + MAKANMANA_PART1_FINAL_PRODUCTION_CLOSEOUT.md.
