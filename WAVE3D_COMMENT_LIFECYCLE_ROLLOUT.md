# WAVE 3D entry gate 1 — post-comment lifecycle rollout runbook

**Status: NOT EXECUTED.** Every phase below is a production operation and none
of them has been performed. This document is source only.

Scope: `feed_posts/{postId}/comments/{commentId}` ONLY. `menu_comments` is a
separate Wave 3C domain with its own vocabulary (visible/hidden/removed) and is
deliberately untouched.

## THIS BRANCH IS CROSS-WAVE — C1-C9 ARE NOT INDEPENDENT

`feature/wave3-content-engagement` already carries **accumulated** changes:

- **Wave 3C** — feed-post lifecycle, status-aware feed queries, repost snapshot
  security (see `WAVE3C_POST_LIFECYCLE_ROLLOUT.md`);
- **Wave 3D entry gate 1** — the comment lifecycle in this document.

Three artefacts are **shared and deploy as a whole**:

| Artefact | Consequence |
| --- | --- |
| the app binary | one build ships Wave 3C feed queries AND Wave 3D comment changes together |
| `firestore.rules` | one file; `firebase deploy --only firestore:rules` activates BOTH waves at once |
| `firestore.indexes.json` | one file; an index deploy pushes both waves additive indexes |

**Nothing in C1-C9 may be read as an independently shippable step.** Every
release/deploy gate below also requires the corresponding Wave 3C preconditions
to be satisfied under the Wave 3C rollout contract.

## The blocker this closes

The comment read rule already denied a non-author any comment whose
`status == "deleted"` — and `deleteUserComment` really writes that. But
`commentsProvider` listed a post's comments with **no lifecycle constraint**.
A Firestore list query fails **entirely** when it can return a document the
rules reject, so **one soft-deleted comment made the whole thread
permission-denied for everyone except the post author.**

Adding `where status == "active"` alone was not safe either: legacy comments
carry no `status` field at all, and Firestore equality excludes documents where
the field is absent — every legacy comment would have vanished. Hence the
complete package:

| Leg | Where | Contract |
| --- | --- | --- |
| WRITER | `lib/features/social/comment_sheet.dart` + `firestore.rules` | every new comment is born `status: "active"`, enforced client- AND server-side |
| QUERY | `lib/features/social/social_providers.dart` → `commentsProvider` | the normal thread filters `status == "active"` |
| RULES | `firestore.rules` → `commentLifecycleActive()` | non-author read requires exactly `"active"` + readable parent |
| LEGACY | `functions/scripts/feedPostCommentStatusBackfill.ts` | comments whose `status` FIELD IS ABSENT are normalized to `"active"`; any present-but-invalid value is UNKNOWN and never written |

## Lifecycle vocabulary

`active` (normal) and `deleted` (user soft-delete). No hidden state is invented
— nothing in the current code uses one for post comments. Future states can be
added without weakening anything, because the consumer predicate is an
**allowlist of exactly `"active"`**, not a denylist. Absent and unknown both
fail closed for non-authors.

### TRUE-MISSING is the only normalizable class

The backfill classifies the stored DOCUMENT, not a bare value:

| Stored | Class | Backfill |
| --- | --- | --- |
| no own `status` property | `missing` | set to `"active"` |
| `"active"` | `active` | untouched |
| `"deleted"` | `deleted` | untouched |
| `null`, `""`, `"   "`, `" active "`, `"ACTIVE"`, `"hidden"`, `0`, `false`, `{}`, `[]` | `unknown` | **never written**, reported by id |

A field that is PRESENT but malformed may represent corruption, an abandoned
lifecycle, or an unexpected writer. The migration must never guess that it means
active, so every such value blocks the completeness gate until a human decides.

## Phase C1 — write-path SOURCE READINESS (not an independent release)

The comment composer stamps `status: 'active'` (`comment_sheet.dart`), and that
code is compatible with both the current and the Phase C8 rules.

**C1 is a SOURCE / WRITE-PATH READINESS gate, not a shipping instruction.**
An app build cut from this branch also contains the Wave 3C status-aware feed
queries (`publicFeedProvider`, `followingFeedProvider`, `trendingFeedProvider`,
`groupFeedProvider`, and the other-profile branch of `userPublicPostsProvider`).

### CROSS-WAVE APP RELEASE GATE

Before ANY production app release cut from this branch:

- [ ] the Wave 3C feed-post lifecycle migration/backfill requirements are
      satisfied **according to the Wave 3C rollout contract**
      (`WAVE3C_POST_LIFECYCLE_ROLLOUT.md`, phases 1-6), and
- [ ] the Wave 3C repost writer/client compatibility step (7A) is satisfied.

