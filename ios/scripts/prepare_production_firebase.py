#!/usr/bin/env python3
"""Validate the owner's real plist and generate ignored build inputs quietly.

Usage: python ios/scripts/prepare_production_firebase.py --plist /owner/file.plist
No credentials or plist values are printed. Never generates a Firebase plist.
"""
import argparse
import json
import plistlib
import re
import shutil
from pathlib import Path

PROJECT = "makanmana-c59f3"
BUNDLE = "com.makanmana.apps"


def validate(data):
    required = ("BUNDLE_ID", "PROJECT_ID", "API_KEY", "GOOGLE_APP_ID",
                "GCM_SENDER_ID", "CLIENT_ID", "REVERSED_CLIENT_ID")
    if any(not isinstance(data.get(k), str) or not data[k].strip() for k in required):
        raise ValueError("required Firebase iOS fields missing")
    if data["BUNDLE_ID"] != BUNDLE or data["PROJECT_ID"] != PROJECT:
        raise ValueError("production Firebase identity mismatch")
    if not re.fullmatch(r"1:[0-9]+:ios:[a-zA-Z0-9]+", data["GOOGLE_APP_ID"]):
        raise ValueError("invalid Firebase iOS app identifier")
    if data["GOOGLE_APP_ID"].split(":")[1] != data["GCM_SENDER_ID"]:
        raise ValueError("Firebase sender identifier mismatch")
    if not re.fullmatch(r"[a-zA-Z0-9-]+\.apps\.googleusercontent\.com", data["CLIENT_ID"]):
        raise ValueError("invalid Google iOS client identifier")
    if data["REVERSED_CLIENT_ID"] != ".".join(reversed(data["CLIENT_ID"].split("."))):
        raise ValueError("Google callback identifier mismatch")
    return {
        "IOS_FIREBASE_API_KEY": data["API_KEY"],
        "IOS_FIREBASE_APP_ID": data["GOOGLE_APP_ID"],
        "IOS_FIREBASE_SENDER_ID": data["GCM_SENDER_ID"],
        "IOS_FIREBASE_PROJECT_ID": data["PROJECT_ID"],
        "IOS_FIREBASE_BUNDLE_ID": data["BUNDLE_ID"],
        "IOS_FIREBASE_STORAGE_BUCKET": data.get("STORAGE_BUCKET", ""),
        "IOS_GOOGLE_CLIENT_ID": data["CLIENT_ID"],
    }


def prepare(source, root):
    with source.open("rb") as handle:
        data = plistlib.load(handle)
    defines = validate(data)  # Validate before any file writes.
    destination = root / "ios/Firebase/prod/GoogleService-Info.plist"
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.resolve() != destination.resolve():
        shutil.copyfile(source, destination)
    (destination.parent / "firebase-defines.json").write_text(
        json.dumps(defines, indent=2) + "\n", encoding="utf-8")
    (root / "ios/Flutter/Firebase-prod.generated.xcconfig").write_text(
        "// Generated from the validated owner plist; do not commit.\n"
        f"MM_GOOGLE_REVERSED_CLIENT_ID = {data['REVERSED_CLIENT_ID']}\n"
        f"MM_GOOGLE_CLIENT_ID = {data['CLIENT_ID']}\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--plist", required=True, type=Path)
    args = parser.parse_args()
    try:
        prepare(args.plist, Path(__file__).resolve().parents[2])
    except (OSError, ValueError, plistlib.InvalidFileException):
        raise SystemExit("Firebase preparation failed: missing or invalid owner production plist.")
    print("Production Firebase identity validated; ignored build inputs prepared.")
