# Firebase iOS production configuration

The current release identity is `com.makanmana.apps` in `makanmana-c59f3`.
App Store Connect app ID: `6817102237`. Existing QA scaffolding uses
`com.makanmana.apps.qa` and remains gated; it is not an approved release identity.

The real downloaded owner file belongs only at:
`ios/Firebase/prod/GoogleService-Info.plist`.
It is ignored by Git. Do not fabricate it or use the production file for QA.

Run from the project root after the owner supplies it:

```powershell
python ios/scripts/prepare_production_firebase.py --plist /path/to/real/GoogleService-Info.plist
```

This verifies bundle/project/client identities before copying, then quietly derives
ignored `ios/Firebase/prod/firebase-defines.json` and
`ios/Flutter/Firebase-prod.generated.xcconfig` from that exact file. The latter
sets the real Google Sign-In callback for all three production configurations.

A later macOS build must include:

```sh
flutter build ipa --release --flavor prod \
  --dart-define-from-file=ios/Firebase/prod/firebase-defines.json
```

The native build phase separately validates project, bundle, callback and Dart
flavor before bundling the plist. Missing configuration stops the build/startup.
Android Firebase options and dependencies are unchanged.

Use the existing Apple identifiers and existing subscription products. Do not
create additional identifiers or infer a QA identity from its name. The current
QA project allowlist is intentionally unassigned. TestFlight billing uses Sandbox;
the production backend rejects it, so isolated Sandbox billing is still a gate.

Owner console actions and required configuration are listed in
`MAKANMANA_IOS_FIRST_BUILD_READINESS.md` and
`MAKANMANA_IOS_REQUIRED_CONFIGURATION.md` at the project root. These supersede
older setup notes that requested new Apple IDs or manual callback copying.