Otherwise legacy `feed_posts` that carry no `status` **disappear from consumer
feeds** the moment the build reaches users: the Wave 3C queries filter on
`status == "active"`, and Firestore equality excludes documents where the field
is absent.

**Gate (source):** the comment writer is lifecycle-aware in source and
`npm test` proves it. **Gate (release):** both boxes above are ticked under the
Wave 3C contract. Verifying that a freshly posted comment shows
`status: "active"` happens after that combined release, not before it.

## Phase C2 — comment index READY

Deploy `firestore.indexes.json` and wait until the new index reports **Ready**.

| Index | Query it serves |
| --- | --- |
| `comments` (COLLECTION scope): `status ASC, createdAt ASC` | `commentsProvider` — `where('status','==','active').orderBy('createdAt')` on `feed_posts/{postId}/comments` |

That is the only index added. The existing `comments` field overrides
(`authorUid`, `parentVisibility`, COLLECTION_GROUP scope) are untouched and
still serve `myCommentsProvider`. No index was removed.

### INDEX DEPLOY IS ACCUMULATED

`firestore.indexes.json` is a shared, accumulated file. An index deploy pushes
**every** index in it, including the Wave 3C feed-post indexes, not just the
comment one. All of them are additive — no index was removed or modified by
either wave — which is what makes a combined deploy acceptable, but it must be
reviewed as a whole, not described as if only one comment index existed in the
deployed file.

Wave 3D itself added **exactly one** index (the row above).

**Gate:** review the whole file as additive, then wait until **every index
required by the production build** — the Wave 3C feed indexes and this comment
index — reports **Ready**. Do not proceed while any is Building.

## Phase C3 — legacy comment normalization DRY RUN

```
npx tsx functions/scripts/feedPostCommentStatusBackfill.ts \
  --mode=dry-run --max-documents=20000 --output=../reports
```

Zero writes. Review: `scanned`, `missingStatus`, `wouldUpdate`, `updated`
(must be 0), `alreadyActive`, `deleted`, `unknownStatus`, `errors`,
`skippedForeignPath`, `resumeCursor`, `truncated`.

The scan uses `collectionGroup("comments")` for reach, but **every document is
re-checked against the real path shape** (`feed_posts/*/comments/*`) before
anything is written. A `comments` subcollection under any other parent is
counted in `skippedForeignPath` and skipped; the top-level `menu_comments`
collection can never match a collection-group named `comments` at all.

**Gate:** `unknownStatus == 0` and `truncated == no`. Unknown ids are listed
(bounded to 50 per run) — decide each by hand. Every present-but-invalid value
lands here on purpose: `null`, `""`, `"   "` and a padded `" active "` are all
byte-different from what the rules accept, so none of them is treated as
missing and none is silently rewritten.

### Invocation safety wording

ZERO-WRITE is the **default safety posture**: the CLI cannot write without both
`--mode=apply` and the bare `--apply`, plus `--confirm-project`. It does NOT
follow that a bare invocation performs a dry run — the CLI **refuses** to run
with no `--mode` at all (`refused: --mode=dry-run or --mode=apply is required`).
A dry run must be asked for explicitly.

## Phase C4 — review the counts

Required before any write: `unknownStatus == 0`, `errors == 0`, and the full
collection group scanned (`truncated: no`). `--max-documents` is capped at
20 000, so a larger corpus **must** be chunked with
`--start-after=<resumeCursor>` — the cursor is a full document path.

## Phase C5 — legacy comment normalization APPLY

```
npx tsx functions/scripts/feedPostCommentStatusBackfill.ts \
  --mode=apply --apply --confirm-project=makanmana-c59f3 \
  --max-documents=20000 --output=../reports
```

Only comments whose `status` FIELD IS ABSENT are written, and only
`{status: "active"}`. `active` and `deleted` are never touched, so the run
cannot resurrect a comment its author deleted, and a PRESENT-but-invalid value
(`null`, `""`, `"   "`, `" active "`, `0`, `{}`, …) is UNKNOWN and is never
written. Nothing else is written — not `authorUid`, `text`, `parentCommentId`,
`postId`, `parentVisibility`, `createdAt`, `updatedAt`, nor any identity
snapshot field.

Writes are **per document and preconditioned** on the exact version read
(`lastUpdateTime`). If the author soft-deletes or edits a comment between the
scan and the write, the precondition fails, that one document is counted in
`errors`/`Error ids`, and it is never clobbered back to `active`.

**Gate:** `updated == missingStatus`, `errors == 0`, `truncated == no`.

## Phase C6 — verify

Re-run Phase C3 over the whole collection group, chunking until nothing is
truncated. Required:

```
missingStatus     = 0
unknownStatus     = 0
errors            = 0
truncated         = no
Phase C6 complete = YES
```

