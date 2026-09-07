# WAVE 3 GATE 3G — ENGAGEMENT-ONLY (G6) Firestore rules artifact.
#
# Owner-approved scope: the three Wave 3 restaurant engagement collections and
# NOTHING else. This build applies exactly ONE graft to the ACTUAL live
# production ruleset — the three new match blocks, inserted immediately before
# the default-deny catch-all.
#
# DELIBERATELY EXCLUDED (approved for a later, separate gate):
#   G1  postLifecycleActive / commentLifecycleActive helpers
#   G2  canReadPostData lifecycle tightening
#   G3  post-comment read lifecycle tightening
#   G4  post-comment create status requirement
#   G5  collection-group comment lifecycle tightening
#   G7  notification mark-read compatibility widening
#
# No lifecycle, post, comment, notification, admin, account or poll rule is
# touched. The build aborts unless the base still hashes to the ruleset that is
# actually deployed, and unless the graft matches exactly once.
import hashlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(HERE, 'live-baseline.rules')
OUT = os.path.join(HERE, 'firestore.rules')
LIVE_SHA = '9a61b0476a6dd2e817f148e73c36abb3dfd373b8d59cc8c326570fe685712bb6'

src = open(BASE, encoding='utf-8', newline='').read()
actual = hashlib.sha256(src.encode('utf-8')).hexdigest()
if actual != LIVE_SHA:
    sys.exit(
        'ABORT: base is not the approved live ruleset.\n'
        '  expected %s\n  actual   %s\n'
        'Re-fetch production and re-verify before building.' % (LIVE_SHA, actual)
    )

# The anchor is the default-deny catch-all, which must remain the LAST rule in
# the file. The new blocks are inserted directly above it.
OLD = """    // Tutup semua yang lain secara lalai.
    match /{document=**} {
      allow read, write: if false;
    }"""

NEW = """    // ── WAVE 3 RESTAURANT ENGAGEMENT (Gate 3G, engagement-only) ───────────
    // Restaurant identity is ALWAYS canonicalPlaceId. This domain is entirely
    // separate from the user<->user follow graph (`follows` /
    // `public_profiles.followersCount`); nothing here touches it.
    //
    // Every write in this domain is server-mediated through an existing
    // callable running on the Admin SDK, so all three blocks deny client
    // writes outright. These rules add READ access only.

    // Restaurant FOLLOW. A user may read ONLY their own follow document, which
    // is what the client needs to render its own follow state. The follower
    // list is NOT enumerable: a list query is admissible only when it is
    // constrained to `followerUid == request.auth.uid`, so no client can
    // discover who else follows a restaurant. Writes go through
    // followRestaurant / unfollowRestaurant.
    match /restaurant_follows/{followId} {
      allow read: if signedIn() && resource.data.followerUid == request.auth.uid;
      allow write: if false;
    }

    // Restaurant public aggregate: the server-authoritative follower COUNT plus
    // a display-name snapshot. The COUNT is readable by any signed-in user; it
    // is server-write only and is NOT coupled to public_profiles. The follower
    // UID list is never stored here.
    match /restaurant_public/{canonicalPlaceId} {
      allow read: if signedIn();
      allow write: if false;
    }

    // MENU COMMENTS: first-class, SEPARATE from feed_posts comments. Signed-in
    // users read VISIBLE comments/replies only — 'hidden' and 'removed' are
    // moderation states and are never client-readable, and a document with no
    // status at all fails closed. Writes go through createMenuComment /
    // replyToRestaurantMenuComment; author spoofing is impossible from a
    // client because clients cannot write here at all.
    match /menu_comments/{commentId} {
      allow read: if signedIn() && resource.data.status == 'visible';
      allow write: if false;
    }

    // Tutup semua yang lain secara lalai.
    match /{document=**} {
      allow read, write: if false;
    }"""

n = src.count(OLD)
if n != 1:
    sys.exit('ABORT: G6 anchor matched %d times (expected exactly 1)' % n)

out = src.replace(OLD, NEW, 1)

# Belt and braces: the artifact must not contain any excluded graft.
FORBIDDEN = [
    'postLifecycleActive',
    'commentLifecycleActive',
    "request.resource.data.status == 'active'",
]
for token in FORBIDDEN:
    if token in out:
        sys.exit('ABORT: excluded construct leaked into the artifact: %s' % token)

with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
    fh.write(out)

raw = out.encode('utf-8')
print('applied G6 (engagement collections only)')
print('base   bytes %d  sha256 %s' % (len(src.encode('utf-8')), actual))
print('wrote  %s' % OUT)
print('out    bytes %d  sha256 %s' % (len(raw), hashlib.sha256(raw).hexdigest()))
