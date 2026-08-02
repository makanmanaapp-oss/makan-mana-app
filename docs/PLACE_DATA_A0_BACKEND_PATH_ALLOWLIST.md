# Place Data A0 — Backend path allow-list

Recovered from the dirty working tree of `makan_mana`
(branch `issue-001.2-sport-mood-localization`, HEAD `06576fe`) into a clean
worktree branched from that same commit. **No feature work was performed.**

## Recovered (252 files)

| Area | Contents |
| --- | --- |
| `functions/src/domain/places/**` | 9 subsystems: canonical, corrections, coverage, dedup, enrichment, migration, publication, staging, tags — plus unit / emulator / rules-emulator tests |
| `functions/src/callable/` | `submitPlaceCorrection.ts`, `submitPlaceCorrectionLogic.ts`; `getNearbyPlaces.ts` **hunk-scoped** |
| `functions/scripts/` | `placeMigrationDryRun.ts`, `placeMigrationBatch.ts`, `placeProductionMigration.ts`, `placeLocationEnrichment.ts` |
| `functions/src/types/place.ts` | Phase 1.14G canonical fields (whole file — all changes are Place Data) |
| `lib/features/place_migration/**` | cohort gate, alias resolution, read comparison, diagnostics |
| `lib/features/place_corrections/**` | trusted callable gate, submission history |
| `lib/features/restaurant/canonical/**` | canonical detail screen + adapter |
| `lib/models/place_summary.dart` | `negativeSignals`, `dataSource` (whole file — all changes are Place Data) |
| `test/*.dart` | 5 Place Data Dart test files |
| `docs/MAKANMANA_PART1_*.md` | 7 Place Data design documents |
| `firestore.rules` | **hunk-scoped** — Place Data collections only |

## Hunk-scoped files

Two tracked files mix Place Data with unrelated work. Only Place Data hunks were applied.

| File | Dirty | Recovered | Excluded |
| --- | --- | --- | --- |
| `firestore.rules` | +444 / −9 (6 hunks) | **+253 / −6 (2 hunks)** | 4 hunks, 233 lines: `algorithm_rollout_*`, `coupon_codes`, `coupon_redemptions`, `deletion_requests`, `dm_threads`, `messages` |
| `functions/src/callable/getNearbyPlaces.ts` | +160 / −13 (4 hunks) | **+155 / −13 (3 hunks)** | 1 hunk, 11 lines: algorithm2 unified-ranking imports |

Verified absent from the clean worktree: `algorithm_rollout_config`, `coupon_codes`,
`dm_threads`, `deletion_requests` — each present in the dirty tree, each 0 in the clean one.

## Deliberately excluded

- All unrelated sport / mood / localization work (the branch's actual subject).
- `lib/core/widgets/placeholder_screen.dart` — matched the inventory grep on
  "**place**holder"; it is not Place Data.
- `reports/phase_1_14*.json` (6 files) — genuine migration provenance, but they
  carry an operator label, one email-shaped string and three UID-shaped strings.
  Hashed as forensic artifacts instead of committed.
- `docs/evidence/phase_1_13a/*.png` (4 files) — device screenshots, not test baselines.
- Build output (`functions/lib/`), `node_modules/`, `.dart_tool/`.
