# Place Data A2 — pre-deployment report

**Status: local implementation and remote source custody only. No production
write, no rules deployment, no Functions/index deployment occurred in this
session.**

## Commit

- **Starting commit (baseline):** `120d42e` — "verify place data backend and
  pilot migration readiness".
- **A2 branch:** `place-data/a2-pilot-closure`.
- **A2 commit:** one commit, "define verification contract and prepare pilot
  closure". Its exact SHA is captured by the push-verification step
  (`git rev-parse`) and recorded in the phase final report — a document cannot
  contain its own commit hash without amending, which this phase forbids.

## Test totals (this session)

| Suite | Command | Result |
| --- | --- | --- |
| Functions build | `npm run build` | exit 0 |
| TypeScript compile | `tsc --noEmit -p tsconfig.json` | exit 0 |
| Unit suite (all Place Data domains) | `npm test` | 608 pass, 0 fail, 0 skipped |
| Emulator suite (first run) | `npm run test:emulator` | 50 pass, 0 fail |
| Emulator suite (second consecutive run) | `npm run test:emulator` | 50 pass, 0 fail |
| Rules-emulator suite | `npm run test:rules` | 155 pass, 0 fail |
| Closure-tool (pure + contract) | targeted | 32 pass |
| Closure-tool (emulator) | targeted | 7 pass (within the 50) |
| Migration dry-run + core | targeted | 61 pass |
| Rollback | targeted | 8 pass |
| Dedup | targeted | 43 pass |
| Branch protection | targeted | 19 pass |
| Freshness / eligibility | targeted | 38 pass |
| Provenance (staging) | targeted | 40 pass |
| Canonical reader | targeted | 15 pass |
| Pool / coverage | targeted | 90 pass |

`getNearbyPlaces` and a dedicated `rollout` suite have no standalone test file in
this backend checkout; the canonical read resolver (15) and the full 608-test
unit suite cover those paths. No skipped test was hidden.

## verificationResult contract

Values (locked): `pending_post_write`, `verified`, `verification_failed`.
`verified` = one batch passed post-write verification; it does **not** mean the
full legacy migration is complete (`globalCompletion` is separate and untouched).

## Transition rules

- Allowed (normal closure): `pending_post_write → verified`,
  `pending_post_write → verification_failed`.
- Rejected: `verified → pending_post_write` (`reopen_forbidden`);
  `verified → verification_failed` normal (`verified_to_failed_forbidden_normal`);
  `verification_failed → verified` normal (`recovery_requires_explicit_workflow`);
  unknown source/target; no-op; any intended `globalCompletion` or
  `rollbackStatus` change.

## Closure preconditions

Batch exists; `pending_post_write`; `globalCompletion=false`;
`rollbackStatus=available`; source 25; migrated 25; write total 126; registry 25;
publication 25; publication-head 25; alias 25; migration-audit 25 (before);
orphan 0; duplicate 0; branch-conflict 0; manifest + candidate checksum + backup
reference present/matching; legacy source unchanged.

## Expected production mutation scope (for the future controlled deployment)

For `PMB-925c3b83df84ce7016e99f1f`, execute would perform exactly:

- **1** field update on the batch document (`verificationResult` →
  `verified`, plus `verifiedAt`);
- **1** appended audit event (`pilot_verification_completed`);
- **total 2 writes.**

Unchanged: `globalCompletion=false`, `rollbackStatus=available`. Zero canonical,
publication, publication-head, alias and legacy mutations.

## Explicit rules scope

Three A1 additive denials — `place_registry`, `places_pool_v3`,
`place_migration_batches` — each `allow read, write: if false`. Unchanged since
`120d42e`. No client read or write permission is added anywhere; deployed
behaviour is equivalent to the previous Firestore default denial. Sibling Place
Data rules are unchanged.

## Active composite indexes required

**0.** No active query in this phase requires a composite index. The closure
tool's emulator queries use single-field equality only, and the audit
uniqueness check filters in memory.

## Not performed in this session

- Production metadata write: **not performed.**
- Firestore rules deployment: **not performed.**
- Functions deployment: **not performed.**
- Index deployment: **not performed.**
- Production migration / correction / publication: **not performed.**

## Next controlled deployment procedure (separate, owner-authorized session)

1. Deploy `firestore.rules` (the three additive denials only) — behaviour
   equivalent to default deny; grants no access.
2. Read-only verification: re-run the bounded cross-collection check; confirm
   25/25/25/25/25 and the 126-document total unchanged.
3. Run the closure tool in **dry-run** against `makanmana-c59f3` and confirm
   `eligible=true`, `mutationRequired=true`, zero writes.
4. Run the closure tool with `--execute --source-commit=<A2 sha>`; confirm the
   redacted report shows `verificationResult=verified`, `globalCompletion=false`,
   `rollbackStatus=available`, write count 2, one audit event.
5. Post-execute read-only re-verification and 15-minute observability
   (denied-request rate, `getNearbyPlaces` / correction error rate, canonical
   fallback rate).
6. Rollback trigger/procedure per
   `docs/PLACE_DATA_A1_CONTROLLED_PILOT_CLOSURE_PLAN.md`: rules rollback is
   re-deploying the previous `firestore.rules`; the metadata change is a single
   field, reversible to `pending_post_write` only through an explicit recovery
   workflow (never the normal closure path). Data rollback is out of scope and
   must not be triggered by a rules issue.

---

## A2.1 update — production membership fix (supersedes the count method above)

The A2 production dry-run failed closed because the evidence gatherer counted
`place_publications` and `place_publication_heads` by a batch field those
collections do not carry in production (0/25 each, `writeTotal` 76 ≠ 126). A2.1
fixes the gatherer to resolve those two collections by **canonical `placeId`
membership** anchored on the batch-tagged registry.

- Deployed relationship model (confirmed read-only): registry & aliases are
  `migrationBatchId`-tagged; audit carries `batchId`; publications link by
  `placeId` (doc id = `publicationId`); heads link by `placeId` (doc id =
  `placeId`) + `activePublicationId`. Total 126 = 25/25/25/25/25/1.
- Membership method + fail-closed cases: see
  `PLACE_DATA_A2_PRODUCTION_SCHEMA_MEMBERSHIP_FIX.md`.
- **Active composite indexes required: 0** (single-field equality + `in`).
- **No schema backfill**; publications/heads are read without requiring, and
  never written a, `migrationBatchId`.
- Expected production write scope is unchanged: **one batch metadata update +
  one audit event**; `globalCompletion` stays `false`, `rollbackStatus` stays
  `available`.

Backend suite after A2.1: **608 unit / 64 emulator (twice consecutively) / 155
rules**, all green; 0 skipped. No deploy and no production write were performed
in the A2.1 session.