`commentBackfillIsComplete()` encodes this gate and is answerable from a dry run
(dry run: "nothing left to do"; apply: "everything found was done"). A truncated
scan can never report YES.

**Do not proceed to C7 or C8 while any comment still lacks a status** — under
the Phase C8 rules such a comment becomes unreadable to everyone but its author,
and its thread would lose it.

### C6 IS NOT PERMANENTLY VALID

C6 proves a point-in-time fact. Until the final rules are live, an **older app
that is still compatible with the current rules can create a NEW comment with
no `status` field at any moment**, silently invalidating C6.

C6 therefore cannot be carried forward to C8. Both halves of C7A must be
satisfied FIRST — the compatibility decision (C7A-1) **and** proof that
lifecycle-less comment creation is impossible (C7A-2) — and only then may the
FINAL DELTA verification (C7B) run. Re-running the scan closer to the deploy
shrinks the window but does NOT close the race; only genuine write closure does.

## Phase C7A — OLD-CLIENT COMPATIBILITY DECISION + WRITE-CLOSURE GATE

The final rules require `request.resource.data.status == "active"` on create.
**An older app that omits `status` loses comment creation the instant C8 lands.**
Choosing a minimum version number is NOT a gate — a number enforces nothing.

This phase has TWO SEPARATE requirements. Recording the compatibility decision
is not the same as closing the data race, and neither substitutes for the other.

### C7A-1 — record the compatibility DECISION

The owner must have ONE explicitly approved outcome recorded:

- [ ] **OPTION A** — a real minimum-version / force-update / supported-client
      enforcement mechanism is ACTIVE, and incompatible clients can no longer
      reach comment creation.
- [ ] **OPTION B** — the owner explicitly accepts that old clients lose comment
      creation, recorded as an approved production compatibility break.

### C7A-2 — prove LIFECYCLE-LESS COMMENT CREATION = IMPOSSIBLE

Independently of which option was chosen, C8 release safety additionally
requires that a lifecycle-less comment **cannot be created at all** before the
final C7B verification begins:

- [ ] **LIFECYCLE-LESS COMMENT CREATION = IMPOSSIBLE** at the moment C7B starts.

**Under OPTION A** this follows directly from the enforced client compatibility:
incompatible clients can no longer reach comment creation, so no status-less
write can occur.

**Under OPTION B this does NOT follow.** Accepting the break tells you what will
happen to old clients *after* the rules land; it does nothing about the window
*before* they land, during which those same old clients are still creating
status-less comments. Option B therefore requires a SEPARATE owner-approved
**write-quiescence / write-closure** mechanism, described generically as, for
example:

- a controlled maintenance / write freeze, OR
- another approved mechanism that proves incompatible writers cannot create
  status-less comments during the C7B-verification-to-C8-deploy window.

**No such mechanism was built here, and none is known to exist in this
repository.** It must not be invented as part of this runbook.

Stated plainly, so the two are never conflated:

> **OPTION B = the owner accepts an old-client comment-create break.**
>
> **OPTION B != permission to tolerate a lifecycle-less data race.**

Option B is a compatibility POLICY decision. It remains available as such,
and it still requires write quiescence before C7B and C8.

### Outcome

- Owner has not yet selected A or B → **C8 is HOLD.**
- **OPTION B selected but no approved write-quiescence mechanism exists →
  C7B FINAL GATE = HOLD and C8 = HOLD.** Selecting Option B does **not** by
  itself unlock C8.
- Option A active, or Option B plus an approved write-closure mechanism →
  proceed to C7B.

## Phase C7B — FINAL DELTA VERIFICATION (deterministic, after C7A-2)

**PRECONDITION — do not start this phase until C7A-2 is satisfied.** It must
already be PROVEN that incompatible / lifecycle-less writers cannot write. This
is a precondition, not a mitigation: shrinking the gap between the scan and the
deploy is explicitly NOT accepted as safety closure, because a single
status-less comment created in that gap silently invalidates the scan.

Order is mandatory:

1. **Prove** lifecycle-less comment creation is impossible (C7A-2).
2. **Then** run the full Phase C3 delta scan over the whole collection group.

Required result:

```
missingStatus = 0
unknownStatus = 0
errors        = 0
truncated     = no
```

Because writes are ALREADY CLOSED to incompatible clients before the scan runs,
this result **remains valid through to C8**. That is what closes the C6-to-C8
race — not the recency of the scan.

**Gate:** C7A-2 proven, THEN a full delta scan satisfying all four lines.

**If lifecycle-less writes can still occur after the scan — for any reason —
C7B FAILS and both C7B and C8 are HOLD.** The C6-to-C8 race must not be
described as closed in that state.

