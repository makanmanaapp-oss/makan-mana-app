# WAVE 3C — feed_posts lifecycle read-boundary rollout runbook

**Status: NOT EXECUTED.** Every phase below is a production operation and none
of them has been performed. This document is source only.

## Why this exists

Before this closure, `firestore.rules > canReadPostData()` inspected only
`visibility` and `authorUid`. It never looked at `status`. A moderator-hidden
(`status == "hidden"`) or moderator-removed (`status == "deleted"`) post whose
visibility was `public`/`unlisted` was therefore still readable by any signed-in
user through a direct document `get`. Moderation changed the document but not
who could read it.

The fix is a four-part invariant. All four parts must be true in production, and
they must arrive in the order below — otherwise the app deadlocks.

| Part | Where | Contract |
| --- | --- | --- |
| RULES | `firestore.rules` → `postLifecycleActive()` | non-author read requires `status == "active"` exactly |
| QUERY | `lib/features/social/social_providers.dart` | every non-owner list query filters `status == "active"` |
| WRITERS | `functions/src/domain/feed/postLifecycle.ts` | every new post is born `status: "active"` |
| LEGACY | `functions/scripts/feedPostStatusBackfill.ts` | documents that omit `status` are normalized to `"active"` |

## The deadlock this ordering avoids

A Firestore list query fails **entirely** (permission-denied) if it can return a
document the rules would reject. So:

- Deploying the rules **before** the client queries carry `status == "active"`
  breaks the public feed, following feed, trending feed, group feed and other
  users' profiles for everyone.
- Shipping the client queries **before** legacy documents are normalized makes
  every legacy post disappear from those feeds.

Hence: writers → indexes → backfill → queries → rules.

## Phase 1 — write-path support

Deploy the functions so every NEW feed post carries `status: "active"`.

Covered creators (all five, proven by
`functions/src/domain/feed/__tests__/postLifecycle.test.ts`):

- `callable/createFeedPost.ts` (ordinary posts, check-ins, share cards)
- `callable/repostFeedPost.ts` (repost + quote repost)
- `callable/submitReview.ts` (review shared to feed)
- `triggers/onReviewApproved.ts` (review published on approval)
- `domain/restaurantEngagement/restaurantPost.ts` → `callable/createRestaurantPost.ts`

Moderation transitions already write the same vocabulary
(`domain/feed/postModeration.ts`); restore writes `status: "active"`, the same
literal creation uses.

### HARD GATE — SOCIAL STUDIO ADMIN PUBLISHING MUST REMAIN DISABLED

The Control Center "Social Studio" produces `social.admin_post.create` /
`.update` / `.delete` from
`makanmana-control-center-WAVE3/lib/admin/social-publisher.ts`, addressed to
`FIREBASE_SOCIAL_ADMIN_BRIDGE_URL`.

**There is no Firebase receiver for it.** Nothing in the app/backend worktree
handles `social.admin_post.*`, and the Social moderation bridge deliberately
refuses that resource type. The path is therefore **fail-closed by design**:

- `hasConfiguredSocialAdminPublishingBridge()` requires the Studio-specific URL.
  It never falls back to `FIREBASE_ADMIN_BRIDGE_URL` (generic slot) or to
  `FIREBASE_SOCIAL_MODERATION_BRIDGE_URL` (moderation only), so configuring any
  other bridge cannot make publishing look operational.
- `publishSocialPost`, `updateSocialAdminPost` and `deleteSocialAdminPost` each
  call `assertSocialPublishingAvailable()` *before* any network call or audit
  row, so an unconfigured install throws instead of half-acting.
- The Studio page reports **"Publishing unavailable"** rather than
  "Ready to publish" when the bridge is absent.

Defensively, the producer is already lifecycle-stamped: the create payload
carries the server-owned constant `SOCIAL_ADMIN_POST_CREATE_STATUS = "active"`.
It is never caller-supplied (a `status` on the input is rejected outright), and
the update path carries no status at all, so publishing can never mint an
already-hidden post nor move the moderation lifecycle.

