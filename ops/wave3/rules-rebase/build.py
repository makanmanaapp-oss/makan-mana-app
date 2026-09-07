# WAVE 3 GATE 3F — CASE C rules rebase.
#
# Builds the Wave 3 ruleset by grafting ONLY the Wave 3 deltas onto the ACTUAL
# LIVE production ruleset. Every graft is an exact, single-occurrence string
# replacement; a graft that does not match exactly once aborts the build, so the
# artifact can never be produced from a drifted or mis-parsed base.
import hashlib
import sys

BASE = 'ops/wave3/rules-rebase/live-baseline.rules'
OUT = 'ops/wave3/rules-rebase/firestore.rules'
LIVE_SHA = '9a61b0476a6dd2e817f148e73c36abb3dfd373b8d59cc8c326570fe685712bb6'

src = open(BASE, encoding='utf-8', newline='').read()
actual = hashlib.sha256(src.encode('utf-8')).hexdigest()
if actual != LIVE_SHA:
    sys.exit('ABORT: live baseline sha256 mismatch: %s' % actual)

grafts = []


def graft(name, old, new):
    grafts.append((name, old, new))


# ── G1: Wave 3C/3D lifecycle helpers, inserted directly above canReadPostData.
graft(
    'G1 lifecycle helpers',
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
    // NOTA: ini BUKAN menu_comments — itu domain Wave 3C yang berasingan.
    // PRASYARAT DEPLOY: backfill status komen legasi MESTI selesai dahulu.
    function commentLifecycleActive(c) {
      return c.get('status', '') == 'active';
    }

    // SP9 + SP9.2B: kebolehbacaan siaran feed berdasarkan keterlihatan.""",
)

# ── G2: canReadPostData gains the lifecycle gate on every NON-OWNER branch.
graft(
    'G2 canReadPostData lifecycle gate',
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

# ── G3: post-comment READ tightens from "not deleted" to "exactly active".
graft(
    'G3 post-comment read lifecycle',
    """          && (resource.data.get('authorUid', '') == request.auth.uid
              || (resource.data.get('status', '') != 'deleted'
                  && exists(/databases/$(database)/documents/feed_posts/$(postId))""",
    """          && (resource.data.get('authorUid', '') == request.auth.uid
              || (commentLifecycleActive(resource.data)
                  && exists(/databases/$(database)/documents/feed_posts/$(postId))""",
)

# ── G4: post-comment CREATE must declare an 'active' lifecycle explicitly.
#        accountActive() (live-only) is PRESERVED unchanged below it.
graft(
    'G4 post-comment create lifecycle',
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

# ── G5: the COLLECTION-GROUP comment read gets the same tightening.
graft(
    'G5 collection-group comment read lifecycle',
    """      allow get: if signedIn()
        && (resource.data.get('authorUid', '') == request.auth.uid
            || (resource.data.get('status', '') != 'deleted'
                && canReadCurrentParent(path)));""",
    """      allow get: if signedIn()
        && (resource.data.get('authorUid', '') == request.auth.uid
            || (commentLifecycleActive(resource.data)
                && canReadCurrentParent(path)));""",
)

# ── G6: the Wave 3 restaurant engagement collections, added immediately before
#        the default-deny catch-all and AFTER the live admin-bridge stores.
graft(
    'G6 wave3 engagement collections',
    """    // Tutup semua yang lain secara lalai.
    match /{document=**} {
      allow read, write: if false;
    }""",
    """    // ── WAVE 3 RESTAURANT ENGAGEMENT ──────────────────────────────────────
    // Restaurant identity is ALWAYS canonicalPlaceId. This domain is entirely
    // separate from the user<->user follow graph (`follows` /
    // `public_profiles.followersCount`); nothing here touches it.

    // Restaurant FOLLOW. A user may read ONLY their own follow document (state
    // retrieval) — the follower list is NOT globally enumerable, so no client
    // can discover who follows a restaurant. Every write is server-mediated
    // (followRestaurant / unfollowRestaurant callables, Admin SDK); direct
    // client writes are denied outright.
    match /restaurant_follows/{followId} {
      allow read: if signedIn() && resource.data.followerUid == request.auth.uid;
      allow write: if false;
    }

    // Restaurant public aggregate: the server-authoritative follower COUNT plus
    // a display-name snapshot. The COUNT is readable by any signed-in user; it
    // is server-write only and is NOT coupled to public_profiles.
    match /restaurant_public/{canonicalPlaceId} {
      allow read: if signedIn();
      allow write: if false;
    }

    // MENU COMMENTS: first-class, SEPARATE from feed_posts comments. Signed-in
    // users read VISIBLE comments/replies only — removed/hidden are moderation
    // state and are never client-readable. All writes are server-mediated
    // (createMenuComment / replyToRestaurantMenuComment); direct client writes
    // and author spoofing are denied.
    match /menu_comments/{commentId} {
      allow read: if signedIn() && resource.data.status == 'visible';
      allow write: if false;
    }

    // Tutup semua yang lain secara lalai.
    match /{document=**} {
      allow read, write: if false;
    }""",
)

# ── G7: notification mark-read legacy compatibility (carried from the Wave 3
#        branch, NOT a live-only protection). The LIVE clause requires the
#        RESULTING document to carry status == 'read'; a legacy notification
#        stored WITHOUT a status field therefore cannot be marked read at all
#        (the comparison raises and denies). This widens it to "if you touch
#        status it must become 'read'", leaving the `hasOnly` allowlist — and
#        therefore the security boundary — completely unchanged. Proven by the
#        repository's own notificationRules tests: "legacy mobile may mark read
#        without changing status" AND "recipient cannot change notification
#        status to an arbitrary value".
graft(
    'G7 notification mark-read legacy compat',
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

open(OUT, 'w', encoding='utf-8', newline='\n').write(out)
print()
print('wrote  %s' % OUT)
print('bytes  %d' % len(out.encode('utf-8')))
print('sha256 %s' % hashlib.sha256(out.encode('utf-8')).hexdigest())
