# WAVE 3 GATE 3G — FINAL Wave 3 ruleset, rebased onto the CURRENT LIVE
# (post-G6) production ruleset.
#
# G6 (restaurant_follows / restaurant_public / menu_comments) is ALREADY LIVE
# and is inherited from the base — it is NOT redefined here. This build adds
# only the still-pending approved Wave 3 changes.
#
# EVERY semantic delta, enumerated:
#   L1  add postLifecycleActive(p) and commentLifecycleActive(c) helpers
#   L2  canReadPostData: non-owner branches require postLifecycleActive(p)
#   L3  post-comment READ: "status != 'deleted'" -> "status == 'active'"
#   L4  post-comment CREATE: must declare status == 'active'
#   L5  collection-group comment GET: same tightening as L3
#   N1  notification mark-read compatibility  (SEPARATE — see README §4)
#
# L1-L5 are the lifecycle scope. N1 is reported separately because it is not
# lifecycle work; it repairs a defect that is live right now. Set
# INCLUDE_N1 = False to build the lifecycle-only variant.
import hashlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(HERE, 'live-baseline.rules')
OUT = os.path.join(HERE, 'firestore.rules')

# The ruleset deployed by Gate 3G (engagement-only G6).
LIVE_SHA = 'c3a44df897a10ae7bd1711643aa6737441703e8c353b6fb990e43f5b9ad15925'

INCLUDE_N1 = True

src = open(BASE, encoding='utf-8', newline='').read()
actual = hashlib.sha256(src.encode('utf-8')).hexdigest()
if actual != LIVE_SHA:
    sys.exit('ABORT: base is not the current live ruleset.\n'
             '  expected %s\n  actual   %s' % (LIVE_SHA, actual))

grafts = []


def graft(name, old, new):
    grafts.append((name, old, new))


# ── L1: lifecycle helpers, inserted directly above canReadPostData ──────────
graft(
    'L1 lifecycle helpers',
    """    // SP9 + SP9.2B: kebolehbacaan siaran feed berdasarkan keterlihatan.""",
    """    // WAVE 3C — KITARAN HAYAT siaran feed. Bukan-pengarang HANYA boleh baca
    // siaran yang statusnya TEPAT 'active'. GAGAL-TERTUTUP: 'hidden'/'deleted',
    // status tidak dikenali, DAN status TIADA semuanya DITOLAK. Sengaja TIDAK
    // guna get('status','active'): lalai itulah yang dahulu menjadikan siaran
    // disorok-moderator mustahil dibezakan daripada siaran legasi.
    // PRASYARAT DEPLOY: backfill status siaran legasi MESTI selesai dahulu.
    function postLifecycleActive(p) {
      return p.get('status', '') == 'active';
    }

    // WAVE 3D — KITARAN HAYAT komen post (feed_posts/{postId}/comments).
    // Bukan-pengarang HANYA boleh baca komen yang statusnya TEPAT 'active'.
    // GAGAL-TERTUTUP: 'deleted', status tidak dikenali, DAN status TIADA
    // semuanya DITOLAK.
    // NOTA: ini BUKAN menu_comments — itu domain Wave 3C yang berasingan dan
    // sudah LIVE sejak Gate 3G (G6).
    // PRASYARAT DEPLOY: backfill status komen legasi MESTI selesai dahulu.
    function commentLifecycleActive(c) {
      return c.get('status', '') == 'active';
    }

    // SP9 + SP9.2B: kebolehbacaan siaran feed berdasarkan keterlihatan.""",
)

# ── L2: canReadPostData gains the lifecycle gate on every NON-OWNER branch ──
graft(
    'L2 canReadPostData lifecycle gate',
    """      return p.get('authorUid', '') == request.auth.uid
        || (vis == 'group_only'
            ? isGroupMember(p.get('groupId', '__none__'))
            : (vis == 'public' || vis == 'unlisted'));""",
    """      return p.get('authorUid', '') == request.auth.uid
        || (postLifecycleActive(p)
            && (vis == 'group_only'
                ? isGroupMember(p.get('groupId', '__none__'))
                : (vis == 'public' || vis == 'unlisted')));""",
)

