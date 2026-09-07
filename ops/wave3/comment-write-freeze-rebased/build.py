# WAVE 3 GATE 3F — CASE C: rebase the TEMPORARY post-comment write freeze onto
# the ACTUAL live production ruleset.
#
# The freeze is a write-quiescence artifact, NOT a Wave 3 activation: its only
# delta is an unconditional deny on post-comment CREATE. It therefore rebases
# onto the LIVE ruleset directly, NOT onto the Wave 3 rebased ruleset — it must
# not introduce lifecycle or engagement semantics.
import hashlib
import sys

BASE = 'ops/wave3/rules-rebase/live-baseline.rules'
OUT = 'ops/wave3/comment-write-freeze-rebased/firestore.rules'
LIVE_SHA = '9a61b0476a6dd2e817f148e73c36abb3dfd373b8d59cc8c326570fe685712bb6'

src = open(BASE, encoding='utf-8', newline='').read()
actual = hashlib.sha256(src.encode('utf-8')).hexdigest()
if actual != LIVE_SHA:
    sys.exit('ABORT: live baseline sha256 mismatch: %s' % actual)

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

NEW = """        // ===== WAVE 3D GATE 3B — TEMPORARY POST-COMMENT WRITE FREEZE =====
        // REBASED (Gate 3F) onto the ACTUAL LIVE production ruleset.
        //
        // The live CREATE rule (authorUid ownership, optional
        // postId/parentVisibility denormalisation truth check, text 1..300,
        // parent exists + readable, commentEnabled, accountActive) is
        // TEMPORARILY replaced by an unconditional deny so that NO client —
        // current or stale — can create a lifecycle-less post comment during
        // the C7B verification window.
        //
        // This is a write-quiescence artifact, NOT the final Wave 3 ruleset:
        // it introduces NO lifecycle status requirement and NO Wave 3
        // engagement collection. Everything else in this file is the live
        // ruleset, byte-for-byte.
        //
        // ROLLBACK: redeploy the live ruleset preserved alongside this file at
        // ops/wave3/rules-rebase/live-baseline.rules.
        allow create: if false;
"""

n = src.count(OLD)
if n != 1:
    sys.exit('ABORT: freeze graft matched %d times (expected exactly 1)' % n)
out = src.replace(OLD, NEW, 1)

open(OUT, 'w', encoding='utf-8', newline='\n').write(out)
print('wrote  %s' % OUT)
print('bytes  %d' % len(out.encode('utf-8')))
print('sha256 %s' % hashlib.sha256(out.encode('utf-8')).hexdigest())
