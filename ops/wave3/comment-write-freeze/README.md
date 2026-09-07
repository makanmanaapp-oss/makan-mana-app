# WAVE 3D GATE 3B — TEMPORARY POST-COMMENT WRITE FREEZE

> ## ⚠ SUPERSEDED — DO NOT DEPLOY THIS ARTIFACT
>
> Gate 3F fetched the ruleset that is **actually live** and found that this
> artifact's baseline commit (`759f650d`) had already drifted from production.
> Deploying this file would **remove live protections**, including
> `accountActive()` suspension enforcement (35 call sites), the `accountStatus*`
> protected fields (making self-unsuspend possible), and the `feed_posts`
> `pollVotes` read rule.
>
> Use **`../comment-write-freeze-rebased/`** instead — same one-clause freeze,
> rebased onto the actual live ruleset, with the regression proven test-by-test.
>
> This directory is retained for provenance only. Everything below describes the
> superseded artifact and remains accurate about *it*.


> **This is NOT the final Wave 3 ruleset.**
> It is a temporary, single-purpose production-closure ruleset used to reach
> write-quiescence before step **C7B** of `WAVE3D_COMMENT_LIFECYCLE_ROLLOUT.md`.
> It is local-only and has not been deployed.

---

## 1. Provenance

| Field | Value |
|---|---|
| **BASELINE COMMIT** | `759f650da1bc9a03b93117ee0c04d3253b81fec3` |
| Baseline commit subject | `fix(wave2): validate structured split hours at Firebase proposal boundary` |
| **BASELINE FILE** | `firestore.rules` (repository root, at that commit) |
| Baseline extraction | `git show 759f650da1bc9a03b93117ee0c04d3253b81fec3:firestore.rules` |
| Baseline sha256 | `81629f6e02097d32314520a13d025629696711d6d830990ad8612fc3d4837226` |
| Baseline lines | 911 |
| **TEMP ARTIFACT** | `ops/wave3/comment-write-freeze/firestore.rules` |
| Artifact sha256 | `5bcdaa0649683ec239160ed440346474cfabbde43d8546a2a18fb2255be529ac` |
| Artifact lines | 905 |
| Derived from | the **baseline** above — **NOT** the current Wave 3 root `firestore.rules` |

**PURPOSE**
Temporarily deny creation of `feed_posts/*/comments/*` while preserving current
production rule behaviour everywhere else.

**ROLLBACK**
Redeploy the exact production baseline `firestore.rules` from commit
`759f650da1bc9a03b93117ee0c04d3253b81fec3` if the freeze must be reverted before
the final Wave 3 rules rollout:

```
git show 759f650da1bc9a03b93117ee0c04d3253b81fec3:firestore.rules > firestore.rules
firebase deploy --only firestore:rules
```

### Why baseline and not current root rules

The current root `firestore.rules` is an accumulated **Wave 3C + Wave 3D** file.
Deploying it now would activate final lifecycle behaviour too early — before the
legacy backfill has completed. This artifact therefore starts from production
baseline and makes exactly **one** semantic change.

---

## 2. The exact freeze rule

Inside `match /feed_posts/{postId}` → `match /comments/{commentId}`, the baseline
CREATE permission is replaced by:

```
allow create: if false;
```

Nothing else in the file is altered: not comment read, not comment update, not
comment delete, not feed post rules, not user/profile, notifications, places,
merchant, `menu_comments`, any other collection, and no helper function.

---

## 3. Diff proof — baseline → freeze

`diff -u baseline.rules ops/wave3/comment-write-freeze/firestore.rules`

* **hunks: 1**
* lines removed: 19 · lines added: 13 (comment block + the single deny)
* the hunk is entirely inside `match /comments/{commentId}` under `feed_posts`

```diff
@@ -449,25 +449,19 @@
                       .data.get('status', 'active') != 'hidden'
                   && canReadPostData(
                       get(/databases/$(database)/documents/feed_posts/$(postId)).data)));
-        allow create: if signedIn()
-          && request.resource.data.authorUid == request.auth.uid
-          // ISSUE 005: medan denormalisasi PILIHAN mesti BENAR jika hadir
-          // (postId = induk sebenar; parentVisibility = visibility induk
-          // sebenar). Klien lama tanpa medan ini kekal diterima.
-          && (!request.resource.data.keys().hasAny(
-                  ['postId', 'parentVisibility'])
-              || (request.resource.data.get('postId', '') == postId
-                  && request.resource.data.get('parentVisibility', '')
-                      == get(/databases/$(database)/documents/feed_posts/$(postId))
-                          .data.get('visibility', 'public')))
-          && request.resource.data.text is string
-          && request.resource.data.text.size() > 0
-          && request.resource.data.text.size() <= 300
-          && exists(/databases/$(database)/documents/feed_posts/$(postId))
-          && canReadPostData(
-              get(/databases/$(database)/documents/feed_posts/$(postId)).data)
-          && get(/databases/$(database)/documents/feed_posts/$(postId))
-              .data.get('commentEnabled', true) != false;
+        // ===== WAVE 3D GATE 3B — TEMPORARY POST-COMMENT WRITE FREEZE =====
+        // ... (provenance comment) ...
+        allow create: if false;
         allow update: if false;
         allow delete: if signedIn()
           && resource.data.authorUid == request.auth.uid;
```

Required proof points:

1. **No unrelated rule changes** — the diff has exactly one hunk.
2. **The only intended semantic hunk is the nested post-comment CREATE rule** —
   the hunk range `@@ -449,25 +449,19 @@` sits wholly inside
   `feed_posts/{postId}/comments/{commentId}`.
3. **Baseline allows post-comment create subject to its existing validation** —
   proven in the emulator by `PROOF 2c`, which loads the baseline rules into a
   second `RulesTestEnvironment` and shows the *identical* payload/actor/path
   **succeeds** there.
