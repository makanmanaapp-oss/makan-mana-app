# WAVE 3 GATE 3G — FINAL WAVE 3 RULESET, ON CURRENT LIVE (NOT DEPLOYED)

> **NOT DEPLOYED.** This is the Wave 3C Phase 7 / Wave 3D C8 artifact.
> See `../CUTOVER_ORDER.md` step 11 — and §5 below, which is a hard deploy
> precondition, not advice.
>
> **Supersedes** `../rules-rebase/`, which was built on the pre-G6 August
> ruleset and would remove the live G6 engagement rules.

---

## 1. Provenance

| Field | Value |
|---|---|
| **BASE** | the **CURRENT LIVE** production ruleset (post-G6) |
| Base ruleset id | `f77c0ada-9bf6-43f3-b419-7397510a8bb0` |
| Base createTime | `2026-09-07T10:50:08.005455Z` |
| Base file / bytes / sha256 | `live-baseline.rules` / 43755 / `c3a44df897a10ae7bd1711643aa6737441703e8c353b6fb990e43f5b9ad15925` |
| **ARTIFACT** | `firestore.rules` |
| Artifact bytes / sha256 | 45292 / `6a4b282f521c002e13cbe203c49f5644ec6d2d8073bd0ddfbe5e1eb64dbc1c3f` |
| Built at APP HEAD | `2e4abe6ba318f39c8e7955be59e7d9f4aa4ba306` |

**G6 is inherited from the base, not redefined.** `build.py` asserts each of the
three engagement blocks occurs exactly once, so the artifact can never
accidentally duplicate or diverge from what is already live.

---

## 2. Every semantic delta, enumerated

No hidden diff. `../structdiff.py` parses every match block and function at
every nesting depth; the full result is below.

| # | Delta | Kind |
|---|---|---|
| L1 | add `postLifecycleActive(p)` and `commentLifecycleActive(c)` | 2 new functions |
| L2 | `canReadPostData` requires `postLifecycleActive(p)` on every NON-OWNER branch | modifies 1 function |
| L3 | post-comment READ: `status != 'deleted'` → `status == 'active'` | modifies `feed_posts/{postId}/comments/{commentId}` |
| L4 | post-comment CREATE must declare `status == 'active'` | same block as L3 |
| L5 | collection-group comment GET: same tightening as L3 | modifies `{path=**}/comments/{commentId}` |
| **N1** | **notification mark-read compatibility** | modifies `users/{uid}/notifications/{notificationId}` — **see §4** |

Structural result:

| Measure | Result |
|---|---|
| REMOVED match blocks | **0** |
| MODIFIED match blocks | **3** — post comments (L3+L4), collection-group comments (L5), notifications (N1) |
| NEW match blocks | **0** |
| Functions removed | **0** |
| Functions modified | **1** — `canReadPostData` (L2) |
| Functions new | **2** — `postLifecycleActive`, `commentLifecycleActive` (L1) |
| `accountActive()` call sites | **35 → 35** |
| G6 engagement rules | all 3 present exactly once |
| `accountStatus*` protected fields | unchanged |
| `pollVotes`, notification stores, admin-bridge stores | unchanged |
| Default-deny catch-all | still last |

```bash
python ops/wave3/structdiff.py \
  ops/wave3/rules-final-current-live/live-baseline.rules \
  ops/wave3/rules-final-current-live/firestore.rules \
  --expect-removed=0 --expect-modified=3 --expect-new=0 --expect-new-fn=2 \
  --new-fn=postLifecycleActive --new-fn=commentLifecycleActive \
  --allow-fn-modified=canReadPostData "--count=35:accountActive()"
```

---

## 3. Lifecycle scope (L1–L5)

Non-authors may read a post or post-comment only when its status is **exactly**
`'active'`. `'hidden'`, `'deleted'`, an unknown value, and an **absent** status
are all denied. This is deliberate: a `get('status', 'active')` default is
exactly what made a moderator-hidden post indistinguishable from a legacy one.

Authors always retain access to their own content in every state.

---

## 4. N1 — the notification clause, reported separately

**N1 is not lifecycle work.** It is included because it repairs a defect that is
live in production right now, and the evidence is not what the original G7 note
claimed.