## Phase C7 — release the status-aware thread query

Ship the app build whose `commentsProvider` carries
`where('status', isEqualTo: 'active')`. Safe against both old and new rules.

`myCommentsProvider` (own comments) and `userPublicRepliesProvider` are
deliberately **not** constrained — see "Owner access decision" below.

## Phase C8 — deploy the final rules (CROSS-WAVE HARD GATE)

```
firebase deploy --only firestore:rules
```

### THIS DEPLOYS THE ENTIRE FILE — BOTH WAVES

There is ONE `firestore.rules` in this repo. This command activates the Wave 3C
**post** lifecycle rules and the Wave 3D **comment** lifecycle rules together.
**C8 MUST NOT proceed merely because C1-C7 are complete.**

Both domains must be safe first.

**WAVE 3C — post side**

- [ ] new feed-post writers are lifecycle-aware and deployed
- [ ] required post indexes are Ready
- [ ] feed-post legacy status normalization COMPLETED and VERIFIED
      (`missingStatus = 0`, `unknownStatus = 0`, `errors = 0`, not truncated)
- [ ] status-aware feed queries are safely released/ready per the Wave 3C plan
- [ ] the repost snapshot production safety steps required before any
      moderation-suppression claim are completed per the Wave 3C runbook

**WAVE 3D — comment side**

- [ ] a compatible comment writer is released
- [ ] the comment index is Ready
- [ ] the comment missing-status backfill is COMPLETED
- [ ] C7A-1 old-client compatibility resolved as OPTION A or OPTION B
- [ ] **lifecycle-less post-comment creation is impossible from completion of
      C7B through completion of the `firestore.rules` deployment** (C7A-2 —
      a SEPARATE requirement from merely choosing OPTION A or B; under
      OPTION B this needs an approved write-quiescence mechanism)
- [ ] C7B final delta verification passes: `missingStatus = 0`,
      `unknownStatus = 0`, `errors = 0`, `truncated = no`

Only when EVERY box above is ticked may the current `firestore.rules` deploy.

```
function commentLifecycleActive(c) {
  return c.get('status', '') == 'active';
}
```

Applied to both comment surfaces (the nested `match /comments/{commentId}` read
and the collection-group `allow get`), always as the **second** branch so the
author bypass stays first. Note the deliberate absence of a
`get('status','active')` default — that default is what made a soft-deleted
comment indistinguishable from a legacy one. Phases C5 and C6 are what make the
strict form safe.

Client `create` additionally requires `request.resource.data.status == 'active'`,
so a malicious or stale client cannot create a comment that is already deleted,
unknown-status, or lifecycle-less. `allow update: if false` is unchanged, so a
client can never move a lifecycle afterwards.

## Phase C9 — production E2E (EXPECTED / NOT YET EXECUTED)

These are FUTURE acceptance criteria. Nothing below has been run.

- [ ] Active comment on an active public post is readable by a non-author.
- [ ] A soft-deleted comment is absent from the thread **and does not break it**.
- [ ] Unknown status — non-author denied.
- [ ] Hidden or deleted parent post — comments closed to non-authors.
- [ ] The comment author still reads their own deleted comment.
- [ ] Client create without `status` is denied; with `status: "active"` succeeds.

## Owner access decision (recorded deliberately)

- **Comment author** keeps reading their own comment in every state, including
  deleted and legacy. The author branch of the read rule is unchanged and runs
  first. `myCommentsProvider` lists only the caller's own comments
  (`allow list` requires `authorUid == request.auth.uid`) and is **not**
  constrained: adding `status == "active"` would also hide the author's own
  legacy comments from them, with no security benefit.
- **Post author** has no special comment privilege. They cannot read another
  user's deleted comment — only the comment's own author can.
- `userPublicRepliesProvider` resolves each comment with a per-item GET inside
  `try/catch`, so rules remain the boundary; a denied legacy or deleted comment
  is simply skipped.

## Trigger / notification note

`onCommentChanged` fires only on create and delete
(`if (!created && !deleted) return;`), and the notification block sits inside
`if (created)`. A soft-delete is an **update**, so it can never emit a
new-comment notification and no duplicate is possible. Stamping `status` at
creation does not change which branch runs.

Pre-existing and **out of scope** (fixing it would require broadening the
trigger, which this gate forbids): because a soft-delete is an update, the
`public_reply_activity` row for that comment is not removed. Those rows carry
ids only — no text — and every comment GET re-checks the live parent, so no
content leaks.

## Rollback

Rules are the only step that feels irreversible, and it is not: redeploy the
previous `firestore.rules` to restore the old behaviour instantly. The backfill
is not rolled back — `status: "active"` on a legacy comment is the correct value
under both the old and the new rules.
