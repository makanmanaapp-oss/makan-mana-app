# WAVE 3 — AUTHORITATIVE PRODUCTION CUTOVER ORDER

> **NOTHING IN THIS DOCUMENT HAS BEEN EXECUTED.** It is the reconciled plan.
> Prepared 2026-09-07 against the ruleset live at that moment.

Reconciled against `WAVE3C_POST_LIFECYCLE_ROLLOUT.md` and
`WAVE3D_COMMENT_LIFECYCLE_ROLLOUT.md`. Where the runbooks are stricter than a
conceptual A→O sequence, **the runbooks win** — and they are, in two places
that matter (see §3).

---

## 1. Current state

| | |
|---|---|
| Live ruleset | `f77c0ada-9bf6-43f3-b419-7397510a8bb0` |
| Live source SHA256 | `c3a44df897a10ae7bd1711643aa6737441703e8c353b6fb990e43f5b9ad15925` |
| Live contains | pre-G6 baseline **+ G6 engagement reads** (`restaurant_follows`, `restaurant_public`, `menu_comments`) |
| Live does **not** contain | any post/comment lifecycle rule, any freeze |
| Rollback base for the whole cutover | **the ruleset above** — *not* the pre-G6 August ruleset `56e55c24` |

Fresh zero-write production scans, 2026-09-07:

| Scan | Result |
|---|---|
| feed post lifecycle | scanned 70, **missingStatus 0**, alreadyActive 50, deleted 20, errors 0, truncated no → Phase 5 complete YES |
| nested post comment lifecycle | scanned 12, **missingStatus 0**, active 12, errors 0, truncated no → Phase C6 complete YES |
| repost `originalSnapshot` | scanned 70, **wouldSanitize 0**, alreadySafe 10, errors 0, truncated no → scrub complete YES |

No new lifecycle-less comments have appeared since the apply.

---

## 2. Gate status

| Runbook phase | What it requires | Status |
|---|---|---|
| 3C Phase 1 | lifecycle-aware feed writers deployed | **DONE** — all 5 creators stamp `status: active`; deployed 2026-09-05T20:00Z; source unchanged since |
| 3C Phase 2 / 3D C2 | indexes READY | **DONE** — `visibility+status+createdAt`, `visibility+status+likeCount`, `groupId+status+createdAt`, `authorUid+visibility+status+createdAt`, `comments: status+createdAt` all READY |
| 3C Phase 3–4 | feed dry-run + apply | **DONE** |
| 3C Phase 5 | feed verify `missingStatus = 0` | **DONE (re-verified today)** |
| 3C Phase 7B–7D | repost scrub + verify | **DONE (re-verified today)** |
| 3D C1 | comment write-path source | **DONE** — client composer stamps `status: kCommentStatusActive` |
| 3D C3–C5 | comment dry-run + apply | **DONE** |
| 3D C6 | comment verify `missingStatus = 0` | **DONE (re-verified today)** — but see §3.1, C6 is not permanently valid |
| **3C Phase 6 / 3D C7** | **status-aware CLIENT RELEASED** | **NOT DONE — see §3.2** |
| **3D C7A-1** | owner records Option A or Option B | **NOT RECORDED** |
| **3D C7A-2** | lifecycle-less comment creation IMPOSSIBLE | **mechanism now EXISTS, not deployed** |
| 3D C7B | final delta scan, after C7A-2 | blocked on C7A-2 |
| 3C Phase 7 / 3D C8 | deploy final rules | blocked |

---

## 3. The two places the runbooks are stricter

### 3.1 C6 cannot be carried forward — write closure must precede C7B

`WAVE3D` §"C6 IS NOT PERMANENTLY VALID" is explicit: until the final rules are
live, an older app can create a status-less comment **at any moment**, silently
invalidating the scan. Re-running the scan closer to the deploy *shrinks* the
window but does **not** close the race.

C7A-2 therefore demands proof that lifecycle-less comment creation is
**impossible at the moment C7B starts**. The runbook records that no such
mechanism existed:

> *"No such mechanism was built here, and none is known to exist in this
> repository. It must not be invented as part of this runbook."*

**That gap is now closed.** `ops/wave3/comment-write-freeze-current-live/` is
exactly the Option-B write-quiescence mechanism the runbook describes but did
not provide. It is built, proven, and **not deployed**.

Consequence for ordering: the freeze deploy is **not** an optional hardening
step that could be skipped or reordered. It is the C7A-2 precondition, and C7B
is invalid without it.

### 3.2 The client release gate is NOT satisfied in production

This is the largest outstanding risk and it is **not** a rules problem.