**What the original justification said:** legacy notifications stored without a
`status` field could never be marked read, because the live clause requires the
*resulting* document to carry `status == 'read'`.

**What production actually shows.** A read-only scan of
`users/{uid}/notifications` on 2026-09-07:

```
scanned 719   hasStatus 719   missingStatus 0
status distribution: {"unread": 702, "read": 17}
```

There are **zero** status-less notifications. So the documented reason is
obsolete.

**Why N1 is still required.** The shipped client
(`notification_providers.dart`, `markRead` / `markAllRead`) writes only:

```dart
{'isRead': true, 'readAt': FieldValue.serverTimestamp()}   // merge
```

It never sets `status`. For a document stored with `status: 'unread'`, the
merged result keeps `status: 'unread'` — and the live clause requires
`'read'`. Verified against the **live ruleset** with the Firebase Rules `:test`
API:

| Case | Live ruleset |
|---|---|
| shipped client marks read (`isRead`+`readAt` only) | **DENIED** |
| a client that also sets `status: 'read'` | ALLOWED |
| forged status value | DENIED |

So mark-read is failing today for all 702 `unread` notifications, and the client
swallows the error in a `debugPrint`. N1 widens the clause to *"if you touch
`status` it must become `'read'`"*, leaving the
`hasOnly(['isRead','readAt','openedAt','status'])` allowlist — and therefore the
security boundary — unchanged. Test D2 proves a forged status, an out-of-allowlist
field, `isRead:false`, create, delete and cross-user read are all still denied.

**One N1 semantic worth stating,** found by testing rather than reading: N1
also admits a write that re-states the *same* status value (e.g. writing
`status: 'unread'` on a document already `'unread'`). `affectedKeys()` does not
report an unchanged field, so the first branch applies. The resulting document
is byte-identical to leaving `status` untouched, so this grants nothing new — a
status that actually *changes* must still become `'read'`, and `'archived'`,
`'forged'`, `'deleted'` and `''` are all rejected. Proven by `clientCompat`
test 6.

**Alternatives, for the owner to choose between:**

- **Keep N1** (recommended). Fixes every already-installed client immediately,
  including builds that will never be updated.
- **Fix the client instead** — have `markRead`/`markAllRead` also write
  `status: 'read'` — and drop N1 by setting `INCLUDE_N1 = False` in `build.py`.
  Cleaner data, but old installs stay broken until they update.
- **Both** is best long-term: N1 unblocks installed clients now, and a client
  fix keeps future writes internally consistent (N1 permits `isRead: true`
  alongside `status: 'unread'`, which is functionally fine — the UI reads
  `isRead` — but leaves `status` unreliable as a read-state indicator).

**Both were chosen.** N1 stays in this artifact (it unblocks every already
installed build), and the client fix landed in the Gate 3G release candidate:
`markRead` / `markAllRead` now write `status: kNotificationStatusRead` alongside
`isRead` / `readAt`, with the write set unchanged. `clientCompat` test 4 proves
that payload is accepted by **both** current live and this artifact, which is
why the client can ship before the rules change.

---

## 5. ⚠ DEPLOY PRECONDITIONS — both are hard

### 5.1 The backfill must be complete

L2–L5 are **fail-closed on missing data**. Test A2 demonstrates the consequence
directly: a status-less post that current live serves publicly becomes
**invisible to everyone but its author** under this ruleset.

Production is currently clean — feed `missingStatus = 0`, comments
`missingStatus = 0`, re-verified 2026-09-07. But per `WAVE3D` §"C6 IS NOT
PERMANENTLY VALID", that fact expires the moment an old client writes again.
**The freeze (`../comment-write-freeze-current-live/`) must be deployed first**,
and C7B re-run after it, before this ruleset may be deployed.

### 5.2 The status-aware client must be released

The build on Play is **0.1.8 (13) from 2026-08-22**; the status-aware consumer
queries landed in source on **2026-09-05**. Under this ruleset a list query that
could return a non-active document is rejected **in its entirety**, so today's
Play build would lose its feed and comment threads
outright — not degrade gracefully.

**Deploying this before a status-aware client release is a user-visible
production outage.**

