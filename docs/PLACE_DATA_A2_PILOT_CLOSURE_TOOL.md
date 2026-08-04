# Place Data A2 — trusted pilot closure tool

**Local implementation only. No production write, no deployment in this session.**

## What it does

Closes exactly one **verified** pilot batch by moving its `verificationResult`
from `pending_post_write` to `verified` and appending exactly one compatible
migration audit event. It changes nothing else: `globalCompletion` stays
`false`, `rollbackStatus` stays `available`, and no canonical / publication /
head / alias / legacy record is touched.

## Files

| File | Role |
| --- | --- |
| `functions/src/domain/places/migration/pilotClosure.ts` | Pure core: evidence evaluation, decision, audit-event builder, redacted report, CLI guards. No firebase import. |
| `functions/src/domain/places/migration/firestorePilotClosure.ts` | Firestore adapter: read-only evidence gathering + a single optimistic transaction. Not barrelled. |
| `functions/scripts/placePilotClosure.ts` | Owner CLI. Dry-run by default. |

## Safety properties

- **Dry-run by default.** The CLI writes nothing unless `--execute` is passed.
- **Exact project and batch.** `--confirm-project=makanmana-c59f3`,
  `--batch=PMB-925c3b83df84ce7016e99f1f`, and `--confirm-batch` must match
  `--batch` exactly. Wildcards, commas, whitespace and `..` are refused.
- **Single batch only.** No multiple-batch or wildcard execution path exists.
- **Optimistic transaction.** The write runs in one Firestore transaction whose
  preconditions re-check, inside the transaction, that the batch is still
  `pending_post_write`, `globalCompletion` is still `false`, and `rollbackStatus`
  is still `available`. Any drift aborts with `closure_precondition_failed`.
- **Idempotent.** A repeated run against an already-verified batch returns
  `alreadyVerified=true`, `mutationRequired=false`, and writes nothing. The audit
  event has a deterministic id (`closureAuditId(batchId)`), so it can never be
  appended twice.
- **Redacted report only.** The batch id and audit id are masked; no credentials
  and no unrestricted production documents are printed.

## Preconditions verified before proposing a write

`evaluateClosure` returns `eligible` only when every one of these holds:

- batch exists; `verificationResult = pending_post_write`;
- `globalCompletion = false`; `rollbackStatus = available`;
- `sourceCount = 25`; `migratedCount = 25`; write total `= 126`;
- registry `= 25`; publication `= 25`; publication-head `= 25`; alias `= 25`;
  migration-audit `= 25` (before closure);
- orphan `= 0`; duplicate `= 0`; branch-conflict `= 0`;
- manifest checksum, candidate checksum and backup reference present (and, for a
  production run, matching the injected reference values);
- legacy source unchanged per the migration contract.

Any mismatch becomes a typed blocker (e.g. `registry_count_mismatch`,
`orphan_detected`, `manifest_checksum_mismatch`) and the closure is refused with
zero writes.

## The one successful outcome

```
verificationResult = verified
globalCompletion   = false   (unchanged)
rollbackStatus     = available (unchanged)
```

Plus exactly one appended audit event:

```
action:                  pilot_verification_completed
batchId:                 <pilot batch>
verificationResult:      verified
globalCompletion:        false
migrationWritePerformed: false
evidenceReference:       <checksum / A1 plan reference>
sourceCommit:            <git sha>
```

The event uses the existing `place_migration_audit` collection and the same
document shape the production migration script already writes — no parallel
audit collection, no incompatible event.

## Repeated dry-run against a verified batch

```
alreadyVerified = true
mutationRequired = false
```

## Invocation (controlled deployment only — not run in this session)

```bash
# Dry-run (read-only, zero writes)
node lib/scripts/placePilotClosure.js \
  --confirm-project=makanmana-c59f3 \
  --batch=PMB-925c3b83df84ce7016e99f1f \
  --confirm-batch=PMB-925c3b83df84ce7016e99f1f

# Execute (owner-authorized controlled deployment; adds --execute + --source-commit)
node lib/scripts/placePilotClosure.js \
  --confirm-project=makanmana-c59f3 \
  --batch=PMB-925c3b83df84ce7016e99f1f \
  --confirm-batch=PMB-925c3b83df84ce7016e99f1f \
  --execute --source-commit=<sha>
```

## Tests

- Pure: `functions/src/domain/places/migration/__tests__/pilotClosure.test.ts`
  (21 tests) — eligibility and every rejection.
- Emulator:
  `functions/src/domain/places/migration/__tests__/emulator/pilotClosure.emulator.test.ts`
  (7 tests) — execute transition, flags unchanged, single audit, idempotency,
  no canonical/publication/head/alias/legacy change, write count = 2, dry-run
  zero writes, tampered-batch refusal. Runs in an isolated emulator project
  namespace so it never pollutes sibling suites.
