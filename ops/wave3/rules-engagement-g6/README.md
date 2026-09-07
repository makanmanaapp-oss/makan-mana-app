# WAVE 3 GATE 3G — ENGAGEMENT-ONLY (G6) FIRESTORE RULES — **DEPLOYED**

> **This artifact IS live in production.** It was deployed under explicit owner
> approval ("APPROVE G3-G LIMITED ENGAGEMENT RULES G6") on 2026-09-07.
> It is the ONLY Wave 3 rules artifact that has ever been deployed.
>
> Siblings that remain **NOT DEPLOYED**: `../rules-rebase/` (full Wave 3
> ruleset, needs the lifecycle backfill first) and
> `../comment-write-freeze-rebased/` (temporary write freeze).

---

## 1. What this fixes

The Gate 3F Follow failure on *Akarr Cafe Eco Grandeur, Puncak Alam*
(`PLC-379343ea37954e00ac22293c`) was never a write bug. The follow document
existed with a real `followerUid`, `restaurant_public` reported
`followerCount = 1`, and both `followRestaurant` and `unfollowRestaurant`
logged success. What failed was the **read**: the live ruleset declared no rule
for the Wave 3 engagement collections, so the default-deny catch-all denied
every client stream and the UI could only render "Ikut / 0 pengikut".

This artifact adds **read access only**, for exactly three collections.

---

## 2. Deployment record

| Field | Value |
|---|---|
| **PREVIOUS live ruleset** | `56e55c24-d82d-4a73-9c11-dee45d018c2b` (createTime `2026-08-24T15:30:00.913983Z`) |
| **NEW live ruleset** | `f77c0ada-9bf6-43f3-b419-7397510a8bb0` (createTime `2026-09-07T10:50:08.005455Z`) |
| Release updateTime | `2026-09-07T10:50:09.720394Z` |
| **BASE SHA256** | `9a61b0476a6dd2e817f148e73c36abb3dfd373b8d59cc8c326570fe685712bb6` (41668 bytes) |
| **G6 SHA256** | `c3a44df897a10ae7bd1711643aa6737441703e8c353b6fb990e43f5b9ad15925` (43755 bytes) |
| Project | `makanmana-c59f3` |
| Deploy source | `firebase.deploy.json` → `firestore.rules` (this directory) |
| Built at APP HEAD | `e9198e7a2d9c67ce6f4237089e7301ccdcdd6909` |

The live ruleset was re-fetched immediately **before** deploying (still
`56e55c24`, hash unchanged — no drift) and immediately **after** deploying. The
post-deploy fetch is preserved at `proof/live-after-deploy.rules` and is
**byte-identical** to `firestore.rules`.

Indexes, Functions, Hosting and Storage were **not** deployed. `firebase.deploy.json`
declares only `firestore.rules` — no `indexes` key exists in it at all — and the
command was scoped `--only firestore:rules`.

---

## 3. Exactly what changed

One graft. Three new `match` blocks, inserted immediately above the default-deny
catch-all. Nothing else in the file is touched.

```
match /restaurant_follows/{followId} {
  allow read: if signedIn() && resource.data.followerUid == request.auth.uid;
  allow write: if false;
}
match /restaurant_public/{canonicalPlaceId} {
  allow read: if signedIn();
  allow write: if false;
}
match /menu_comments/{commentId} {
  allow read: if signedIn() && resource.data.status == 'visible';
  allow write: if false;
}
```

`verify.py` proves this structurally rather than by eyeballing a diff: it parses
every `match` block and every `function` at every nesting depth out of both
files and compares them as structures.

| Measure | Result |
|---|---|
| REMOVED live match blocks | **0** |
| MODIFIED existing live match blocks | **0** |
| NEW match blocks | **3** (exactly the approved trio) |
| Functions removed / modified / added | **0 / 0 / 0** |
| `accountActive()` call sites | **35 → 35** |
| Default-deny catch-all still last | **YES** |

Run it against production itself at any time:

```bash
python ops/wave3/rules-engagement-g6/verify.py \
       ops/wave3/rules-engagement-g6/live-baseline.rules \
       ops/wave3/rules-engagement-g6/proof/live-after-deploy.rules
```

---

## 4. What is deliberately NOT here

This gate authorised the engagement subset and nothing else. Every excluded
graft is asserted absent by `verify.py`, and each exclusion marker is itself
checked to be absent from the live base — so "absent" means *not added*, not
*undetectable*.

| Excluded | Why it is not here |
|---|---|
| G1 `postLifecycleActive` / `commentLifecycleActive` | lifecycle gate, needs its backfill first |
| G2 `canReadPostData` tightening | same |
| G3 post-comment read lifecycle | same |
| G4 post-comment create status gate | same |
| G5 collection-group comment lifecycle | same |
| G7 notification mark-read widening | out of scope for this gate |
| Temporary comment write freeze | out of scope for this gate |

Test 16 in the emulator suite proves the exclusion behaviourally: a status-less
legacy post and comment are still readable by a stranger, exactly as in
production today. Had the lifecycle rules leaked in, that test would flip to
DENY and every legacy post would have gone invisible to all but its author.

---

## 5. Proof

### 5.1 Emulator — `engagementG6Rules.test.cjs`, **15/15 passing**

Loads the G6 artifact and the live baseline side by side, so every claim is a
contrast. Output captured in `proof/emulator-g6.txt`.