4. **Freeze artifact contains `allow create: if false;`** — 1 occurrence.
5. **Freeze artifact does NOT contain the Wave 3 final comment-create lifecycle
   requirement** — `request.resource.data.status == 'active'` occurs **0** times
   here, versus **1** time in the current root Wave 3 rules (`firestore.rules:485`).
6. **Root authoritative `firestore.rules` remains identical to APP HEAD** —
   `git diff --name-only HEAD -- firestore.rules` returns nothing, and the
   content hash matches the HEAD blob:
   `2dce3560c27704aff316b01a99530dc1758ce7565308b7dd051af7f2be11e85f`
   (the working tree is CRLF, the git blob is LF; git itself reports the file
   unmodified).

### Sole comment-CREATE surface

The baseline also has a collection-group block
`match /{path=**}/comments/{commentId}` (baseline lines 845–858). It declares
**only** `allow get` and `allow list` — **no create**. The nested rule frozen
here is therefore the single comment-create surface in the ruleset, so
`allow create: if false;` closes the write path completely.

---

## 4. No final-rule activation

Counted per file, **compared against the baseline** (not string-absence alone):

| Wave 3 construct | baseline | freeze artifact | current root Wave 3 rules |
|---|---|---|---|
| `commentLifecycleActive` | 0 | **0** | 3 |
| `postLifecycleActive` | 0 | **0** | 2 |
| `restaurant_follows` | 0 | **0** | 1 |
| `menu_comments` | 0 | **0** | 2 |
| `request.resource.data.status == 'active'` | 0 | **0** | 1 |

Every construct's count in the freeze artifact **equals its baseline count**, so
no Wave 3 construct was introduced and none that legitimately pre-existed in
production was removed. The `NO-ACTIVATION` emulator test enforces this equality
at run time, not merely absence.

The freeze is additionally proven *behaviourally* not to be Wave 3: `PROOF 3`
shows a **status-less legacy comment stays readable by a stranger**, which the
final Wave 3 ruleset denies.

---

## 5. Files in this artifact

| File | Role |
|---|---|
| `firestore.rules` | the temporary freeze ruleset (baseline-derived) |
| `firebase.json` | isolated emulator config — loads *this* rules file, declares no deploy target |
| `freezeRules.test.cjs` | the single focused emulator test (15 tests) |
| `README.md` | this provenance / validation document |

Root `firebase.json`, root `firestore.rules` and `firestore.indexes.json` are
**untouched**.

---

## 6. How to run the emulator proof

The test follows the repository's existing rules-test pattern
(`@firebase/rules-unit-testing` + `node:test` + `initializeTestEnvironment`,
as in `functions/src/domain/feed/__tests__/rules-emulator/commentLifecycleRules.test.ts`).
It is a standalone CommonJS file so it can live in this isolated ops directory
instead of the `functions` build tree; `NODE_PATH` points at the already-installed
`functions/node_modules` so no new dependency is added anywhere.

From **this directory**:

```bash
# 1. baseline copy — TEMP LOCATION ONLY, never inside this artifact
git -C ../../.. show 759f650da1bc9a03b93117ee0c04d3253b81fec3:firestore.rules \
  > "$TMPDIR/baseline.rules"

# 2. run the freeze proof
NODE_PATH="../../../functions/node_modules" \
FREEZE_BASELINE_RULES="$TMPDIR/baseline.rules" \
npx firebase emulators:exec --only firestore --project demo-mm-freeze \
  "node --test freezeRules.test.cjs"
```

Without `FREEZE_BASELINE_RULES` the two baseline-contrast checks skip loudly
rather than silently passing.

### What the tests prove

| # | Owner requirement | Test |
|---|---|---|
| 1 | cannot CREATE a post comment without `status` | `PROOF 1` |
| 2 | cannot CREATE a post comment **with** `status="active"` (freeze truly unconditional) | `PROOF 2`, plus `PROOF 2b` (even the post author) and `PROOF 2c` (baseline contrast) |
| 3 | existing readable legacy comment remains readable per **production baseline** | `PROOF 3`, `PROOF 3b` |
| 4 | deleted-comment baseline read behaviour unchanged | `PROOF 4` |
| 5 | comment-author read bypass unchanged | `PROOF 5` |
| 6 | update/delete unchanged from baseline | `PROOF 6a` (update denied), `PROOF 6b` (author delete allowed), `PROOF 6c` (non-author delete denied) |
| 7 | representative non-comment operation governed identically | `PROOF 7a` (feed_posts create/update denied, author delete allowed), `PROOF 7b` (group_only visibility) — reinforced by the one-hunk exact diff, which is the stronger proof for every collection not exercised here |
| 8 | `menu_comments` untouched | `PROOF 8` — absent from **both** baseline and freeze (0 occurrences each), so it stays default-deny in both |

Result: **15 tests, 15 pass, 0 fail, 0 skipped.**

---

## 7. Operational placement

This freeze belongs between **C7A-2** and **C7B** of
`WAVE3D_COMMENT_LIFECYCLE_ROLLOUT.md`:

1. deploy this freeze ruleset — post-comment creation stops for **all** clients;
2. wait for in-flight writes to drain (write-quiescence);
3. run the comment status backfill to completion (`C7A`);
4. deploy the final Wave 3 ruleset (`C7B`), which lifts the freeze and replaces
   it with the lifecycle-aware create rule.

Under **OPTION B** the owner has accepted that old/stale clients lose
post-comment creation from step 1 onward. The freeze exists so that no
lifecycle-less comment can be created during the backfill window — Option B
alone does not close that data race.

**Do not leave this ruleset deployed past C7B.**
