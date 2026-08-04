# Place Data A2 — verificationResult contract

**Local implementation only. No production write, no deployment.**

## Purpose

Before A2 there was no defined set of `verificationResult` values. The production
migration script wrote a single hardcoded literal
(`functions/scripts/placeProductionMigration.ts:235`,
`verificationResult: "pending_post_write"`) and nothing else in the tree defined
what other values were legal. A1 correctly refused to invent one and deferred it
to A2.

A2 defines one authoritative contract in
`functions/src/domain/places/migration/verificationResult.ts` — a single source
of truth, no parallel enum.

## Values (locked)

| Value | Meaning |
| --- | --- |
| `pending_post_write` | Production migration writes completed, but post-write verification has not been formally completed. |
| `verified` | Post-write verification completed successfully for the specific migration batch. |
| `verification_failed` | Post-write verification ran but at least one required verification gate failed. |

`verified` means one batch passed post-write verification. It does **not** mean
the full legacy migration is complete — that is `globalCompletion`, a separate
field this contract never touches.

## The contract surface

- **Compile-time type** — `VerificationResult` = union of the three literals,
  derived from the `VERIFICATION_RESULTS` tuple (one declaration).
- **Runtime validator** — `isVerificationResult(v)` type guard;
  `parseVerificationResult(raw)` throws `VerificationResultError` on any unknown
  value (including `undefined`, `null`, numbers, or stale strings);
  `tryParseVerificationResult(raw)` returns `null` instead of throwing.
- **Transition validator** — `checkVerificationTransition(from, to, opts)` →
  `{ allowed, rejection }`; `canTransitionVerification`; `assertVerificationTransition`.
- **Serializer / parser** — `serializeVerificationResult` /
  `parseVerificationResult` (round-trip stable).
- **Backward compatibility** — `readVerificationResult(batchDoc)` reads the field
  from a raw batch document; the existing pilot document holding
  `"pending_post_write"` parses unchanged.

## Transition rules

Allowed via the **normal closure path**:

- `pending_post_write → verified`
- `pending_post_write → verification_failed`

Rejected (each with a specific reason code):

| Transition | Rejection code |
| --- | --- |
| `verified → pending_post_write` | `reopen_forbidden` |
| `verification_failed → pending_post_write` | `reopen_forbidden` |
| `verified → verification_failed` (normal path) | `verified_to_failed_forbidden_normal` |
| `verification_failed → verified` (normal path) | `recovery_requires_explicit_workflow` |
| unknown source value | `unknown_source_value` |
| unknown target value | `unknown_target_value` |
| no-op (`x → x`) | `no_op_transition` |
| any intended `globalCompletion` change | `global_completion_mutation_forbidden` |
| any intended `rollbackStatus` change | `rollback_status_mutation_forbidden` |

`verification_failed → verified` is not reachable through closure; it requires a
separate, explicit recovery workflow that does not exist in A2.

## Independence of globalCompletion and rollbackStatus

`verificationTransitionPatch(from, to, at)` returns only `verificationResult`
(and `verifiedAt` when moving to `verified`). It never emits `globalCompletion`
or `rollbackStatus`. A caller that signals intent to change either
(`intendedGlobalCompletionChange` / `intendedRollbackStatusChange`) is rejected
before any state is evaluated.

For pilot batch `PMB-925c3b83df84ce7016e99f1f`:

- `PILOT_VERIFICATION_ELIGIBLE = true`
- `GLOBAL_COMPLETION_ELIGIBLE = false`
- `globalCompletion` must remain `false`
- `rollbackStatus` must remain `available`

## Tests

`functions/src/domain/places/migration/__tests__/verificationResult.test.ts`
— 11 tests covering the 10 required cases plus the patch shape:

1. all three valid values accepted;
2. invalid string (and non-string) rejected;
3. `pending_post_write → verified`;
4. `pending_post_write → verification_failed`;
5. `verified → pending_post_write` rejected;
6. `verified → verification_failed` rejected (normal closure);
7. `verification_failed → verified` rejected (normal closure);
8. `globalCompletion` independence;
9. `rollbackStatus` independence;
10. serialization compatibility with the existing pilot document;
11. transition-patch shape.

Run: `npm test` (part of the migration unit suite).
