# Place Data A0 — Backend source custody

Recovered from `makan_mana` (branch `issue-001.2-sport-mood-localization`,
HEAD `06576fe`) into a clean worktree on `place-data/a0-backend-source-custody`
branched from that same commit.

## Why this was urgent

Production has been running a Place Data backend whose source existed **only as
untracked working-tree files**. Migration batch `PMB-925c3b83df84ce7016e99f1f`
wrote 126 documents to production from code with no commit behind it. Losing
that working tree would have made the live behaviour unreproducible and
un-rollbackable.

## Deployed-source provenance — verified

`getNearbyPlaces` (GEN_2, nodejs22, build `36253bcc-…`) source archive was
downloaded from `gcf-v2-sources-…` generation `1785578626200678` and compared:

- **130 / 130** place domain modules present in both the deployed archive and
  the recovered source — **0 deployed-only, 0 recovered-only**;
- dedup constants identical: `providerId 0.4`, `verifiedPhone 0.2`,
  bands `exact 0.95` / `review 0.8` / `possible 0.55`.

This is a module-set and constant-level match, not a byte-level TS→JS proof.

## Test reproducibility — all green

| Tier | Result |
| --- | --- |
| unit | **570 / 570** |
| emulator | **44 / 44** |
| rules-emulator | **147 / 147** |
| **total** | **761 / 761**, 0 failed, 0 skipped |

`npm ci` and `npm run build` both exit 0. No test contacted production.

## The one file that could not be recovered

`functions/src/callable/getNearbyPlaces.ts` is **left at its committed
`06576fe` state**. Its uncommitted version is inseparable from Part 2
recommendation work: it imports `algorithm2Flags`, `unifiedRanking`,
`sessionEngine`, `recommendationContextBuilder`, `rolloutService`,
`liveEligibility`, `expandedPoolService`, and adds `cursor` / `forceLegacy` to
`GetNearbyInput`. Recovering it would have dragged in algorithm2 — which the A0
brief forbids. Deferred to the phase that recovers Part 2.

Consequence: the canonical-reader **callsite** is not in this checkpoint, though
the canonical reader itself and all 130 domain modules are.

`functions/src/callable/correctionObservability.ts` was missed by the initial
name-based inventory and added after the compiler flagged it.
