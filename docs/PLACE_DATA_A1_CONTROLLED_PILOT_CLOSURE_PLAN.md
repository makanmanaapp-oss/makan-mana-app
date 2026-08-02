# Place Data A1 — Controlled pilot closure plan

**Prepared, not executed. Nothing in this document was applied to production.**

```
PILOT_VERIFICATION_ELIGIBLE=true
GLOBAL_COMPLETION_ELIGIBLE=false
```

## Why pilot verification is eligible

All 25 migrated places pass every cross-collection check: registry 25/25,
publications 25/25, publication heads 25/25 (each pointing at the correct active
publication), aliases 25/25, audit 25/25. Orphans 0, duplicates 0, branch
conflicts 0. Observed document total 126 = the migration report's recorded 126
writes, distributed 25/25/25/25/25/1. Field honesty passes with all four
fabrication probes at 0. Backup reference, manifest checksum and candidate
checksum are all present on the batch.

## Why global completion must remain false

Production holds **871** `place_details` and **112** `places_cache` records; the
pilot migrated **25**. The migration report records `canonicalBefore.place_details = 626`
against 871 today, so the legacy corpus is still growing. Nothing in the batch,
the report or the source defines 25 as the complete eligible scope.
`globalCompletion` stays `false`.

## Blocking finding — there is no approved success value yet

The brief asks for the valid approved `verificationResult` value. **The source
contract does not define one.** `verificationResult` is written exactly once, as
a hardcoded literal:

```
functions/scripts/placeProductionMigration.ts:235
  migrationVersion: "1.14E.1", verificationResult: "pending_post_write",
```

There is no enum, union or schema listing any other value. The only other
`"verified"` literals in the tree are `evidenceLevel` values in the dedup
signals — unrelated. **I will not invent one.**

Consequence: closure requires a **code change first** — define the permitted
`verificationResult` values in the migration contract, with a test, and only
then propose a metadata update. That is a Phase A2 task, not a production
action.

## Proposed change set (for A2, once the value exists)

| Item | Proposal |
| --- | --- |
| Batch | `PMB-925c3b83df84ce7016e99f1f` — single field `verificationResult` only |
| Value | **TBD — must be defined in the contract first** |
| `globalCompletion` | unchanged, `false` |
| `rollbackStatus` | unchanged, `available` |
| Rules | deploy the 3 additive denials: `place_registry`, `places_pool_v3`, `place_migration_batches` |
| Indexes | **none** — 0 composite indexes required by active queries |

## Rollout order

1. Deploy rules (additive denial only; no client access granted anywhere).
2. Read-only verification: re-run the bounded cross-collection check; confirm
   25/25/25/25/25 and 126 documents unchanged.
3. Only then, in a separate step, the batch metadata update.

## Verification, observability, rollback

- **Post-deploy verification (read-only):** collection counts unchanged; client
  read of each of the three collections denied; canonical read path still
  resolves alias → registry → head → publication.
- **Observability:** 15 minutes — Firestore denied-request rate, `getNearbyPlaces`
  and `submitPlaceCorrection` error rate, no rise in canonical-read fallback.
- **Rollback trigger:** any client-facing read regression, any rise in canonical
  fallback, any 5xx on the two deployed callables.
- **Rollback procedure:** rules are additive denials, so rollback is
  re-deploying the previous `firestore.rules`. The batch metadata update is a
  single field and is reversible to `pending_post_write`. Data rollback is not
  in scope and must not be triggered by a rules issue.

## Prohibited

No data migration, no publication, no correction write, no data rollback, no
index deployment, no Functions deployment, no claims or permissions change, no
`globalCompletion` change.