| | |
|---|---|
| Status-aware consumer queries landed in source | `1a17253` / `f6fe98e`, **2026-09-05** |
| Production app on Play | **0.1.8 (13)**, built/installed **2026-08-22** |

The released production client **predates the lifecycle-aware queries by two
weeks**. Its feed and comment queries are still unconstrained.

`WAVE3C` Phase 6 warns precisely about this: clients that "still run
unconstrained queries … will start failing at Phase 7". Under the final rules a
list query that could return a non-active document is rejected **in its
entirety** — so deploying C8 against today's Play build would break the feed and
comment threads for every production user, not degrade them gracefully.

**Deploying the final rules before a status-aware client release is a
user-visible production outage.** That is the reason this audit returns HOLD for
the full cutover.

---

## 4. The exact order

Steps 1–3 are prerequisites with no production mutation. The first production
mutation is step 5.

| # | Step | Gate to pass before continuing |
|---|---|---|
| 1 | **Confirm writers + indexes** (already true today) | 5 creators stamp `status: active`; the lifecycle composites are READY |
| 2 | **C7A-1 — owner records Option A or Option B** | one outcome explicitly recorded. Option B alone does **not** unlock C8 |
| 3 | **Release the status-aware client** (3C Phase 6 + 3D C7) and let adoption reach the owner's threshold | production build carries `status == active` on feed + comment queries. **This is the long pole** |
| 4 | Re-fetch live rules; confirm the base is still `f77c0ada` / `c3a44df8` | no drift, else rebuild both artifacts on the new base |
| 5 | **Deploy the freeze** — `comment-write-freeze-current-live/firebase.deploy.json` | C7A-2 |
| 6 | **Verify comment CREATE is denied** in production | a real create attempt fails |
| 7 | Short controlled propagation window (rules propagate globally within seconds; the window is for in-flight clients) | — |
| 8 | **C7B — full comment delta scan** | `missingStatus = 0`, `unknownStatus = 0`, `errors = 0`, `truncated = no`. Valid through to step 11 **because writes are already closed** |
| 9 | If step 8 is non-zero: apply the guarded comment backfill, then repeat step 8 until zero | zero |
| 10 | Re-verify feed `missingStatus = 0` and repost pending `= 0` | both zero |
| 11 | **Deploy the FINAL rules** — `rules-final-current-live/firebase.deploy.json` | 3C Phase 7 + 3D C8. This single deploy also **lifts the freeze**, because the final ruleset restores a real comment-create rule (now requiring `status == 'active'`) |
| 12 | **Verify the live ruleset** — re-fetch and confirm SHA256 matches the deployed artifact | byte-identical |
| 13 | **Production E2E** — 3C Phase 8 + 3D C9 | feed reads, comment create/read, moderation, Follow/menu comments still work |
| 14 | SAFE-OFF confirmation and new production baseline | record the new ruleset id + SHA as the next rollback base |

**On step 11 replacing step 5:** the freeze is never "removed" as a separate
deploy. The final ruleset is a complete file that contains a proper
comment-create rule, so deploying it overwrites the freeze in one atomic
release. There is no window in which both are half-applied.

---

## 5. Rollback

The rollback base for **every** step of this cutover is the **current live G6
ruleset**, `f77c0ada` / `c3a44df8` — preserved byte-exact as
`live-baseline.rules` in both new artifact directories.

```bash
# Roll back the freeze (step 5) or the final rules (step 11):
cd ops/wave3/<comment-write-freeze-current-live|rules-final-current-live>
npx firebase deploy --only firestore:rules \
    --config firebase.rollback.json --project makanmana-c59f3
```

Then re-fetch and confirm the live SHA256 is
`c3a44df897a10ae7bd1711643aa6737441703e8c353b6fb990e43f5b9ad15925`.

> **Do NOT use `ops/wave3/rules-engagement-g6/firebase.rollback.json` for this
> cutover.** That one targets the pre-G6 August ruleset `56e55c24`, which is the
> correct rollback for the G6 deploy itself but would **remove the live Follow
> and menu-comment read access** if used now.

Rolling back rules never loses data: post/comment status fields and the
engagement documents are written by Cloud Functions, which bypass rules.

Superseded and **not** to be deployed: `ops/wave3/rules-rebase/`,
`ops/wave3/comment-write-freeze/`, `ops/wave3/comment-write-freeze-rebased/` —
all three predate G6 and would remove the live engagement rules.

---

## 6. Verdict

Every technical artifact is built, proven and ready. The cutover is **HOLD** on
two non-technical gates:

1. **C7A-1** — the owner has not recorded Option A or Option B.
2. **The client release** — production is two weeks behind the status-aware
   build, and deploying the final rules before that lands is a user-visible
   outage.

Neither can be closed by more rules work.
