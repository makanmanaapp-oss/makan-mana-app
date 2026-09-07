# WAVE 3 GATE 3F — LIVE-DERIVED WAVE 3 RULESET (NOT DEPLOYED)

> **NOT DEPLOYED. DO NOT DEPLOY FROM THIS DIRECTORY.**
> This artifact exists because the Gate 3F Follow failure was diagnosed as
> **CASE C**: the Cloud Function succeeds and the data is correct, but the
> mobile app's reads are denied by the ruleset that is actually live.
> The corrective is a rules change, and a rules change is the owner's call.

---

## 1. What the Follow bug actually was

`Akarr Cafe Eco Grandeur, Puncak Alam` — canonical id
`PLC-379343ea37954e00ac22293c`.

| Evidence | Finding |
|---|---|
| `restaurant_follows` document | **EXISTS** — real 28-char `followerUid`, `createdAt` set |
| `restaurant_public/PLC-379343ea37954e00ac22293c` | `followerCount = 1` |
| `followrestaurant` / `unfollowrestaurant` logs | **both succeeded** |
| Live ruleset, `restaurant_follows` read rule | **ABSENT** |
| Live ruleset, `restaurant_public` read rule | **ABSENT** |
| Live ruleset catch-all | `match /{document=**} { allow read, write: if false; }` |

The write path was never broken. Every client **read** of the follow state and
the follower count terminated in `PERMISSION_DENIED`, and the Flutter providers
flattened that error into `false` / `0` — so the button rendered "Ikut" and
"0 pengikut" forever, which is exactly the "tapping does nothing" report.

Two corrections follow from this, and only one of them lives here:

1. **Client (shipped in the same commit as this artifact):** an errored read is
   no longer answered with a fabricated negative. See
   `lib/features/restaurant/engagement/restaurant_follow_button.dart` and
   `test/restaurant_follow_error_state_test.dart`.
2. **Rules (this artifact, NOT deployed):** the three Wave 3 collections need
   read rules before the feature can work at all.

---

## 2. Provenance

| Field | Value |
|---|---|
| **BASE** | the **ACTUAL LIVE PRODUCTION RULESET**, fetched from the Firebase Rules API |
| Live ruleset id | `56e55c24-d82d-4a73-9c11-dee45d018c2b` |
| Live ruleset createTime | `2026-08-24T15:30:00Z` |
| Base file | `live-baseline.rules` |
| Base bytes / sha256 | `41668` / `9a61b0476a6dd2e817f148e73c36abb3dfd373b8d59cc8c326570fe685712bb6` |
| **ARTIFACT** | `firestore.rules` |
| Artifact bytes / sha256 | `44897` / `b546d7eb6cd8fd889040805e338cd5fd46131e3903b23730f005f5366f20ebef` |
| Built at APP HEAD | `c1ab3891b2e69f8759d924c7136f3ec24a2b0390` |

`live-baseline.rules` is a byte-exact copy of the deployed ruleset. (The Rules
API response arrived double-encoded — UTF-8 read as cp1252 — so it was decoded
back before use; the repaired file's 41668 bytes match the ruleset's reported
size exactly. Only comment text was affected; no rule expression contains a
non-ASCII character.)

The artifact is **generated**, never hand-edited: each graft is an exact,
single-occurrence string replacement that aborts the build if it matches zero
or more than one time, and the build refuses to run unless the base still
hashes to the value above.

---

## 3. Why not just deploy the branch `firestore.rules`?

Because the branch file was written against an older base and would have
**removed live protections**. Deploying it would have caused, at minimum:

| Live protection | Branch ruleset | Consequence |
|---|---|---|
| `function accountActive()` + **35 call sites** | **absent** | every suspended account regains full direct write access |
| `accountStatus`, `accountStatusReason`, `accountStatusChangedAt`, `accountStatusChangedBy`, `accountStatusSource` in `protectedUserFields()` | **absent** | **privilege escalation** — a user can write their own `accountStatus`, i.e. self-unsuspend |
| `users/{uid}` update requires `accountStatus != 'suspended'` | **absent** | a suspended user can edit their own profile document |
| `feed_posts/{postId}/pollVotes/{voterUid}` read rule | **absent** | the catch-all denies a voter their own vote; the poll surface breaks |
| `meal_reminder_schedules`, `notification_reconcile_state`, `notification_test_recipients`, `notification_broadcast_runs` | **absent** | defence-in-depth only (catch-all still denies), but the explicit intent is lost |
| `admin_audit_events`, `admin_bridge_requests`, `admin_bridge_rate` | **absent** | as above |

The first four are real, user-visible or security-relevant regressions. `B1`,
`B2`, `B3` and `B4` in `rebasedRules.test.cjs` demonstrate each of them by
running the same operation against both rulesets.

---

## 4. Exactly what this artifact changes

Seven grafts, and nothing else. `diff` of the comment-stripped live ruleset
against the comment-stripped artifact yields these and only these.