# ── L3: post-comment READ tightens from "not deleted" to "exactly active" ───
graft(
    'L3 post-comment read lifecycle',
    """          && (resource.data.get('authorUid', '') == request.auth.uid
              || (resource.data.get('status', '') != 'deleted'
                  && exists(/databases/$(database)/documents/feed_posts/$(postId))""",
    """          && (resource.data.get('authorUid', '') == request.auth.uid
              || (commentLifecycleActive(resource.data)
                  && exists(/databases/$(database)/documents/feed_posts/$(postId))""",
)

# ── L4: post-comment CREATE must declare an 'active' lifecycle explicitly ───
#        accountActive() is PRESERVED unchanged below it.
graft(
    'L4 post-comment create lifecycle',
    """        allow create: if signedIn()
          && request.resource.data.authorUid == request.auth.uid
          // ISSUE 005: medan denormalisasi PILIHAN mesti BENAR jika hadir""",
    """        allow create: if signedIn()
          && request.resource.data.authorUid == request.auth.uid
          // WAVE 3D: kitaran hayat DIKUATKUASA di rules. Klien (termasuk klien
          // lama/berniat jahat) TIDAK boleh mencipta komen yang terus
          // 'deleted', berstatus tidak dikenali, atau TANPA status.
          && request.resource.data.status == 'active'
          // ISSUE 005: medan denormalisasi PILIHAN mesti BENAR jika hadir""",
)

# ── L5: the COLLECTION-GROUP comment read gets the same tightening ──────────
graft(
    'L5 collection-group comment read lifecycle',
    """      allow get: if signedIn()
        && (resource.data.get('authorUid', '') == request.auth.uid
            || (resource.data.get('status', '') != 'deleted'
                && canReadCurrentParent(path)));""",
    """      allow get: if signedIn()
        && (resource.data.get('authorUid', '') == request.auth.uid
            || (commentLifecycleActive(resource.data)
                && canReadCurrentParent(path)));""",
)

# ── N1: notification mark-read compatibility — REPORTED SEPARATELY ──────────
# NOT lifecycle work. The live clause requires the RESULTING document to carry
# status == 'read'. The SHIPPED client writes only {isRead, readAt} with merge,
# so for the 702 production notifications stored with status 'unread' the
# result keeps status 'unread' and the write is DENIED — verified against the
# live ruleset with the Firebase Rules :test API. Mark-read is broken in
# production today and the client swallows the error in a debugPrint.
#
# This widens the clause to "if you touch status it must become 'read'",
# leaving the hasOnly() allowlist — and therefore the security boundary —
# unchanged. A forged status value is still rejected.
if INCLUDE_N1:
    graft(
        'N1 notification mark-read compatibility',
        """          && request.resource.data.isRead == true
          && request.resource.data.readAt != null
          && request.resource.data.status == 'read';""",
        """          && request.resource.data.isRead == true
          && request.resource.data.readAt != null
          && (
            !request.resource.data.diff(resource.data).affectedKeys()
                .hasAny(['status'])
            || request.resource.data.status == 'read'
          );""",
    )

out = src
for name, old, new in grafts:
    n = out.count(old)
    if n != 1:
        sys.exit('ABORT: graft %s matched %d times (expected exactly 1)' % (name, n))
    out = out.replace(old, new, 1)
    print('applied %s' % name)

# The G6 engagement rules must be inherited from the base, not redefined.
for token in ['match /restaurant_follows/{followId}',
              'match /restaurant_public/{canonicalPlaceId}',
              'match /menu_comments/{commentId}']:
    if out.count(token) != 1:
        sys.exit('ABORT: G6 rule missing or duplicated: %s' % token)

with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
    fh.write(out)

raw = out.encode('utf-8')
print()
print('N1 included = %s' % ('YES' if INCLUDE_N1 else 'NO'))
print('base  bytes %d  sha256 %s' % (len(src.encode('utf-8')), actual))
print('wrote %s' % OUT)
print('out   bytes %d  sha256 %s' % (len(raw), hashlib.sha256(raw).hexdigest()))
