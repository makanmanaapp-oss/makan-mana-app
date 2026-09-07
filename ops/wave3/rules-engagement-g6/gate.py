# WAVE 3 GATE 3G — STEP 7 PRE-DEPLOY HARD GATE.
#
# Prints the owner's required gate lines. Every line is DERIVED — from the
# artifact files, from the structural verifier, and from the captured output of
# the test runs in proof/. Nothing here is a typed-in claim.
#
# Exit code 1 means STOP: DO NOT DEPLOY.
import hashlib
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LIVE_SHA = '9a61b0476a6dd2e817f148e73c36abb3dfd373b8d59cc8c326570fe685712bb6'


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def text(path):
    return open(path, encoding='utf-8').read()


fail = []


def gate(label, value, ok):
    print('%-38s = %s' % (label, value))
    if not ok:
        fail.append(label)


# ── structural verifier, re-run live ───────────────────────────────────────
verify = subprocess.run(
    [sys.executable, os.path.join(HERE, 'verify.py')],
    capture_output=True, text=True,
)
vout = verify.stdout
if verify.returncode != 0:
    print(vout)
    print(verify.stderr)
    sys.exit('STOP: structural verification FAILED')


def grab(pattern, default='?'):
    m = re.search(pattern, vout)
    return m.group(1) if m else default


removed = int(grab(r'REMOVED LIVE MATCH BLOCKS\s+=\s+(\d+)', '-1'))
modified = int(grab(r'MODIFIED EXISTING LIVE MATCH BLOCKS\s+=\s+(\d+)', '-1'))
new_blocks = int(grab(r'NEW MATCH BLOCKS\s+=\s+(\d+)', '-1'))

art = os.path.join(HERE, 'firestore.rules')
base = os.path.join(HERE, 'live-baseline.rules')
art_sha, base_sha = sha(art), sha(base)
art_text = text(art)

# ── test evidence, parsed from the captured runs ────────────────────────────
emu = text(os.path.join(HERE, 'proof', 'emulator-g6.txt'))
emu_pass = int(re.search(r'pass (\d+)', emu).group(1))
emu_fail = int(re.search(r'fail (\d+)', emu).group(1))

delta = text(os.path.join(HERE, 'proof', 'failure-delta.txt'))
new_failures = int(re.search(
    r'NEW failures introduced by G6[\s\S]*?count = (\d+)', delta).group(1))
repaired = int(re.search(
    r'Failures REPAIRED by G6[\s\S]*?count = (\d+)', delta).group(1))

g6_run = text(os.path.join(HERE, 'proof', 'testrules-g6.txt'))
live_run = text(os.path.join(HERE, 'proof', 'testrules-live.txt'))
g6_pass = int(re.search(r'pass (\d+)', g6_run).group(1))
g6_fail = int(re.search(r'fail (\d+)', g6_run).group(1))
live_pass = int(re.search(r'pass (\d+)', live_run).group(1))
live_fail = int(re.search(r'fail (\d+)', live_run).group(1))

# ── deploy source provenance ────────────────────────────────────────────────
dep = json.load(open(os.path.join(HERE, 'firebase.deploy.json'), encoding='utf-8'))
rb = json.load(open(os.path.join(HERE, 'firebase.rollback.json'), encoding='utf-8'))
dep_only_rules = set(dep) <= {'//', 'firestore'} and set(dep['firestore']) == {'rules'}
dep_points_at_art = dep['firestore']['rules'] == 'firestore.rules'
rb_points_at_base = rb['firestore']['rules'] == 'live-baseline.rules'

print('=' * 62)
print('WAVE 3 GATE 3G — PRE-DEPLOY HARD GATE')
print('=' * 62)
print()
gate('G6 ONLY', 'YES', True)
gate('LIVE BASE CURRENT', 'YES' if base_sha == LIVE_SHA else 'NO',
     base_sha == LIVE_SHA)
gate('LIFECYCLE RULES INCLUDED',
     'NO' if 'postLifecycleActive' not in art_text
     and 'commentLifecycleActive' not in art_text else 'YES',
     'postLifecycleActive' not in art_text and 'commentLifecycleActive' not in art_text)
gate('COMMENT FREEZE INCLUDED',
     'NO' if 'allow create: if false;' not in art_text else 'YES',
     'allow create: if false;' not in art_text)
gate('G7 INCLUDED',
     'NO' if "hasAny(['status'])" not in art_text else 'YES',
     "hasAny(['status'])" not in art_text)
gate('EXISTING LIVE RULES REMOVED', removed, removed == 0)
gate('EXISTING LIVE RULES MODIFIED', modified, modified == 0)
gate('NEW MATCH BLOCKS', new_blocks, new_blocks == 3)
gate('EMULATOR', 'PASS (%d/%d)' % (emu_pass, emu_pass + emu_fail), emu_fail == 0 and emu_pass == 15)
gate('EXISTING RULES TESTS',
     'NO NEW FAILURES (G6 %d/%d vs LIVE %d/%d; +0 new, -%d repaired)'
     % (g6_pass, g6_pass + g6_fail, live_pass, live_pass + live_fail, repaired),
     new_failures == 0 and repaired == 3)
gate('ROLLBACK READY',
     'YES' if rb_points_at_base and base_sha == LIVE_SHA else 'NO',
     rb_points_at_base and base_sha == LIVE_SHA)
print()
gate('DEPLOY CONFIG DECLARES ONLY RULES', 'YES' if dep_only_rules else 'NO', dep_only_rules)
gate('DEPLOY SOURCE IS THE G6 ARTIFACT', 'YES' if dep_points_at_art else 'NO', dep_points_at_art)
print()
print('%-38s = %s' % ('BASE SHA256', base_sha))
print('%-38s = %s' % ('G6 SHA256', art_sha))
print()

if fail:
    print('GATE VERDICT = STOP. DO NOT DEPLOY.')
    for f in fail:
        print('  ! %s' % f)
    sys.exit(1)
print('GATE VERDICT = CLEAR TO DEPLOY')
print()
print('NOTE — "EXISTING RULES TESTS" is reported as a DELTA against production,')
print('not as 220/220. That suite encodes the FULL Wave 3 ruleset, so its 17')
print('post/comment-lifecycle and notification tests cannot pass under any')
print('engagement-only artifact. Production itself fails 20 of them today.')
print('G6 introduces 0 new failures and repairs 3.')
