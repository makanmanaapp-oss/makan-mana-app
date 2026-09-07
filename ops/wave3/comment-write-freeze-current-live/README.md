# WAVE 3 GATE 3G — TEMPORARY COMMENT WRITE FREEZE, ON CURRENT LIVE (NOT DEPLOYED)

> **NOT DEPLOYED.** This is the C7A-2 write-closure mechanism for the Wave 3D
> cutover. See `../CUTOVER_ORDER.md` step 5.
>
> **Supersedes** `../comment-write-freeze/` (built on commit `759f650d`) and
> `../comment-write-freeze-rebased/` (built on the pre-G6 August ruleset).
> Both are now stale: neither contains the G6 engagement rules, so deploying
> either would **remove the live Follow and menu-comment read access**.

---

## 1. Why this exists

`WAVE3D_COMMENT_LIFECYCLE_ROLLOUT.md` §C7A-2 requires proof that a
lifecycle-less comment **cannot be created at all** before the C7B delta scan
runs. The runbook is explicit that re-running the scan closer to the deploy
shrinks the race window but does not close it — and equally explicit that no
write-closure mechanism existed:

> *"No such mechanism was built here, and none is known to exist in this
> repository. It must not be invented as part of this runbook."*

This artifact is that mechanism, built as a separate ops artifact rather than
inside the runbook.

---

## 2. Provenance

| Field | Value |
|---|---|
| **BASE** | the **CURRENT LIVE** production ruleset (post-G6) |
| Base ruleset id | `f77c0ada-9bf6-43f3-b419-7397510a8bb0` |
| Base createTime | `2026-09-07T10:50:08.005455Z` |
| Base file / bytes / sha256 | `live-baseline.rules` / 43755 / `c3a44df897a10ae7bd1711643aa6737441703e8c353b6fb990e43f5b9ad15925` |
| **ARTIFACT** | `firestore.rules` |
| Artifact bytes / sha256 | 43453 / `3f53747db9f300f68ce1beb8ab156e5e5565d3fb2606f4e46a2ed77f0e29de44` |
| Built at APP HEAD | `2e4abe6ba318f39c8e7955be59e7d9f4aa4ba306` |

`live-baseline.rules` was fetched from the Firebase Rules API on 2026-09-07 and
is byte-exact. `build.py` refuses to run unless it still hashes to the value
above.

---

## 3. The entire delta

One clause, in `feed_posts/{postId}/comments/{commentId}`:

```
- allow create: if signedIn()
-   && request.resource.data.authorUid == request.auth.uid
-   && (... optional postId / parentVisibility denormalisation truth check ...)
-   && request.resource.data.text is string
-   && request.resource.data.text.size() > 0
-   && request.resource.data.text.size() <= 300
-   && exists(...feed_posts/$(postId))
-   && canReadPostData(get(...feed_posts/$(postId)).data)
-   && get(...feed_posts/$(postId)).data.get('commentEnabled', true) != false
-   && accountActive();
+ allow create: if false;
```

Proven structurally by `../structdiff.py`, which parses every match block and
function at every nesting depth:

| Measure | Result |
|---|---|
| REMOVED existing match blocks | **0** |
| MODIFIED existing match blocks | **exactly 1** — `feed_posts/{postId}/comments/{commentId}` |
| NEW match blocks | **0** |
| NEW domain behaviour | **none** |
| Functions removed / modified / new | **0 / 0 / 0** |
| `accountActive()` call sites | **34** (35 minus the one call inside the replaced clause — the only arithmetic that could change) |
| G6 engagement rules | all 3 present and unchanged |
| Default-deny catch-all | still last |

```bash
python ops/wave3/structdiff.py \
  ops/wave3/comment-write-freeze-current-live/live-baseline.rules \
  ops/wave3/comment-write-freeze-current-live/firestore.rules \
  --expect-removed=0 --expect-modified=1 --expect-new=0 --expect-new-fn=0 \
  "--modified=feed_posts/{postId}/comments/{commentId}" \
  "--count=34:accountActive()" --forbid=postLifecycleActive
```

---

## 4. What this artifact must NOT do

It must not activate Wave 3 lifecycle semantics — that would defeat its purpose,
which is to reach quiescence *before* those semantics go live. Test F3 proves
this behaviourally: a status-less legacy comment stays **readable**, exactly as
under current live. Test F9 proves it at source level by requiring the
`postLifecycleActive` / `commentLifecycleActive` counts to equal the live counts
(i.e. zero).

---

## 5. Proof

### 5.1 `freezeRules.test.cjs` — **9/9 passing**

Loads the freeze and current live side by side; tests F3–F8 assert *sameness*
by running the operation against both rulesets and requiring identical outcomes.

| # | Proves |
|---|---|
| F1 | a create current live **accepts** is denied by the freeze |
| F2 | no status value and no actor gets past it — not even the post author |
| F3 | existing comments read exactly as under current live (legacy readable, deleted denied, author bypass intact) |
| F4 | comment update/delete unchanged |
| F5 | post read/create/delete and `group_only` visibility unchanged |
| F6 | **G6 engagement reads still work** — own follow doc, aggregate, visible menu comment, and the client's own follow query |
| F7 | suspension, `accountStatus` protection and `pollVotes` unchanged |
| F8 | server-only stores and the default-deny catch-all unchanged |
| F9 | source level: no lifecycle construct, live protections present |

```bash
cd ops/wave3/comment-write-freeze-current-live
NODE_PATH="../../../functions/node_modules" \
  npx --no-install firebase emulators:exec \
    --only firestore --project demo-mm-g3g-frz --config firebase.json \
    "node --test freezeRules.test.cjs"
```

### 5.2 Existing repo suite — a delta, not an absolute

`npm run test:rules` encodes the **final** Wave 3 ruleset, so it cannot pass
against a freeze. Measured against current live:

| Ruleset | Result |
|---|---|
| current live (G6) | 203 / 220 |
| this freeze | 206 / 220 |
| **new failures introduced** | **exactly 1** |
| failures removed | 4 |

The single new failure is *"9. client CREATE with status active — ALLOWED when
all constraints hold"* — which is precisely what a freeze is for. The 4 removed
are create-denial tests that now pass because everything is denied.

---

## 6. Deploy and rollback

```bash
cd ops/wave3/comment-write-freeze-current-live
# DEPLOY (cutover step 5 — only after C7A-1 and the client release):
npx firebase deploy --only firestore:rules \
    --config firebase.deploy.json --project makanmana-c59f3
# ROLLBACK to current live G6:
npx firebase deploy --only firestore:rules \
    --config firebase.rollback.json --project makanmana-c59f3
```

`firebase.deploy.json` declares **only** `firestore.rules` — no indexes key
exists in it, so indexes cannot be touched. `firebase.json` is a local emulator
config on port 8185 and is not a deploy target.

The freeze is **not** lifted by a separate deploy: cutover step 11 deploys the
final ruleset, which contains a proper comment-create rule and overwrites this
one atomically.

---

## 7. Rebuilding

```bash
python ops/wave3/comment-write-freeze-current-live/build.py
```

Hash-guarded, single graft, must match exactly once. It additionally aborts if
any lifecycle construct leaks in or if any G6 engagement rule is lost.