| # | Graft | Direction |
|---|---|---|
| G1 | add `postLifecycleActive(p)` and `commentLifecycleActive(c)` helpers | new |
| G2 | `canReadPostData` requires `postLifecycleActive(p)` on every NON-OWNER branch | **tightens** |
| G3 | post-comment read: `status != 'deleted'` → `status == 'active'` | **tightens** |
| G4 | post-comment create must declare `status == 'active'` | **tightens** |
| G5 | collection-group comment read: same tightening as G3 | **tightens** |
| G6 | add `restaurant_follows`, `restaurant_public`, `menu_comments` | new |
| G7 | notification mark-read legacy compatibility (see below) | widens, no boundary change |

**G7** is the one graft that is neither a Wave 3 rule nor a live protection, and
it is carried deliberately. The live clause requires the *resulting*
`users/{uid}/notifications/{id}` document to carry `status == 'read'`, so a
legacy notification stored **without** a status field can never be marked read
(the comparison raises and denies). G7 widens it to *"if you touch `status` it
must become `'read'`"*. The `hasOnly(['isRead','readAt','openedAt','status'])`
allowlist is untouched, so the security boundary is identical — a user still
cannot write any other field, and still cannot set an arbitrary status. Both
halves are covered by the repository's own tests: *"legacy mobile may mark read
without changing status"* and *"recipient cannot change notification status to
an arbitrary value"*.

Nothing is removed. All 90 live `match` blocks survive; the artifact has 93
(the three Wave 3 additions). All 35 `accountActive()` call sites survive. The
default-deny catch-all is still the last rule in the file.

---

## 5. ⚠ DEPLOY PRECONDITION — the lifecycle backfill is NOT optional

G2–G5 are **fail-closed on missing data**. Under this ruleset a `feed_posts`
document or a post `comments` document **without** an exact `status: 'active'`
field becomes unreadable to everyone except its author.

That is the intended Wave 3C/3D design — a default of `'active'` is precisely
what made a moderator-hidden post indistinguishable from a legacy one — but it
means:

> **The Wave 3C/3D status backfill MUST be complete in production BEFORE this
> ruleset is deployed.** Deploying it against un-backfilled data would hide
> every legacy post and comment from every reader but its author.

`C1` and `C2` in the test file assert this fail-closed behaviour explicitly, so
the consequence is visible rather than discovered in production.

If the Follow fix is wanted **before** the backfill is ready, the safe subset is
G6 alone (the three engagement collections) — none of G1–G5. That subset is
purely additive to live and has no data precondition. It is not pre-built here;
say the word and it will be.

---

## 6. Proof

`rebasedRules.test.cjs` — **14/14 passing**. It loads three rulesets side by
side in one emulator (this artifact, the live baseline, and the branch file) so
every claim is stated as a contrast rather than an isolated assertion.

| Group | Proves |
|---|---|
| A1–A5 | the engagement reads live **denies** now succeed; the follower list is still not enumerable; every client write is still denied; `menu_comments` exposes only `visible` |
| B1–B5 | suspension enforcement, `accountStatus` protection, suspended-user lockout and `pollVotes` all survive — and the branch ruleset loses each one |
| C1–C3 | post + comment lifecycle gates, including fail-closed on status-less legacy documents |
| D1 | the default-deny catch-all still governs undeclared collections |

In addition, the repository's **existing** rules suite was run against this
artifact by temporarily substituting it for the root `firestore.rules`:

```
npm run test:rules   →   220 / 220 passing
```

The root `firestore.rules` was restored immediately afterwards and verified
byte-identical (`sha256 1dff063d00d0bd791f4dfb558fc406ec1ffd426b784a218c21d654446f6af417`).

### Run it yourself

```bash
cd ops/wave3/rules-rebase
NODE_PATH="../../../functions/node_modules" \
  npx --no-install firebase emulators:exec \
    --only firestore --project demo-mm-w3-gate3f --config firebase.json \
    "node --test rebasedRules.test.cjs"
```

`firebase.json` here is a local-only emulator config on port 8182. It declares
no project alias, no hosting, no functions, no storage and no indexes, so it
cannot be used as a deploy target.

---

## 7. Rebuilding

The artifact is reproducible from `live-baseline.rules` alone:

```bash
python ops/wave3/rules-rebase/build.py     # run from the repository root
```

`build.py` asserts the base hash before touching anything, then applies the
seven grafts, each required to match exactly once. If production drifts,
re-fetch the live ruleset, replace `live-baseline.rules`, update `LIVE_SHA`, and
rebuild — a graft that no longer matches aborts the build rather than silently
producing a wrong file.

---

## 8. Status

| | |
|---|---|
| Deployed | **NO** |
| `firebase deploy --only firestore:rules` run | **NO** |
| Root `firestore.rules` modified | **NO** (restored byte-identical after the test run) |
| Production data written | **NO** |
| Indexes changed | **NO** |

Deploying this ruleset is an owner decision, and §5 must be satisfied first.
