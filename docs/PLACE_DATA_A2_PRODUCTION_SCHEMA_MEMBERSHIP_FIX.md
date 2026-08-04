# Place Data A2.1 — production schema membership fix

**Implementation and test only. No deploy, no production write, no rules/Functions/index deploy.**

## Original incorrect assumption

The A2 closure evidence gatherer (`firestorePilotClosure.ts`, `countForBatch`)
assumed **all five** migrated collections were tagged with a batch field
(`migrationBatchId`, falling back to `batchId`). It counted every collection with:

```
where("migrationBatchId","==",batchId)  ||  where("batchId","==",batchId)
```

That assumption is false for two collections. The A2 production dry-run
therefore counted `place_publications = 0` and `place_publication_heads = 0`,
reported `writeTotal = 76` instead of `126`, and the tool **failed closed**
(dry-run ineligible: `publication_count_mismatch`, `publication_head_count_mismatch`,
`write_total_mismatch`). No write was ever attempted — the failure was safe, but
it blocked the legitimate closure.

## Deployed relationship model (confirmed against production, read-only)

| Collection | Count | Batch linkage in the deployed docs |
| --- | --- | --- |
| `place_registry` | 25 | **`migrationBatchId`** (batch-tagged); doc id = `canonicalPlaceId` |
| `place_publications` | 25 | **none** — linked by `placeId`; doc id = `publicationId`; also `versionNumber` |
| `place_publication_heads` | 25 | **none** — linked by `placeId` (doc id = `placeId`) + `activePublicationId` |
| `place_migration_aliases` | 25 | **`migrationBatchId`** (batch-tagged); doc id = legacy/provider id |
| `place_migration_audit` | 25 | **`batchId`** |
| `place_migration_batches` | 1 | the batch document itself |
| **total** | **126** | |

Publications and heads were written by the 1.14E migration without a batch
field; they belong to the pilot purely through the **canonical `placeId`**.

## Canonical membership method

`resolveMembership(db, batchId)`:

1. Query the registry by `migrationBatchId == batchId` (the only batch-tagged
   anchor). Derive the set of **unique `canonicalPlaceId`s** — must be 25.
   A repeated canonical id is `duplicate_canonical_id`.
2. Resolve publications by **`placeId` membership** in that set. Each place must
   have exactly one publication: 0 → `missing_publication`, >1 →
   `duplicate_publication`.
3. Resolve heads by **`placeId` membership** in that set. Each place must have
   exactly one head: 0 → `missing_head`, >1 → `duplicate_head`.
4. Verify each head's `activePublicationId` references an existing publication
   **for the same place**:
   - empty → `missing_active_publication`;
   - referenced publication does not exist → `dangling_head`;
   - referenced publication belongs to another place → `wrong_place_head`.
5. If a publication or head happens to carry a `migrationBatchId` that disagrees
   with the batch → `mismatched_optional_batch` (fail-closed; the field is
   never required and never backfilled).

Records whose `placeId` is **outside** the registry set are never fetched (the
queries are scoped to the set), so they are **ignored, not counted**.

These membership blockers are returned on the evidence object
(`membershipBlockers`) and the pure evaluator appends them to its blocker list —
so any single integrity failure makes the dry-run ineligible.

## Bounded query method (no composite index)

- Registry: one single-field equality query (`migrationBatchId ==`).
- Aliases / audit: one single-field equality query each.
- Publications / heads: `where("placeId","in",<chunk≤10>)` — 3 chunks for 25
  ids. `in` on a single field requires **no composite index**.
- Head→publication misses: at most one point `get()` per affected head.

**Active composite indexes required: 0.**

## No schema change, no backfill

- `ProductionPublicationRecord` and `ProductionPublicationHead` already do **not**
  declare `migrationBatchId` (only `place_registry` and the alias record do), so
  no source interface incorrectly required it — no type change was needed.
- The tool reads publications/heads without requiring a batch field and never
  writes or backfills `migrationBatchId` onto them. Deployed production records
  are left exactly as they are.

## Expected count and fail-closed cases

- Valid pilot → `publicationCount = 25`, `publicationHeadCount = 25`,
  `writeTotal = 126`, dry-run **eligible**.
- Fail-closed (dry-run ineligible, zero writes): `duplicate_canonical_id`,
  `missing_publication`, `duplicate_publication`, `missing_head`,
  `duplicate_head`, `dangling_head`, `wrong_place_head`,
  `missing_active_publication`, `mismatched_optional_batch`.
- The only successful mutation remains **one batch metadata update + one audit
  event** (`verificationResult → verified`, `globalCompletion` unchanged,
  `rollbackStatus` unchanged).

## Tests

`functions/src/domain/places/migration/__tests__/emulator/pilotClosure.emulator.test.ts`
seeds the production shape (registry batch-tagged; publications/heads untagged,
linked by `placeId`) and adds 17 A2.1 cases covering counts 25/25, total 126,
eligibility, every integrity failure above, outside-record ignoring, dry-run
zero writes, execute = 1 batch + 1 audit, and the second dry-run
(`alreadyVerified`). All existing A2 tests are preserved.
