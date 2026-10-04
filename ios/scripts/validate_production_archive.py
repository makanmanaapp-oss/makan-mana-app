#!/usr/bin/env python3
"""Inspect an owner-built IPA and signed archive without printing credentials.

This is executed only by a later macOS build. It does not build or upload.
"""
import argparse
import plistlib
import subprocess
import zipfile
from pathlib import Path


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_ipa(ipa):
    with zipfile.ZipFile(ipa) as package:
        apps = [name for name in package.namelist()
                if name.startswith("Payload/") and name.endswith(".app/Info.plist")
                and name.count("/") == 2]
        require(len(apps) == 1, "Expected exactly one main app")
        prefix = apps[0].removesuffix("Info.plist")
        info = plistlib.loads(package.read(apps[0]))
        firebase = plistlib.loads(package.read(prefix + "GoogleService-Info.plist"))
        privacy = plistlib.loads(package.read(prefix + "PrivacyInfo.xcprivacy"))
        require(info.get("CFBundleIdentifier") == "com.makanmana.apps", "Wrong archive bundle")
        require(info.get("CFBundleDisplayName") == "Makan Mana", "Wrong archive display name")
        require(firebase.get("BUNDLE_ID") == "com.makanmana.apps" and
                firebase.get("PROJECT_ID") == "makanmana-c59f3", "Wrong archive Firebase identity")
        schemes = [scheme for item in info.get("CFBundleURLTypes", [])
                   for scheme in item.get("CFBundleURLSchemes", [])]
        require(firebase.get("REVERSED_CLIENT_ID") in schemes, "Missing real Google callback scheme")
        require("remote-notification" in info.get("UIBackgroundModes", []), "Missing background push mode")
        require(privacy.get("NSPrivacyTracking") is False, "Unexpected privacy tracking configuration")
        for key in ("NSLocationWhenInUseUsageDescription", "NSPhotoLibraryUsageDescription", "NSCameraUsageDescription"):
            require(bool(info.get(key)), "Missing permission purpose string")


def validate_signed_app(app):
    # Do not expose the full signing output or provisioning profile.
    output = subprocess.run(["codesign", "-d", "--entitlements", ":-", str(app)],
                            capture_output=True, check=True)
    entitlements = plistlib.loads(output.stdout)
    require(entitlements.get("aps-environment") == "production", "Production APNs entitlement missing")
    require(entitlements.get("com.apple.developer.applesignin") == ["Default"], "Apple sign-in entitlement missing")
    require(entitlements.get("com.apple.developer.devicecheck.appattest-environment") == "production",
            "Production App Attest entitlement missing")
    require(entitlements.get("application-identifier", "").endswith(".com.makanmana.apps"), "Wrong signing identity")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--ipa", required=True, type=Path)
    parser.add_argument("--app", required=True, type=Path)
    args = parser.parse_args()
    try:
        validate_ipa(args.ipa)
        validate_signed_app(args.app)
    except (OSError, ValueError, KeyError, zipfile.BadZipFile, subprocess.CalledProcessError):
        raise SystemExit("Production archive validation failed. Review the local metadata/signing checks.")
    print("Production archive metadata and signed capabilities validated.")
