"""Rebuild the WAVE 4 + WAVE 5 SAFE-OFF rules artifact. Hash-guarded.

    python ops/wave4-wave5/rules-current-live-safeoff/build.py

BASE is `live-baseline.rules` — a byte-exact copy of the ruleset that was live
immediately before this cutover, fetched from the Firebase Rules API. It is NOT
the repository root `firestore.rules`, which on this branch is built on a stale
base: it would REMOVE seven live match blocks (admin audit/bridge/rate,
notification infrastructure), DROP the accountActive() suspension helper, and
ADD Wave 3 post/comment lifecycle rules that are still on hold.

Only three blocks are grafted, each verbatim from the root file, each of which
must be exactly `allow read, write: if false;`. The build fails rather than
producing a questionable artifact.
"""
import hashlib
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[2]

BASE_SHA = "c3a44df897a10ae7bd1711643aa6737441703e8c353b6fb990e43f5b9ad15925"
BASE_RULESET = "f77c0ada-9bf6-43f3-b419-7397510a8bb0"

TARGETS = [
    "/restaurant_promotions/{promotionId}",
    "/cms_content/{contentId}",
    "/cms_collections/{collectionId}",
]

BANNER = [
    "    // ---------------------------------------------------------------------",
    "    // WAVE 4 + WAVE 5 SAFE-OFF ADDITION.",
    "    //",
    "    // Grafted onto the CURRENT LIVE ruleset. Three new collections, each",
    "    // closed to every client for both read and write. Nothing else in this",
    "    // file was added, removed or modified.",
    "    // ---------------------------------------------------------------------",
    "",
]

PATHVAR = re.compile(r"\{[A-Za-z_][A-Za-z0-9_]*(?:=\*\*)?\}")


def brace_delta(line: str) -> int:
    return (lambda c: c.count("{") - c.count("}"))(PATHVAR.sub("", line.split("//")[0]))


def read(path: pathlib.Path) -> str:
    return path.read_text(encoding="utf-8", newline="").replace("\r\n", "\n")


def fail(msg: str):
    sys.exit(f"BUILD REFUSED: {msg}")


def main():
    base_raw = (HERE / "live-baseline.rules").read_bytes()
    got = hashlib.sha256(base_raw).hexdigest()
    if got != BASE_SHA:
        fail(f"live-baseline.rules is not ruleset {BASE_RULESET}\n"
             f"  expected {BASE_SHA}\n  got      {got}")
    base = base_raw.decode("utf-8").split("\n")

    root = read(REPO / "firestore.rules").split("\n")

    grafts = {}
    for i, line in enumerate(root):
        m = re.match(r"\s*match\s+(\S+)\s*\{", line)
        if not m or m.group(1) not in TARGETS:
            continue
        if m.group(1) in grafts:
            fail(f"{m.group(1)} occurs more than once in the root rules")
        depth, j = brace_delta(line), i
        while depth > 0:
            j += 1
            depth += brace_delta(root[j])
        start = i
        while start > 0 and root[start - 1].strip().startswith("//"):
            start -= 1
        body = root[start:j + 1]
        rule_lines = [ln.strip() for ln in root[i + 1:j] if ln.strip()]
        if rule_lines != ["allow read, write: if false;"]:
            fail(f"{m.group(1)} is not a bare server-only deny: {rule_lines}")
        grafts[m.group(1)] = body

    missing = [t for t in TARGETS if t not in grafts]
    if missing:
        fail(f"missing block(s) in the root rules: {missing}")

    for target in TARGETS:
        if any(re.match(rf"\s*match\s+{re.escape(target)}\s*\{{", ln) for ln in base):
            fail(f"{target} already exists in the live baseline")

    anchor = None
    for i, line in enumerate(base):
        if re.match(r"^    match /\{document=\*\*\} \{$", line):
            anchor = i          # LAST top-level catch-all wins
    if anchor is None:
        fail("top-level default-deny catch-all not found in the baseline")
    while anchor > 0 and base[anchor - 1].strip().startswith("//"):
        anchor -= 1

    block = list(BANNER)
    for target in TARGETS:
        block += grafts[target] + [""]

    out = base[:anchor] + block + base[anchor:]
    text = "\n".join(out)

    # The baseline must survive intact, as one contiguous insertion.
    prefix = 0
    while prefix < len(base) and base[prefix] == out[prefix]:
        prefix += 1
    suffix = 0
    while suffix < len(base) - prefix and base[-1 - suffix] == out[-1 - suffix]:
        suffix += 1
    if prefix + suffix != len(base):
        fail(f"baseline not preserved: {prefix} + {suffix} != {len(base)}")
    if len(out) != len(base) + len(block):
        fail("insertion is not contiguous")

    (HERE / "firestore.rules").write_text(text, encoding="utf-8", newline="")
    print(f"base    {BASE_RULESET}  {len(base_raw)} bytes  {BASE_SHA}")
    print(f"grafted {len(grafts)} blocks at baseline line {anchor + 1}, {len(block)} lines inserted")
    print(f"artifact {len(text.encode('utf-8'))} bytes  "
          f"{hashlib.sha256(text.encode('utf-8')).hexdigest()}")


if __name__ == "__main__":
    main()
