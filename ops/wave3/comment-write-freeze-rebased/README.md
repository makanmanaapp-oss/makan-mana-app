# WAVE 3 GATE 3F — REBASED POST-COMMENT WRITE FREEZE (NOT DEPLOYED)

> **NOT DEPLOYED. DO NOT DEPLOY FROM THIS DIRECTORY.**
> This supersedes `ops/wave3/comment-write-freeze/`, which was derived from a
> repository commit that had already drifted from production and would have
> **removed live protections** if deployed.

---

## 1. Why this exists

The Gate 3B freeze is a **write-quiescence** artifact: it stops new
lifecycle-less post comments from being created during the C7B verification
window of `WAVE3D_COMMENT_LIFECYCLE_ROLLOUT.md`. That purpose is unchanged.

What changed is the **base**. The original artifact was built on repository
commit `759f650d`. Gate 3F fetched the ruleset that is *actually live* and found
that the repository had drifted from it: several protections exist in production
but not in the branch. Deploying the old freeze would have silently rolled them
back — a temporary artifact causing a permanent regression.

This artifact is therefore the **live production ruleset** with exactly one
clause changed.

---

## 2. Provenance

| Field | Value |
|---|---|
| **BASE** | the **ACTUAL LIVE PRODUCTION RULESET** (shared with `../rules-rebase/`) |
| Live ruleset id | `56e55c24-d82d-4a73-9c11-dee45d018c2b` |
| Live ruleset createTime | `2026-08-24T15:30:00Z` |
| Base file | `../rules-rebase/live-baseline.rules` |
| Base bytes / sha256 | `41668` / `9a61b0476a6dd2e817f148e73c36abb3dfd373b8d59cc8c326570fe685712bb6` |
| **ARTIFACT** | `firestore.rules` |
| Artifact bytes / sha256 | `41401` / `c0fe67481acae4b399ed56a6af2c66cdf90516533eb3ad0f8b274082535491e9` |
| Superseded artifact | `../comment-write-freeze/firestore.rules` (`sha256 5bcdaa06…`) |
| Built at APP HEAD | `c1ab3891b2e69f8759d924c7136f3ec24a2b0390` |

The base is deliberately the **live ruleset**, not the Wave 3 ruleset in
`../rules-rebase/`. A freeze that activated Wave 3 lifecycle semantics would
defeat its own purpose — the whole point is to reach quiescence *before* those
semantics go live.

---

## 3. The entire delta

One clause, in `feed_posts/{postId}/comments`:

```
- allow create: if signedIn()
-   && request.resource.data.authorUid == request.auth.uid
-   && (... optional postId / parentVisibility denormalisation truth check ...)
-   && request.resource.data.text is string
-   && request.resource.data.text.size() > 0
-   && request.resource.data.text.size() <= 300
-   && exists(/databases/$(database)/documents/feed_posts/$(postId))
-   && canReadPostData(get(/databases/$(database)/documents/feed_posts/$(postId)).data)
-   && get(/databases/$(database)/documents/feed_posts/$(postId))
-       .data.get('commentEnabled', true) != false
-   && accountActive();
+ allow create: if false;
```

A `diff` of the comment-stripped live ruleset against the comment-stripped
artifact yields this hunk and nothing else. Comment **read**, **update** and
**delete**, post rules, visibility rules, and every other collection are the
live rules byte-for-byte.

The `accountActive()` count drops from 35 to 34 for the obvious reason: one call
site lived inside the clause that was replaced.

---

## 4. What the rebase recovers

These are live protections the superseded freeze had lost. Each is proven by
running the same operation against both artifacts.

| Live protection | Old freeze (759f650d) | This artifact | Test |
|---|---|---|---|
| `accountActive()` suspension enforcement | **lost** — suspended account writes freely | preserved | `R1` |
| `accountStatus*` protected fields | **lost** — self-unsuspend possible | preserved | `R2` |
| `feed_posts/{postId}/pollVotes` read | **lost** — voter cannot read own vote | preserved | `R3` |
| notification + admin-bridge server-only stores | explicit rules absent | preserved | `R4` |

---

## 5. Proof

`freezeRules.test.cjs` — **12/12 passing**. Three rulesets are loaded side by
side in one emulator: this artifact, the live baseline, and the superseded
freeze.

| Group | Proves |
|---|---|
| F1–F2 | the freeze is unconditional — a create **live accepts** is denied, and no `status` value gets a client past it, not even the post author |
| F3–F4 | reads stay **live** behaviour: a status-less legacy post and comment remain readable, so Wave 3 is **not** activated early; the deleted-comment boundary and author bypass are unchanged |
| F5–F6 | comment update denied, author delete allowed, stranger delete denied; post create/update denied, author delete allowed, `group_only` still private |
| R1–R4 | the live protections in §4 survive — and the superseded freeze loses each one |
| N1–N2 | source-level: every Wave 3 construct occurs exactly as often as in the live file (i.e. never), the live-only protections are physically present, and exactly one clause differs from live |

### Run it yourself

```bash
cd ops/wave3/comment-write-freeze-rebased
NODE_PATH="../../../functions/node_modules" \
  npx --no-install firebase emulators:exec \
    --only firestore --project demo-mm-w3-gate3f-frz --config firebase.json \
    "node --test freezeRules.test.cjs"
```

`firebase.json` here is a local-only emulator config on port 8183. It declares
no project alias, no hosting, no functions, no storage and no indexes, so it
cannot be used as a deploy target.

---

## 6. Rebuilding

```bash
python ops/wave3/comment-write-freeze-rebased/build.py   # from the repo root
```

`build.py` asserts the base hash, then replaces the single comment-create clause
— required to match exactly once — and aborts otherwise.

---

## 7. Rollback

The freeze is temporary by construction. To lift it, redeploy the live ruleset
preserved verbatim at `../rules-rebase/live-baseline.rules` — that restores the
exact ruleset that was live before the freeze, including the comment-create rule
this artifact denies.

---

## 8. Status

| | |
|---|---|
| Deployed | **NO** |
| Superseded artifact deployed | **NO** (it never was) |
| Root `firestore.rules` modified | **NO** |
| Production data written | **NO** |

Deploying a freeze is an owner decision. If one is ever deployed, it must be
this artifact and not `../comment-write-freeze/`.
