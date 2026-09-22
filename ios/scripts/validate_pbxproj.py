#!/usr/bin/env python3
"""Pengesah struktur project.pbxproj.

MAKANMANA iOS WAVE 3B.

APA YANG IA BUKAN
-----------------
Ia BUKAN Xcode. Lulus di sini TIDAK bermakna Xcode menerima projek itu, dan
ia tidak boleh dilaporkan sebagai "Xcode PASS". Pengesahan sebenar ialah
MACOS REQUIRED.

APA YANG IA ADALAH
------------------
Semakan invarian yang boleh dipercayai pada mana-mana platform. Suntingan
pbxproj yang ditulis tangan gagal dengan cara yang membisu: rujukan tergantung,
kurungan tidak seimbang, atau senarai konfigurasi yang menyimpang antara
sasaran. Xcode kemudian menolak untuk membuka projek, atau lebih teruk,
membinanya dengan tetapan yang salah.

Jalankan:  python ios/scripts/validate_pbxproj.py [laluan]
Keluar 0 jika semua invarian berpegang, 1 jika tidak.
"""

import re
import sys

HEX24 = re.compile(r"\b([0-9A-F]{24})\b")
OBJECT_DEF = re.compile(r"^\t\t([0-9A-F]{24})(?: /\* .*? \*/)? = \{", re.M)


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def object_bodies(text):
    """Pulangkan {id: badan} untuk setiap objek peringkat-atas dalam `objects`."""
    bodies = {}
    for match in OBJECT_DEF.finditer(text):
        start = match.end() - 1
        depth = 0
        index = start
        while index < len(text):
            char = text[index]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    break
            index += 1
        bodies[match.group(1)] = text[start : index + 1]
    return bodies


def check(text):
    problems = []
    bodies = object_bodies(text)

    # 1. Kurungan seimbang di seluruh fail.
    for open_char, close_char, label in (("{", "}", "brace"), ("(", ")", "paren")):
        if text.count(open_char) != text.count(close_char):
            problems.append(
                f"{label} tidak seimbang: {text.count(open_char)} buka lwn "
                f"{text.count(close_char)} tutup"
            )

    # 2. Setiap objek mempunyai isa.
    for oid, body in bodies.items():
        if "isa = " not in body:
            problems.append(f"objek {oid} tiada isa")

    # 3. Tiada rujukan tergantung. Setiap id 24-hex yang disebut mesti wujud.
    defined = set(bodies)
    for oid, body in bodies.items():
        for ref in HEX24.findall(body):
            if ref not in defined:
                problems.append(f"rujukan tergantung {ref} di dalam {oid}")

    # 4. Senarai konfigurasi menunjuk kepada XCBuildConfiguration sebenar.
    isa_of = {
        oid: (re.search(r"isa = (\w+);", body).group(1) if "isa = " in body else "?")
        for oid, body in bodies.items()
    }
    config_names = {}
    for oid, body in bodies.items():
        if isa_of.get(oid) != "XCBuildConfiguration":
            continue
        name = re.search(r'name = "?([\w.-]+)"?;', body)
        if not name:
            problems.append(f"XCBuildConfiguration {oid} tiada nama")
        else:
            config_names[oid] = name.group(1)

    # 5. Setiap senarai konfigurasi mengisytiharkan SET NAMA yang sama.
    #    Xcode menghendaki setiap sasaran mempunyai setiap konfigurasi; jika
    #    tidak, binaan flavour jatuh balik secara senyap kepada yang lalai.
    lists = {}
    for oid, body in bodies.items():
        if isa_of.get(oid) != "XCConfigurationList":
            continue
        refs = re.findall(r"([0-9A-F]{24}) /\* [^*]+ \*/,", body)
        names = set()
        for ref in refs:
            if isa_of.get(ref) != "XCBuildConfiguration":
                problems.append(
                    f"senarai konfigurasi {oid} menunjuk {ref} yang bukan "
                    f"XCBuildConfiguration"
                )
            else:
                names.add(config_names.get(ref, "?"))
        lists[oid] = names
        default = re.search(r'defaultConfigurationName = "?([\w.-]+)"?;', body)
        if default and default.group(1) not in names:
            problems.append(
                f"senarai konfigurasi {oid} lalai kepada "
                f"'{default.group(1)}' yang tidak disenaraikan"
            )

    if lists:
        sets = list(lists.values())
        if any(names != sets[0] for names in sets):
            detail = "; ".join(f"{oid}={sorted(n)}" for oid, n in lists.items())
            problems.append(f"senarai konfigurasi tidak sepadan: {detail}")

    # 6. Setiap baseConfigurationReference ialah PBXFileReference sebenar.
    for oid, body in bodies.items():
        ref = re.search(r"baseConfigurationReference = ([0-9A-F]{24})", body)
        if ref and isa_of.get(ref.group(1)) != "PBXFileReference":
            problems.append(
                f"{oid} baseConfigurationReference {ref.group(1)} bukan "
                f"PBXFileReference"
            )

    # 7. Setiap fasa binaan yang dirujuk oleh sasaran wujud sebagai fasa.
    phase_isas = {
        "PBXSourcesBuildPhase",
        "PBXFrameworksBuildPhase",
        "PBXResourcesBuildPhase",
        "PBXShellScriptBuildPhase",
        "PBXCopyFilesBuildPhase",
        "PBXHeadersBuildPhase",
    }
    for oid, body in bodies.items():
        if isa_of.get(oid) != "PBXNativeTarget":
            continue
        phases = re.search(r"buildPhases = \((.*?)\);", body, re.S)
        if not phases:
            continue
        for ref in re.findall(r"([0-9A-F]{24}) /\*", phases.group(1)):
            if isa_of.get(ref) not in phase_isas:
                problems.append(
                    f"sasaran {oid} merujuk {ref} sebagai fasa binaan, "
                    f"tetapi isa-nya ialah {isa_of.get(ref)}"
                )

    return problems, lists, config_names


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "ios/Runner.xcodeproj/project.pbxproj"
    problems, lists, config_names = check(read(path))

    print(f"fail       : {path}")
    print(f"konfigurasi: {sorted(set(config_names.values()))}")
    print(f"senarai    : {len(lists)}")

    if problems:
        print(f"\nGAGAL — {len(problems)} masalah:")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print("\nLULUS — semua invarian struktur berpegang.")
    print("NOTA: ini BUKAN pengesahan Xcode. Itu kekal MACOS REQUIRED.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