**Status:** the release candidate is built — `0.1.9 (14)`, prepared under Gate
3G — and `clientCompat` test 3 demonstrates the break directly: the old build's
queries are DENIED by this ruleset while working under current live. The
remaining step is the owner uploading that AAB and adoption reaching the
owner's threshold.

---

## 6. Proof

### 6.1 `finalRules.test.cjs` — **11/11 passing**

Loads the final artifact and current live side by side; the C/E groups assert
*sameness* by running each operation against both rulesets.

| # | Proves |
|---|---|
| A1 | non-author reads only `status == 'active'`; author always sees own hidden/deleted/unknown/legacy |
| A2 | **fail-closed is the deploy precondition** — live ALLOWS a status-less post, final DENIES it |
| A3 | `group_only` / `private` visibility still applies on top of lifecycle |
| B1 | comment read: only `active`; deleted/unknown/legacy denied; author bypass intact |
| B2 | comment create requires `status: 'active'`; suspension still blocks |
| B3 | comments under a hidden/deleted parent stay inaccessible |
| C1 | **G6 engagement inherited and identical** — own follow, aggregate, menu comment, client query, all writes denied |
| D1 | **N1 repairs mark-read**, which live denies |
| D2 | N1 does not weaken the notification boundary |
| E1 | suspension, `accountStatus`, `isAdmin`, `pollVotes` unchanged |
| E2 | server-only stores and default-deny unchanged |

```bash
cd ops/wave3/rules-final-current-live
NODE_PATH="../../../functions/node_modules" \
  npx --no-install firebase emulators:exec \
    --only firestore --project demo-mm-g3g-fin --config firebase.json \
    "node --test finalRules.test.cjs"
```

### 6.2 `clientCompat.test.cjs` — **8/8 passing**

Proves the *client* is compatible, not just that the ruleset is correct. It
replays the exact queries and payloads the release-candidate app issues.

| # | Proves |
|---|---|
| 1 | **every** release-candidate query is ALLOWED by the final rules — all 9 providers |
| 2 | those queries return only lifecycle-visible documents, and the author still sees their own hidden post |
| 3 | **the OLD shipped client's unconstrained queries are DENIED** by the final rules while working under current live — this is the release gate, demonstrated rather than asserted |
| 4 | the new mark-read payload is accepted by the final rules **and by current live**, so the client is safe to release BEFORE the rules change |
| 5 | the `markAllRead` batch payload is accepted under both |
| 6 | a status that changes can only become `'read'` (see §4) |
| 7 | mark-read is idempotent and preserves untouched fields |
| 8 | out-of-allowlist fields and cross-user reads still rejected |

Test 4 is the one that makes the cutover ordering work: because the new payload
is valid under **both** rulesets, the client release and the rules deploy do not
have to be simultaneous.

### 6.3 Existing repo suite — **220 / 220 passing**

Run by temporarily substituting the repository root `firestore.rules`, which was
restored and verified byte-identical
(`1dff063d00d0bd791f4dfb558fc406ec1ffd426b784a218c21d654446f6af417`) afterwards.

This is the full suite green — the same suite that scores 203/220 against
current live, because current live lacks the lifecycle and notification rules
this artifact adds.

---

## 7. Deploy and rollback

```bash
cd ops/wave3/rules-final-current-live
# DEPLOY (cutover step 11 — only after §5.1 and §5.2 are both satisfied):
npx firebase deploy --only firestore:rules \
    --config firebase.deploy.json --project makanmana-c59f3
# ROLLBACK to current live G6:
npx firebase deploy --only firestore:rules \
    --config firebase.rollback.json --project makanmana-c59f3
```

`firebase.deploy.json` declares **only** `firestore.rules` — no indexes key
exists in it. `firebase.json` is a local emulator config on port 8186 and is not
a deploy target. Rolling back restores ruleset `f77c0ada` exactly and loses no
data.

---

## 8. Rebuilding

```bash
python ops/wave3/rules-final-current-live/build.py
```

Hash-guarded; each of the six grafts must match exactly once; G6 must remain
present exactly once. Set `INCLUDE_N1 = False` to build the lifecycle-only
variant described in §4.
