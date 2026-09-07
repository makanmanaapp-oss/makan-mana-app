# WAVE 3 — shared STRUCTURAL differ for Firestore rulesets.
#
# Parses every `match` block and every `function` at every nesting depth out of
# two rulesets and compares them as structures, so a change buried inside a
# nested block cannot slip past a reviewer's eye.
#
# Firestore path wildcards (`{uid}`, `{document=**}`) are masked before brace
# tracking, because otherwise they are indistinguishable from block braces and
# the parser silently desynchronises.
#
# Usage:
#   python structdiff.py <base.rules> <artifact.rules> [expectations...]
#
# Expectations (each may be repeated; all are asserted):
#   --expect-removed=N          exactly N live match blocks removed
#   --expect-modified=N         exactly N existing match blocks modified
#   --expect-new=N              exactly N new match blocks
#   --expect-new-fn=N           exactly N new functions
#   --modified=<path suffix>    this block MUST be among the modified set
#   --new-fn=<name>             this function MUST be among the new set
#   --allow-fn-modified=<name>  this function MAY be modified (all others may not)
#   --require=<literal>         literal must be present in the artifact
#   --forbid=<literal>          literal must be absent from the artifact
#   --same-count=<literal>      literal must occur equally often in both
#   --count=<n>:<literal>       literal must occur EXACTLY n times in the artifact
#
# Exit code 1 means the expectations were not met.
import hashlib
import re
import sys

WILDCARD = re.compile(r'\{[A-Za-z_]\w*(?:=\*\*)?\}')
OPEN, CLOSE = '\x01', '\x02'


def load(path):
    src = open(path, encoding='utf-8', newline='').read()
    src = re.sub(r'/\*[\s\S]*?\*/', ' ', src)
    src = re.sub(r'//[^\n]*', '', src)
    return WILDCARD.sub(lambda m: OPEN + m.group(0)[1:-1] + CLOSE, src)


def unmask(t):
    return t.replace(OPEN, '{').replace(CLOSE, '}')


def norm(t):
    return re.sub(r'\s+', ' ', t).strip()


def parse(path):
    """-> (blocks, functions); a block's body excludes its nested match blocks."""
    src = load(path)
    blocks, functions = {}, {}
    stack, bodies = [], ['']
    i, n = 0, len(src)
    while i < n:
        ch = src[i]
        if ch == '{':
            head = src[:i]
            seg = head[max(head.rfind('{'), head.rfind('}')) + 1:]
            m = re.search(r'\bmatch\s+(\S+)\s*$', seg)
            f = re.search(r'\bfunction\s+(\w+)\s*\([^)]*\)\s*$', seg)
            if m:
                stack.append(('match', unmask(m.group(1))))
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
                chain = ''.join(nm for k, nm in stack if k == 'match') + name
                blocks[chain] = body
            elif kind == 'function':
                functions[name] = body
            i += 1
            continue
        bodies[-1] += ch
        i += 1
    if stack:
        sys.exit('ABORT: unbalanced braces in %s' % path)
    return blocks, functions