| # | Proves |
|---|---|
| 1 | signed-in user can read `restaurant_public` (and live DENIES it) |
| 2 | signed-out caller denied the aggregate |
| 3 | user reads their own follow state — by `get` **and** by the client's exact query |
| 4 | follower UID list is not enumerable: other user's doc, unconstrained list, by-restaurant list, and by-other-uid list all denied |
| 5 | direct create/update/delete of `restaurant_follows` denied, including a correctly-owned document |
| 6 | direct writes to `restaurant_public` denied — the count stays server-owned |
| 7 | visible menu comment readable under the client's exact composite query |
| 8+9 | hidden and removed menu comments denied; status-less fails closed; a query widening past `visible` fails entirely |
| 10 | direct `menu_comments` writes denied, including a forged "official restaurant reply" |
| 11+12 | `accountActive()` suspension enforcement identical to live |
| 13 | `accountStatus` self-unsuspend still denied, identically |
| 14 | `pollVotes` behaviour identical to live |
| 15 | default-deny catch-all and the server-only stores unchanged |
| 16 | **G1–G5 are NOT active** — legacy reads still behave as live |
| 17 | post visibility and moderation boundaries unchanged |

Tests 11–17 assert *sameness*: the operation is run against both rulesets and
the two outcomes must match **and** equal the expected value.

```bash
cd ops/wave3/rules-engagement-g6
NODE_PATH="../../../functions/node_modules" \
  npx --no-install firebase emulators:exec \
    --only firestore --project demo-mm-w3-g3g --config firebase.json \
    "node --test engagementG6Rules.test.cjs"
```

### 5.2 Existing repo suite — reported as a DELTA, not as 220/220

`npm run test:rules` encodes the **full** Wave 3 ruleset, including the grafts
this gate excludes. It therefore cannot reach 220/220 against any
engagement-only artifact — **production itself fails 20 of these tests today.**
The meaningful measure is the change relative to production:

| Ruleset under test | Result |
|---|---|
| LIVE production (`live-baseline.rules`) | 200 / 220 |
| G6 artifact (`firestore.rules`) | **203 / 220** |
| **New failures introduced by G6** | **0** |
| **Failures repaired by G6** | **3** |

The three repaired are exactly the engagement tests: own-follow read, follower
count aggregate, and visible menu comments. All 17 residual failures live in
just three files — `postLifecycleRules.test.ts`, `commentLifecycleRules.test.ts`
(G1–G5) and `notificationRules.test.ts` (G7) — i.e. precisely the excluded
scope. Evidence: `proof/testrules-g6.txt`, `proof/testrules-live.txt`,
`proof/failure-delta.txt`.

Both runs used a temporary substitution of the repository root
`firestore.rules`, which was restored and verified byte-identical
(`1dff063d00d0bd791f4dfb558fc406ec1ffd426b784a218c21d654446f6af417`) afterwards.

### 5.3 Against the ACTUAL deployed ruleset

The Firebase Rules API `:test` endpoint was used to evaluate the **real** QA
user reading the **real** follow document against the ruleset live in
production — not a local copy, not the emulator. All seven evaluations passed:
own-follow read ALLOW, other-user read DENY, signed-out read DENY, aggregate
read ALLOW, signed-out aggregate DENY, aggregate write DENY, follow write DENY.

---

## 6. Rollback

One command restores production exactly. `live-baseline.rules` is a byte-exact
copy of ruleset `56e55c24-d82d-4a73-9c11-dee45d018c2b`, which was live
immediately before this deploy.

```bash
cd ops/wave3/rules-engagement-g6
npx firebase deploy --only firestore:rules \
    --config firebase.rollback.json --project makanmana-c59f3
```

Then re-fetch and confirm the live SHA256 is
`9a61b0476a6dd2e817f148e73c36abb3dfd373b8d59cc8c326570fe685712bb6`.

Rolling back re-breaks the Follow read path — it does not lose data. The follow
documents and the aggregate are written by Cloud Functions and are unaffected
by rules.

---

## 7. Rebuilding

```bash
python ops/wave3/rules-engagement-g6/build.py    # from the repository root
python ops/wave3/rules-engagement-g6/verify.py
python ops/wave3/rules-engagement-g6/gate.py     # the pre-deploy hard gate
```

`build.py` refuses to run unless the base still hashes to the deployed-at-the-time
production ruleset, and requires its single graft to match exactly once. If
production drifts, re-fetch it, replace `live-baseline.rules`, update `LIVE_SHA`,
and rebuild — a graft that no longer matches aborts rather than silently
producing a wrong file.

---

## 8. Files

| File | Role |
|---|---|
| `firestore.rules` | the deployed artifact |
| `live-baseline.rules` | byte-exact pre-deploy production ruleset; the rollback target |
| `build.py` | generator (single graft, hash-guarded) |
| `verify.py` | structural proof; accepts `<base> <artifact>` to check production directly |
| `gate.py` | STEP 7 pre-deploy hard gate; every line derived, none typed |
| `firebase.deploy.json` | deploy source — declares only `firestore.rules` |
| `firebase.rollback.json` | rollback source — declares only `live-baseline.rules` |
| `firebase.json` | local emulator config (port 8184); **not** a deploy target |
| `engagementG6Rules.test.cjs` | the 15-test emulator proof |
| `proof/` | captured outputs and the post-deploy production fetch |
