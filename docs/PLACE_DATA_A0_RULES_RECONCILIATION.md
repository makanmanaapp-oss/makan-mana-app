# Place Data A0 — Firestore rules reconciliation

**Read-only. Nothing was deployed and no rule was "fixed" in A0.**

Local (dirty) `firestore.rules` carried +444/−9 lines; the Place Data hunks
(+253/−6) were recovered, the rest excluded (see the backend allow-list).

## Declared vs present in production

30 `place*` collections are declared. Production holds 10.

| Collection | Declared | In production | Rule |
| --- | --- | --- | --- |
| `place_publications` | yes | **25** | `read, write: if false` |
| `place_publication_heads` | yes | **25** | `read, write: if false` |
| `place_migration_aliases` | yes | **25** | `read, write: if false` |
| `place_migration_audit` | yes | **25** | `read, write: if false` |
| `place_details` | yes | **871** | server-only |
| `places_cache` | yes | **112** | server-only |
| `place_reviews` | yes | **4** | app rules |
| **`place_registry`** | **NO** | **25** | *denied by default only* |
| **`places_pool_v3`** | **NO** | **4** | *denied by default only* |
| `place_migration_batches` | NO | **1** | *denied by default only* |

## Declared but absent in production (21)

`place_staging`, `place_aliases`, `place_import_batches`, `place_merge_plans`,
`place_merge_queue`, `place_source_snapshots`, `place_status_audit`,
`place_tag_definitions`, `place_tag_sets`, `place_coverage_memberships`,
`place_discovery_queue`, `place_cache_invalidations`, `place_read_comparisons`,
`place_correction_submissions`, `place_correction_decisions`,
`place_correction_rate_limits`, `place_publication_rollbacks`,
`place_migration_candidates`, `place_migration_checkpoints`,
`place_migration_inventory`, `place_migration_plans`,
`place_migration_rollback_plans`, `place_migration_emulator_canonical`.

Rules run ahead of data — expected for staged rollout, not a fault.

## Finding carried forward to Phase A

Three collections that **exist in production and hold live data**
(`place_registry` 25, `places_pool_v3` 4, `place_migration_batches` 1) have **no
explicit rule**. Firestore denies them by default, so this is *safe* but
*inconsistent*: every sibling collection is explicitly `if false`.

Client access is denied either way, and the Admin SDK bypasses rules entirely,
so the live migration was unaffected. **Per the A0 brief this is documented, not
repaired.** Phase A should add the three explicit denials.

## Deployed rules

Not retrieved. The Firestore Rules API was not queried in A0, so *local vs
deployed* rule equivalence is **unverified** — recorded as a limitation, not a
claim.