def main(argv):
    base_path, art_path = argv[0], argv[1]
    opts = argv[2:]

    def vals(flag):
        return [o.split('=', 1)[1] for o in opts if o.startswith(flag + '=')]

    def one(flag):
        v = vals(flag)
        return int(v[0]) if v else None

    bb, bf = parse(base_path)
    ab, af = parse(art_path)
    base_raw, art_raw = open(base_path, 'rb').read(), open(art_path, 'rb').read()
    base_txt = open(base_path, encoding='utf-8').read()
    art_txt = open(art_path, encoding='utf-8').read()

    removed = sorted(set(bb) - set(ab))
    new = sorted(set(ab) - set(bb))
    modified = sorted(k for k in set(bb) & set(ab) if bb[k] != ab[k])
    fn_removed = sorted(set(bf) - set(af))
    fn_new = sorted(set(af) - set(bf))
    fn_modified = sorted(k for k in set(bf) & set(af) if bf[k] != af[k])

    print('BASE %s  %d bytes  %d blocks  %d fns  sha %s'
          % (base_path.split('/')[-1], len(base_raw), len(bb), len(bf),
             hashlib.sha256(base_raw).hexdigest()[:16]))
    print('ART  %s  %d bytes  %d blocks  %d fns  sha %s'
          % (art_path.split('/')[-1], len(art_raw), len(ab), len(af),
             hashlib.sha256(art_raw).hexdigest()[:16]))
    print()
    print('REMOVED MATCH BLOCKS  = %d' % len(removed))
    for x in removed:
        print('    - %s' % x)
    print('MODIFIED MATCH BLOCKS = %d' % len(modified))
    for x in modified:
        print('    ~ %s' % x)
    print('NEW MATCH BLOCKS      = %d' % len(new))
    for x in new:
        print('    + %s' % x)
    print('FUNCTIONS removed=%d modified=%d new=%d' %
          (len(fn_removed), len(fn_modified), len(fn_new)))
    for x in fn_removed:
        print('    - %s' % x)
    for x in fn_modified:
        print('    ~ %s' % x)
    for x in fn_new:
        print('    + %s' % x)
    print()

    fail = []

    def expect(flag, actual, label):
        want = one(flag)
        if want is not None and actual != want:
            fail.append('%s: expected %d, got %d' % (label, want, actual))

    expect('--expect-removed', len(removed), 'removed match blocks')
    expect('--expect-modified', len(modified), 'modified match blocks')
    expect('--expect-new', len(new), 'new match blocks')
    expect('--expect-new-fn', len(fn_new), 'new functions')

    for suffix in vals('--modified'):
        if not any(k.endswith(suffix) for k in modified):
            fail.append('expected MODIFIED block not found: %s' % suffix)
    for name in vals('--new-fn'):
        if name not in fn_new:
            fail.append('expected NEW function not found: %s' % name)
    for lit in vals('--require'):
        if lit not in art_txt:
            fail.append('REQUIRED literal missing: %s' % lit)
    for lit in vals('--forbid'):
        if lit in art_txt:
            fail.append('FORBIDDEN literal present: %s' % lit)
    for lit in vals('--same-count'):
        b, a = base_txt.count(lit), art_txt.count(lit)
        print('SAME-COUNT %-32s base=%-4d artifact=%-4d %s'
              % (lit[:32], b, a, 'ok' if a == b else 'MISMATCH'))
        if a != b:
            fail.append('count changed for %r: %d -> %d' % (lit, b, a))

    for spec in vals('--count'):
        want, lit = spec.split(':', 1)
        got = art_txt.count(lit)
        print('COUNT      %-32s want=%-4s got=%-4d %s'
              % (lit[:32], want, got, 'ok' if got == int(want) else 'MISMATCH'))
        if got != int(want):
            fail.append('count for %r: want %s, got %d' % (lit, want, got))

    # Structural invariants that always apply.
    allowed_fn_mod = set(vals('--allow-fn-modified'))
    if fn_removed:
        fail.append('base functions were REMOVED: %s' % ', '.join(fn_removed))
    unexpected = [f for f in fn_modified if f not in allowed_fn_mod]
    if unexpected:
        fail.append('functions modified without --allow-fn-modified: %s'
                    % ', '.join(unexpected))
    for name in allowed_fn_mod:
        if name not in fn_modified:
            fail.append('--allow-fn-modified=%s but it was NOT modified' % name)
    tail = art_txt.rstrip().split('match /{document=**}')[-1]
    if 'allow read, write: if false;' not in tail or 'match ' in tail:
        fail.append('the default-deny catch-all is not the last rule')

    print()
    if fail:
        print('STRUCTDIFF = FAIL')
        for f in fail:
            print('  ! %s' % f)
        return 1
    print('STRUCTDIFF = PASS')
    return 0


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1:]))
