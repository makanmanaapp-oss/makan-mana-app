# WAVE 3 GATE 3G — TEMPORARY post-comment write freeze, rebased onto the
# CURRENT LIVE (post-G6) production ruleset.
#
# Purpose: write quiescence before C7B, and NOTHING else. The entire semantic
# difference from current live is one clause:
#
#     feed_posts/{postId}/comments/{commentId}   allow create: if false;
#
# This artifact deliberately does NOT activate any Wave 3 lifecycle semantics.
# It must not be confused with ../rules-final-current-live/.
#
# Supersedes ../comment-write-freeze/ (built on commit 759f650d, pre-G6) and
# ../comment-write-freeze-rebased/ (built on the pre-G6 August ruleset). Both
# of those are now stale: neither contains the G6 engagement rules, so
# deploying either would REMOVE live Follow/menu-comment read access.
import hashlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(HERE, 'live-baseline.rules')
OUT = os.path.join(HERE, 'firestore.rules')

# The ruleset deployed by Gate 3G (engagement-only G6).
LIVE_SHA = 'c3a44df897a10ae7bd1711643aa6737441703e8c353b6fb990e43f5b9ad15925'

src = open(BASE, encoding='utf-8', newline='').read()
actual = hashlib.sha256(src.encode('utf-8')).hexdigest()
if actual != LIVE_SHA:
    sys.exit('ABORT: base is not the current live ruleset.\n'
             '  expected %s\n  actual   %s' % (LIVE_SHA, actual))

OLD = """        allow create: if signedIn()
          && request.resource.data.authorUid == request.auth.uid
          // ISSUE 005: medan denormalisasi PILIHAN mesti BENAR jika hadir
          // (postId = induk sebenar; parentVisibility = visibility induk
          // sebenar). Klien lama tanpa medan ini kekal diterima.
          && (!request.resource.data.keys().hasAny(
                  ['postId', 'parentVisibility'])
              || (request.resource.data.get('postId', '') == postId
                  && request.resource.data.get('parentVisibility', '')
                      == get(/databases/$(database)/documents/feed_posts/$(postId))
                          .data.get('visibility', 'public')))
          && request.resource.data.text is string
          && request.resource.data.text.size() > 0
          && request.resource.data.text.size() <= 300
          && exists(/databases/$(database)/documents/feed_posts/$(postId))
          && canReadPostData(
              get(/databases/$(database)/documents/feed_posts/$(postId)).data)
          && get(/databases/$(database)/documents/feed_posts/$(postId))
              .data.get('commentEnabled', true) != false
          // Phase 1C-A1.2 — a suspended account cannot author comments directly.
          && accountActive();
"""

NEW = """        // ===== WAVE 3 GATE 3G — TEMPORARY POST-COMMENT WRITE FREEZE =====
        // Rebased onto the CURRENT LIVE (post-G6) production ruleset.
        //
        // The live CREATE rule (authorUid ownership, optional
        // postId/parentVisibility denormalisation truth check, text 1..300,
        // parent exists + readable, commentEnabled, accountActive) is
        // TEMPORARILY replaced by an unconditional deny, so that NO client —
        // current or stale — can create a lifecycle-less post comment during
        // the C7B verification window.
        //
        // This is a write-quiescence artifact ONLY. It introduces NO lifecycle
        // status requirement. Everything else in this file, INCLUDING the G6
        // engagement rules now live in production, is unchanged.
        //
        // ROLLBACK: redeploy ../rules-engagement-g6/firestore.rules, which is
        // the ruleset this artifact was derived from.
        allow create: if false;
"""

n = src.count(OLD)
if n != 1:
    sys.exit('ABORT: freeze graft matched %d times (expected exactly 1)' % n)
out = src.replace(OLD, NEW, 1)

# The freeze must not smuggle in any Wave 3 lifecycle construct.
for token in ['postLifecycleActive', 'commentLifecycleActive',
              "request.resource.data.status == 'active'"]:
    if token in out:
        sys.exit('ABORT: lifecycle construct leaked into the freeze: %s' % token)

# The G6 engagement rules must survive untouched.
for token in ['match /restaurant_follows/{followId}',
              'match /restaurant_public/{canonicalPlaceId}',
              'match /menu_comments/{commentId}']:
    if token not in out:
        sys.exit('ABORT: G6 engagement rule lost from the freeze: %s' % token)

with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
    fh.write(out)

raw = out.encode('utf-8')
print('applied the single comment-create freeze graft')
print('base  bytes %d  sha256 %s' % (len(src.encode('utf-8')), actual))
print('wrote %s' % OUT)
print('out   bytes %d  sha256 %s' % (len(raw), hashlib.sha256(raw).hexdigest()))