**PRODUCTION GATE: Social Studio admin publishing MUST REMAIN
DISABLED / UNCONFIGURED** until a future approved package ships a Firebase
receiver that:

1. accepts `social.admin_post.create`,
2. server-validates the publishing identity,
3. forces / validates `status: "active"` on new posts,
4. preserves lifecycle moderation ownership (never lets publishing hide,
   remove or restore),
5. is tested against the final `feed_posts` rules.

**Phases 7 and 8 below MUST NOT depend on that receiver.** It does not exist.

Because no receiver exists, the Social Studio producer is **NOT counted as an
active Firestore writer** in the writer inventory. It is stamped defensively so
that the contract is already correct on the day a receiver is built.

**Gate:** functions deployed; a freshly created post in production shows
`status: "active"`. Social Studio stays unconfigured (see the hard gate above).

## Phase 2 — indexes READY

Deploy `firestore.indexes.json` and wait until every new index reports **Ready**
in the Firebase console. Four indexes were added, each for exactly one
implemented query:

| Index (`feed_posts`) | Query it serves |
| --- | --- |
| `visibility ASC, status ASC, createdAt DESC` | `publicFeedProvider` |
| `visibility ASC, status ASC, likeCount DESC` | `trendingFeedProvider` |
| `authorUid ASC, visibility ASC, status ASC, createdAt DESC` | `followingFeedProvider` (`authorUid in`) and `userPublicPostsProvider` (other profile) |
| `groupId ASC, status ASC, createdAt DESC` | `groupFeedProvider` |

No existing index was removed or modified. `myPostsProvider` and the own-profile
branch keep using the existing `authorUid + createdAt` and
`authorUid + groupId + createdAt` indexes and gain no `status` filter.

**Gate:** all four indexes Ready. Do not proceed while any is Building.

## Phase 3 — legacy normalization DRY RUN

```
npx tsx functions/scripts/feedPostStatusBackfill.ts \
  --mode=dry-run --max-documents=20000 --output=../reports
```

Zero writes. Review the counters: `scanned`, `missingStatus`, `wouldUpdate`,
`updated` (must be 0), `alreadyActive`, `hidden`, `deleted`, `unknownStatus`,
`errors`.

**Gate:** `unknownStatus == 0` **and** `Scan truncated by --max-documents == no`.
If `unknownStatus` is non-zero the report lists the offending document ids —
decide each one by hand; the tool will never convert an unknown status to
`active`. A padded value such as `" active "` is reported as unknown on purpose:
it is byte-different from what the rules accept.

## Phase 4 — legacy normalization APPLY

```
npx tsx functions/scripts/feedPostStatusBackfill.ts \
  --mode=apply --apply --confirm-project=makanmana-c59f3 \
  --max-documents=20000 --output=../reports
```

Only documents whose `status` is **missing** are written, and only
`{status: "active"}` via merge. `active` / `hidden` / `deleted` are never
touched, so the run cannot resurrect removed content or unhide a moderated post.

Writes are **per document and preconditioned** on the exact version that was
read (`lastUpdateTime`). If a moderator hides or removes a post — or its author
deletes it — between the scan and the write, the precondition fails, that one
document is skipped and counted in `errors`/`Error ids`, and it is never
clobbered back to `active`. Re-run afterwards to pick up genuinely-missing ones.

`--max-documents` is capped at 20 000, so a larger collection **must** be run in
chunks. Resume with `--start-after=<Resume cursor from the report>` and repeat
until the report says `Scan truncated by --max-documents: no`. The run is
idempotent: a second pass over normalized documents reports `missingStatus: 0`.

**Gate:** `updated == missingStatus`, `errors == 0`, and
`Scan truncated by --max-documents == no`.

## Phase 5 — verify

Re-run Phase 3 (dry run) over the WHOLE collection, chunking with
`--start-after` until nothing is truncated. Required result:

```
missingStatus                     = 0
unknownStatus                     = 0
errors                            = 0
Scan truncated by --max-documents = no
Phase 5 complete                  = YES
```

`backfillIsComplete()` encodes this gate and is answerable from a dry run
(dry run: "nothing left to do"; apply: "everything found was done"). A truncated
scan can never report YES — clean counters over the head of the collection say
nothing about its tail.

**Do not proceed to Phase 6 or 7 while any document still lacks a status** —
under the Phase 7 rules such a document becomes unreadable to everyone except
its author.

## Phase 6 — release consumer queries

Ship the app build whose queries require `status == "active"`:

- `publicFeedProvider`, `followingFeedProvider`, `trendingFeedProvider`,
  `groupFeedProvider`, and the other-profile branch of `userPublicPostsProvider`.
- `myPostsProvider` and the own-profile branch are deliberately **not**
  constrained — the author is entitled to their own history, and the rules allow
  it.

This build works against the CURRENT rules as well as the Phase 7 rules, so it
is safe to release before the rules change.

**Gate:** the build is live for the users you intend to cover. Older installs
still run unconstrained queries and will start failing at Phase 7 — decide the
minimum supported version before proceeding.

## Phase 7 — deploy the final rules

```
firebase deploy --only firestore:rules
```

`canReadPostData` now reads:

```
function postLifecycleActive(p) {
  return p.get('status', '') == 'active';
}

function canReadPostData(p) {
  let vis = p.get('visibility', 'public');
  return p.get('authorUid', '') == request.auth.uid
    || (postLifecycleActive(p)
        && (vis == 'group_only'
            ? isGroupMember(p.get('groupId', '__none__'))
            : (vis == 'public' || vis == 'unlisted')));
}
```

Note the deliberate absence of a `get('status', 'active')` default: that default
is exactly what made a hidden post indistinguishable from a legacy post.
Phases 4 and 5 are what make the strict form safe.

Comment access inherits this automatically — both the nested comment rule and
`canReadCurrentParent()` call `canReadPostData()`.

## Phase 7A — deploy the new repost writer + client compatibility

New reposts already stop copying original content once the Phase 1 functions
deploy, and the app build from Phase 6 renders the embed card from the LIVE
original only. Confirm both are live before scrubbing history:

- a freshly created repost has **no** `originalSnapshot` field at all;
- the embed card shows a skeleton while loading and "Post tidak tersedia" when
  the original is hidden/deleted — never stale text or an image.

## Phase 7B — legacy repost snapshot scrub DRY RUN

```
npx tsx functions/scripts/repostSnapshotSanitizer.ts   --mode=dry-run --max-documents=20000 --output=../reports
```

Zero writes. Review: `scanned`, `reposts`, `quotes`, `alreadySafe`,
`wouldSanitize`, `sanitized` (must be 0), `unknownShape`, `errors`,
`resumeCursor`.

**Gate:** `unknownShape == 0` and `Scan truncated by --max-documents == no`.
An unrecognised snapshot shape is listed by id and never guessed at — decide
each one by hand.

## Phase 7C — legacy repost snapshot scrub APPLY

```
npx tsx functions/scripts/repostSnapshotSanitizer.ts   --mode=apply --apply --confirm-project=makanmana-c59f3   --max-documents=20000 --output=../reports
```

Deletes ONLY the legacy `originalSnapshot` field, and only on
`postType == "repost" | "quote_repost"` documents whose snapshot matches the
known legacy shape. It never touches `authorUid`, the reposter's own quote
`text`, `status`, `visibility`, `createdAt`, `repostOfPostId`, `quotedPostId`
or any counter. Writes are per document and preconditioned on `lastUpdateTime`,
so a concurrent edit is reported rather than clobbered. Chunk with
`--start-after=<resumeCursor>` until nothing is truncated.

**Gate:** `sanitized == wouldSanitize`, `errors == 0`, `unknownShape == 0`,
not truncated.

## Phase 7D — verify no copied original content remains

Re-run Phase 7B over the whole collection. Required:

```
wouldSanitize                     = 0
unknownShape                      = 0
errors                            = 0
Scan truncated by --max-documents = no
Scrub complete                    = YES
```

Only after this may hidden/deleted **source-content suppression** be claimed
complete. Until then, moderation suppresses the original document but historical
reposts may still hold a copy.

## Phase 8 — production E2E

1. Active public post — readable by a signed-in non-author. ✅
2. Moderator-hidden post — direct `get` denied for a non-author; absent from
   public/following/trending/group/profile feeds. ✅
3. Moderator-removed post — same. ✅
4. Author still reads their own hidden and deleted posts. ✅
5. Comments under a hidden/deleted parent are closed to non-authors; the comment
   author still reaches their own comment. ✅
6. Private / followers_only / group_only privacy unchanged. ✅
7. A repost of a now-hidden original shows "unavailable" AND a raw read of the
   repost document returns no copy of the original's text or image. ✅
8. A quote repost still shows the reposter's own caption. ✅

## Rollback

Rules are the only irreversible-feeling step, and they are not: redeploy the
previous `firestore.rules` to restore the old behaviour instantly. The backfill
is not rolled back — `status: "active"` on a legacy document is the correct
value under both the old and new rules.

## Owner decisions — RESOLVED

### place_reviews duplication — NOT a Wave 3C blocker (owner decision)

`feed_posts` moderation **is not** canonical place-review moderation. They are
separate content entities with separate lifecycles:

- A social review/feed post can be hidden from the Social surface while its
  canonical `place_reviews` entry remains, because the place review is the
  restaurant's rating record, not a Social post.
- `social.post.remove` therefore **does NOT** delete or moderate
  `place_reviews`. Do not describe it as if it does.
- Future place-review moderation requires a **separate approved command and
  scope** (its own command type, its own bridge domain, its own rules).

`place_reviews` still carries `allow read: if signedIn()` with no lifecycle
gate. That is the accepted contract for now, recorded here deliberately.

### commentsProvider legacy deleted-comment query — WAVE 3D ENTRY BLOCKER

`lib/features/social/social_providers.dart > commentsProvider` lists a post's
comments with no lifecycle constraint, but the comment rule denies a non-author
any comment with `status == "deleted"` (which `deleteUserComment` really
writes). One soft-deleted comment therefore makes the whole list query fail for
everyone except the post author.

It is **not fixed here** because there is no safe client-side constraint:
legacy comments have no `status` field, and Firestore `==` and `!=` both exclude
documents where the field is absent, so any filter would hide all legacy
comments. It needs a comment-status backfill of the same shape as the post one.

**Status: WAVE 3D ENTRY / PRE-PRODUCTION BLOCKER.** It MUST be resolved before
Wave 3 production activation. It does NOT block the Wave 3C backend /
Control Center checkpoint. Do not drop it from this document.

## Known residual gaps — lower severity

1. **Repost `originalSnapshot` — CLOSED for new documents.** The writer no
   longer copies original content and the client renders the live original only.
   Historical documents are handled by the Phase 7B–7D scrub, which has NOT been
   executed. Until it runs, old reposts may still hold a copy.

2. **`public_reply_activity` (LOW, metadata only).**
   `functions/src/triggers/onPostVisibilityChanged.ts` deletes at most 500
   entries with no pagination loop, so a post with more entries keeps stale
   "user X replied to post Y" rows after being hidden. No content leaks (the
   rows carry ids only and every comment GET re-checks the live parent).

## What is intentionally NOT covered

- The Control Center mirror (`mirrorPayload.ts`) still maps an **absent** status
  to `visible`. That is correct for a moderation console: a legacy document must
  remain visible to moderators rather than be rejected outright. After Phase 4
  no absent status exists in production anyway.
- `dataVaultSync` mirrors every lifecycle state by design (data export).
- `socialEngagementMirrorSync` deliberately does not filter on status — it
  reconciles moderation state, so it must see hidden and removed posts.
