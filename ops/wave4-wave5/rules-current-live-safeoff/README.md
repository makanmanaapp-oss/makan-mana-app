# WAVE 4 + WAVE 5 SAFE-OFF RULESET, ON CURRENT LIVE

> Built 2026-09-08 for cutover step 7. Deploy **only** this artifact.
> Deploy state is recorded in `../CUTOVER_ORDER.md`.

---

## 1. Why this artifact exists at all

The repository root `firestore.rules` on `feature/wave5-cms-discovery` **must not
be deployed.** Compared with what is live right now it would:

| | Count | Examples |
|---|---|---|
| **REMOVE** live match blocks | **7** | `admin_audit_events`, `admin_bridge_requests`, `admin_bridge_rate`, `meal_reminder_schedules`, `notification_reconcile_state`, `notification_test_recipients`, `notification_broadcast_runs` |
| **MODIFY** live match blocks | **21** | `users/{uid}`, `feed_posts`, `dm_threads`, `{path=**}/comments/{commentId}`, all the Fit/budget stores |
| **DROP** helpers | — | `accountActive()` and the whole `accountStatus` suspension guard |
| **ADD** rules still on hold | — | Wave 3 `postLifecycleActive()` / `commentLifecycleActive()` |

That file is built on a **stale base** predating the live post-G6 ruleset.
Deploying it would silently revoke the account-suspension enforcement and the
admin bridge/audit protections. This artifact exists so that never happens.

## 2. Provenance

| Field | Value |
|---|---|
| **BASE** | the ruleset live immediately before this cutover |
| Base ruleset id | `f77c0ada-9bf6-43f3-b419-7397510a8bb0` |
| Base createTime | `2026-09-07T10:50:08.005455Z` |
| Base file | `live-baseline.rules` |
| Base bytes / sha256 | 43755 / `c3a44df897a10ae7bd1711643aa6737441703e8c353b6fb990e43f5b9ad15925` |
| **ARTIFACT** | `firestore.rules` |
| Artifact bytes / sha256 | 45609 / `e32f5f5c3bd45c5067f5c3f730b11722216f2aa03bb32f6c63d3c2e1fd7d551b` |
| Built at APP HEAD | `f8227eb7d8c3af9634cc84b98301a47f62f72577` |

`live-baseline.rules` was fetched from the Firebase Rules API and written as raw
bytes; its sha256 is verified by `build.py` before anything is grafted.

## 3. The change, in full

```
NEW MATCH BLOCKS   = 3
   + /restaurant_promotions/{promotionId}
   + /cms_content/{contentId}
   + /cms_collections/{collectionId}
REMOVED            = 0
MODIFIED EXISTING  = 0
HELPER/FUNCTION BODY CHANGED = NO
```

Each new block is exactly:

```
      allow read, write: if false;
```

`build.py` refuses to build if any block carries anything else.

Byte-level: **all 1059 baseline lines are preserved**, as an identical 1052-line
prefix and 7-line suffix, with **one contiguous 38-line insertion** placed
immediately before the top-level default-deny catch-all. (The catch-all moves
from line 1055 to 1093; it is still last, and still the final word.)

## 4. Why three deny-only blocks are worth deploying at all

Today these paths are already denied — by the catch-all. So this deploy changes
**no observable behaviour**, which test 3 proves by running the same client
operations against both rulesets and asserting the outcomes are equal.

What it buys is locality. The denial now lives next to the collection it
protects and states why, so a later edit to the catch-all cannot silently open
promotions or CMS content to direct client reads. Server visibility for both
depends on the server clock and on viewer targeting; a security rule can express
neither honestly, so the client read path must stay closed and go through
`getRestaurantProfileV2` / `getCmsContent`.

## 5. Emulator proof — 8/8 passing

Every test runs against **both** rulesets and compares.

| # | Proves |
|---|---|
| 1 | the three new collections deny every client read — doc, collection and filtered query, signed in or not |
| 2 | they deny every client write, including a document the caller claims to own |
| 3 | artifact and live produce **identical** outcomes on these paths |
| 4 | G6 is inherited: own-follow read allowed, other's denied, unconstrained list denied, `restaurant_public` readable, hidden `menu_comments` denied |
| 5 | `accountStatus` suspension enforcement is unchanged, including that a suspended user cannot edit itself back to active |
| 6 | the notification boundary is unchanged — own read, other's denied, mark-read allowed on the exact key set, create/delete denied |
| 7 | `admin_audit_events`, `admin_bridge_requests`, `admin_bridge_rate`, `notification_broadcast_runs` and an unknown collection all still deny |
| 8 | an unauthenticated client is denied everywhere it was before |

```bash
cd ops/wave4-wave5/rules-current-live-safeoff
NODE_PATH=../../../functions/node_modules \
npx --no-install firebase emulators:exec --only firestore \
  --project demo-mm-w45-safeoff --config firebase.json \
  "node --test safeOffRules.test.cjs"
```

Output in `proof/emulator-safeoff.txt`; structural diff in
`proof/structural-proof.txt`.

## 6. Deploy and rollback

```bash
# deploy (rules only — no indexes, no functions, no hosting)
firebase deploy --only firestore:rules \
  --config ops/wave4-wave5/rules-current-live-safeoff/firebase.deploy.json \
  --project makanmana-c59f3

# rollback to exactly what was live before
firebase deploy --only firestore:rules \
  --config ops/wave4-wave5/rules-current-live-safeoff/firebase.rollback.json \
  --project makanmana-c59f3
```

`firebase.json` in this directory is a **local emulator config on port 8188**,
not a deploy target. Rolling back restores ruleset `f77c0ada` exactly and loses
no data.

## 7. Rebuilding

```bash
python ops/wave4-wave5/rules-current-live-safeoff/build.py
```

Hash-guarded and reproducible: it verifies the baseline sha256, requires each of
the three blocks to appear exactly once in the root rules and to be a bare
`allow read, write: if false;`, refuses to graft a block the baseline already
has, and asserts the baseline survives as one contiguous insertion. It re-emits
`e32f5f5c3bd45c5067f5c3f730b11722216f2aa03bb32f6c63d3c2e1fd7d551b`.

## 8. What this artifact is NOT

- Not the Wave 3 final lifecycle ruleset (`../../wave3/rules-final-current-live/`) — that remains **HOLD**.
- Not the Wave 3 comment write freeze — also **HOLD**.
- Not an index change. `firestore.indexes.json` is unchanged; do not deploy indexes.
