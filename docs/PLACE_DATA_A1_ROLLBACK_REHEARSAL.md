# Place Data A1 — Rollback rehearsal

**Emulator / in-memory only. No production credential was used and no
production document was read or written by this rehearsal.**

Implemented as `functions/src/domain/places/migration/__tests__/a1RollbackRehearsal.test.ts`
(6 tests, all passing inside the unit suite).

## Fixture composition

| Shape | Record |
| --- | --- |
| exact provider identity | `ChIJ_mock_referenced` with 8 reference pointers |
| likely duplicate | `places_cache/dup_referenced` reusing that same provider id |
| different branch, similar name | two "Restoran Ali" — Shah Alam and Bangi |
| unknown rating / hours / price | "Gerai Tanpa Maklumat" with all three undefined |
| unrelated control | `ChIJ_control_untouched`, never planned into the batch |

## Sequence and result

1. **Dry run** — produces candidates; plan status is not `executed`; the control
   record never appears in the plan.
2. **Migration** (emulator) — `wroteProductionData=false`,
   `deletedLegacyData=false`, every canonical record `emulatorOnly=true` and
   `published=false`; legacy inventory byte-identical before and after.
3. **Verification** — branch conflict and field honesty, below.
4. **Rollback** — every alias created by the migration becomes `rolled_back`;
   **no alias is deleted** (count unchanged); execution audit survives.
5. **Second rollback** — alias id/status set is deepEqual to the first;
   a genuine no-op.
6. **Deterministic re-migration** — identical input produces an identical result
   shape (canonical/alias/audit counts and both safety flags).

**Unrelated mutation count: 0.** The control record is byte-identical after
migration and after both rollbacks.

## Branch-conflict handling — the contract, corrected

My first version of this test asserted that *both* "Restoran Ali" branches
migrate. That was wrong, and the product was right: the pair is flagged
`branch_conflict` at planning time and produces **zero** canonical records.
Different branches are never auto-merged and never silently migrated; they wait
for manual review. The test now asserts that.

## Unknown-field honesty

Canonical records are keyed by `canonicalPlaceId` and carry no provider id, so
the unknown-fields record is located by display name. Its canonical record
contains **no** `rating`, **no** `priceEstimate`/`priceLevel` and **no**
`isOpen` field at all — a missing rating never becomes 0, a missing price never
gains a band, missing hours never become "open".

## Audit retention

Rollback is append-only with respect to audit: execution audit entries remain
after both rollbacks. Aliases are marked, never removed.
