# WAVE 3 GATE 3G — STEP 4 structural proof for the engagement-only artifact.
#
# This does not eyeball a textual diff. It parses every `match` block and every
# `function` at every nesting depth out of both rulesets and compares them as
# structures, so a change buried inside a nested block cannot slip past.
#
# Firestore path wildcards (`{uid}`, `{document=**}`) are masked before brace
# tracking, because otherwise they are indistinguishable from block braces and
# the parser silently desynchronises.
#
# The gate is absolute:
#     REMOVED  live match blocks = 0
#     MODIFIED live match blocks = 0
#     NEW      match blocks      = exactly 3 (the approved engagement trio)
#     function set changed       = no
#
# Exit code 1 means DO NOT DEPLOY.
import hashlib
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
# Optional argv override so the SAME verifier can be pointed at a ruleset
# fetched back from production, proving what is actually live rather than what
# is merely on disk:  python verify.py <base.rules> <artifact.rules>
BASE = os.path.join(HERE, 'live-baseline.rules')
ART = os.path.join(HERE, 'firestore.rules')
if len(sys.argv) == 3:
    BASE, ART = sys.argv[1], sys.argv[2]

PREFIX = '/databases/{database}/documents'
EXPECTED_NEW = {
    PREFIX + '/restaurant_follows/{followId}',
    PREFIX + '/restaurant_public/{canonicalPlaceId}',
    PREFIX + '/menu_comments/{commentId}',
}

WILDCARD = re.compile(r'\{[A-Za-z_]\w*(?:=\*\*)?\}')
OPEN, CLOSE = '\x01', '\x02'


def load(path):
    src = open(path, encoding='utf-8', newline='').read()
    src = re.sub(r'/\*[\s\S]*?\*/', ' ', src)
    src = re.sub(r'//[^\n]*', '', src)
    # Mask wildcards so the only remaining braces are real block delimiters.
    return WILDCARD.sub(lambda m: OPEN + m.group(0)[1:-1] + CLOSE, src)


def unmask(text):
    return text.replace(OPEN, '{').replace(CLOSE, '}')


def norm(text):
    return re.sub(r'\s+', ' ', text).strip()


def parse(path):
    """-> (blocks, functions)

    blocks:    {full path chain -> that block's OWN body, nested matches excised}
    functions: {name -> normalised body}

    Excising nested matches means a change to a child block is attributed to the
    child, and a change to a parent's own allow rules is attributed to the parent.
    """
    src = load(path)
    blocks, functions = {}, {}
    stack = []      # (kind, name) for every open brace
    bodies = ['']   # accumulating own-body text per open frame
    i, n = 0, len(src)

    while i < n:
        ch = src[i]
        if ch == '{':
            head = src[:i]
            # What opened this brace? Look at the text since the previous
            # delimiter on this logical statement.
            seg = head[max(head.rfind('{'), head.rfind('}')) + 1:]
            m = re.search(r'\bmatch\s+(\S+)\s*$', seg)
            f = re.search(r'\bfunction\s+(\w+)\s*\([^)]*\)\s*$', seg)
            if m:
                stack.append(('match', unmask(m.group(1))))
                # Remove the `match <path>` text from the parent's own body.
                bodies[-1] = bodies[-1][:bodies[-1].rfind('match')]
            elif f:
                stack.append(('function', f.group(1)))
                bodies[-1] = bodies[-1][:bodies[-1].rfind('function')]
            else:
                stack.append(('other', seg.strip()))
            bodies.append('')
            i += 1
            continue
        if ch == '}':
            kind, name = stack.pop()
            body = norm(unmask(bodies.pop()))
            if kind == 'match':
                chain = ''.join(
                    nm for k, nm in stack if k == 'match'
                ) + name
                if chain in blocks:
                    sys.exit('ABORT: duplicate match path %s in %s' % (chain, path))
                blocks[chain] = (name, body)
            elif kind == 'function':
                functions[name] = body
            i += 1
            continue
        bodies[-1] += ch
        i += 1

    if stack:
        sys.exit('ABORT: unbalanced braces in %s (%d frames left open)' % (path, len(stack)))
    return blocks, functions


base_blocks, base_funcs = parse(BASE)
art_blocks, art_funcs = parse(ART)

base_raw = open(BASE, 'rb').read()
art_raw = open(ART, 'rb').read()
base_sha = hashlib.sha256(base_raw).hexdigest()
art_sha = hashlib.sha256(art_raw).hexdigest()

removed = sorted(set(base_blocks) - set(art_blocks))
added = sorted(set(art_blocks) - set(base_blocks))
modified = sorted(
    k for k in set(base_blocks) & set(art_blocks)
    if base_blocks[k][1] != art_blocks[k][1]
)
func_removed = sorted(set(base_funcs) - set(art_funcs))
func_added = sorted(set(art_funcs) - set(base_funcs))
func_modified = sorted(
    k for k in set(base_funcs) & set(art_funcs) if base_funcs[k] != art_funcs[k]
)

print('BASE  %s  %d bytes  %d match blocks  %d functions'
      % (base_sha[:16], len(base_raw), len(base_blocks), len(base_funcs)))
print('ART   %s  %d bytes  %d match blocks  %d functions'
      % (art_sha[:16], len(art_raw), len(art_blocks), len(art_funcs)))
print()
print('REMOVED LIVE MATCH BLOCKS            = %d%s'
      % (len(removed), ('  ' + ', '.join(removed)) if removed else ''))
print('MODIFIED EXISTING LIVE MATCH BLOCKS  = %d%s'
      % (len(modified), ('  ' + ', '.join(modified)) if modified else ''))
print('NEW MATCH BLOCKS                     = %d' % len(added))
for a in added:
    print('    + %s' % a)
print('REMOVED FUNCTIONS                    = %d%s'
      % (len(func_removed), ('  ' + ', '.join(func_removed)) if func_removed else ''))
print('MODIFIED FUNCTIONS                   = %d%s'
      % (len(func_modified), ('  ' + ', '.join(func_modified)) if func_modified else ''))
print('ADDED FUNCTIONS                      = %d%s'
      % (len(func_added), ('  ' + ', '.join(func_added)) if func_added else ''))
print()

failures = []
if removed:
    failures.append('live match blocks were REMOVED')
if modified:
    failures.append('existing live match blocks were MODIFIED')
if len(added) != 3:
    failures.append('expected exactly 3 new match blocks, got %d' % len(added))
if set(added) != EXPECTED_NEW:
    failures.append('the new blocks are not the three approved engagement collections')
if func_removed or func_modified or func_added:
    failures.append('the function set changed')

art_text = open(ART, encoding='utf-8').read()
base_text = open(BASE, encoding='utf-8').read()

REQUIRED = [
    'function accountActive(',
    "'accountStatus', 'accountStatusReason', 'accountStatusChangedAt',",
    "'accountStatusChangedBy', 'accountStatusSource',",
    'match /pollVotes/{voterUid}',
    'match /meal_reminder_schedules/',
    'match /notification_reconcile_state/',
    'match /notification_test_recipients/',
    'match /notification_broadcast_runs/',
    'match /admin_audit_events/',
    'match /admin_bridge_requests/',
    'match /admin_bridge_rate/',
]
for token in REQUIRED:
    if token not in art_text:
        failures.append('MISSING live protection: %s' % token)

if art_text.count('accountActive()') != base_text.count('accountActive()'):
    failures.append('accountActive() call sites changed')
print('accountActive() CALL SITES           base=%d  artifact=%d'
      % (base_text.count('accountActive()'), art_text.count('accountActive()')))

EXCLUDED = {
    'G1/G2 postLifecycleActive': 'postLifecycleActive',
    'G1/G3/G5 commentLifecycleActive': 'commentLifecycleActive',
    "G4 comment-create status gate": "request.resource.data.status == 'active'",
    # NB: do NOT use the bare affectedKeys() call here - live's own
    # protectedUserFieldsUnchanged() contains it. hasAny(['status']) is
    # introduced by G7 and by nothing else.
    'G7 notification widening': "hasAny(['status'])",
}
for label, token in EXCLUDED.items():
    if token in base_text:
        failures.append(
            'exclusion marker %r is present in the LIVE base, so it cannot '
            'prove anything about %s' % (token, label))
    if token in art_text:
        print('EXCLUDED %-34s PRESENT  <-- FAIL' % label)
        failures.append('EXCLUDED graft present: %s' % label)
    else:
        print('EXCLUDED %-34s absent (and absent from live: %s)'
              % (label, 'yes' if token not in base_text else 'NO'))

tail = art_text.rstrip().split('match /{document=**}')[-1]
catchall_last = 'allow read, write: if false;' in tail and 'match ' not in tail
if not catchall_last:
    failures.append('the default-deny catch-all is not the last rule')
print('DEFAULT-DENY CATCH-ALL IS LAST       = %s' % ('YES' if catchall_last else 'NO'))

# The three new blocks must carry exactly the approved semantics.
CONTRACT = {
    PREFIX + '/restaurant_follows/{followId}':
        "allow read: if signedIn() && resource.data.followerUid == request.auth.uid; allow write: if false;",
    PREFIX + '/restaurant_public/{canonicalPlaceId}':
        "allow read: if signedIn(); allow write: if false;",
    PREFIX + '/menu_comments/{commentId}':
        "allow read: if signedIn() && resource.data.status == 'visible'; allow write: if false;",
}
print()
for path, expected in CONTRACT.items():
    actual = art_blocks.get(path, (None, '<ABSENT>'))[1]
    ok = actual == expected
    print('CONTRACT %-38s %s' % (path, 'EXACT' if ok else 'MISMATCH'))
    if not ok:
        print('    expected: %s' % expected)
        print('    actual  : %s' % actual)
        failures.append('contract mismatch for %s' % path)

print()
if failures:
    print('STEP 4 VERDICT = HOLD - DO NOT DEPLOY')
    for f in failures:
        print('  ! %s' % f)
    sys.exit(1)
print('STEP 4 VERDICT = PASS')
print('G6 SHA256 = %s' % art_sha)
print('BASE SHA256 = %s' % base_sha)
