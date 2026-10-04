# Makan Mana iOS required configuration

Prepared 4 October 2026. Source-only handoff; no configuration below was created in a cloud console, uploaded, or deployed by this task. Supply credentials through owner-controlled secure settings, never source files or chat logs.

## Fixed identity

| Setting | Required value |
| --- | --- |
| Display name | `Makan Mana` |
| Production bundle | `com.makanmana.apps` |
| Existing App Store Connect app | `6817102237` |
| Production Firebase project | `makanmana-c59f3` |
| Plus subscription | `makanmana_plus_monthly` → `plus` |
| Pro subscription | `makanmana_pro_monthly` → `pro` |

Use these existing identifiers and products. Do not create another Apple identifier, invent a Service ID, or use the historical QA scaffold as a release identity.

## Owner Firebase file

The real downloaded `GoogleService-Info.plist` has **not been supplied**. Its only production destination is `ios/Firebase/prod/GoogleService-Info.plist`, ignored by Git.

After receiving the actual file, run from this checkout:

```sh
python3 ios/scripts/prepare_production_firebase.py --plist /secure/path/GoogleService-Info.plist
```

The script checks `BUNDLE_ID`, `PROJECT_ID`, the iOS Firebase app ID, sender ID, and Google client/callback consistency before writing. It derives these ignored outputs from the same input without printing their contents:

- `ios/Firebase/prod/firebase-defines.json`
- `ios/Flutter/Firebase-prod.generated.xcconfig`

The Dart definitions are `IOS_FIREBASE_API_KEY`, `IOS_FIREBASE_APP_ID`, `IOS_FIREBASE_SENDER_ID`, `IOS_FIREBASE_PROJECT_ID`, `IOS_FIREBASE_BUNDLE_ID`, `IOS_FIREBASE_STORAGE_BUCKET`, and `IOS_GOOGLE_CLIENT_ID`. The generated native setting is `MM_GOOGLE_REVERSED_CLIENT_ID`, taken from the actual `REVERSED_CLIENT_ID`. Do not fill these with examples or copy them from another Firebase app.

## Backend production parameters

These are the **exact secret parameter names used by the prepared source**. Creating them and deploying functions remain separate, later authorized actions.

| Name | Value/type and use |
| --- | --- |
| `APPLE_IAP_ISSUER_ID` | Owner's App Store Server API issuer ID. |
| `APPLE_IAP_KEY_ID` | Key ID for the matching owner-authorized Apple API key. |
| `APPLE_IAP_PRIVATE_KEY` | Matching `.p8` private key as PEM; used only by the backend to sign API requests. |
| `APPLE_ROOT_CERTIFICATES` | Trusted Apple root certificates obtained from Apple's PKI, PEM or DER base64, with separate certificates separated by a blank line. These are public trust anchors, stored through the existing secret parameter for configuration consistency. |
| `APPLE_APP_APPLE_ID` | Exactly `6817102237`. This is a public app identifier represented by an existing secret parameter, not a private key. |

`verifyAppleSubscription` needs all five. `appStoreServerNotifications` needs `APPLE_ROOT_CERTIFICATES` and `APPLE_APP_APPLE_ID`. Verification uses Apple's official library with online certificate revocation checks; later runtime networking must permit the selected App Store Server API host and Apple's certificate/OCSP validation.

The optional non-secret parameter `APPLE_QA_APP_APPLE_ID` defaults to an empty string. It is not needed for production and must not be fabricated. The existing QA bundle scaffold is `com.makanmana.apps.qa`; no approved real QA project is assigned. Supplying this parameter alone does not enable a safe TestFlight billing environment.

Production runtime identity must resolve to `makanmana-c59f3`, `com.makanmana.apps`, app `6817102237`, and Apple `Production`. Unknown/conflicting project identities fail closed. There is no automatic Production-to-Sandbox fallback.

## Codemagic owner settings

Configure the existing App Store Connect team integration with alias **`makanmana-ios-owner`**, and an encrypted environment group named **`makanmana_ios_production`**, or deliberately update those aliases to match existing owner settings before a manual run.

| Setting | Owner action |
| --- | --- |
| `IOS_FIREBASE_PLIST_BASE64` | Encrypted group variable containing base64 of the actual downloaded production plist. Base64 is encoding, not encryption; mark the variable secure. |
| `IOS_BUILD_NUMBER` | Unique numeric build number for app `6817102237`. This does not change Android's `pubspec` version or release artifacts. |
| `ENABLE_TESTFLIGHT_UPLOAD` | Workflow default is the string `false`. Set exactly `true` only when the owner explicitly authorizes upload after the readiness gates pass. |
| App Store Connect integration | Owner's issuer ID, key ID, and `.p8` stored in Codemagic team integration, with access sufficient to fetch signing assets and upload this existing app. No credentials belong in YAML. |
| Signing assets | Existing matching Apple Distribution certificate and App Store provisioning profile for `com.makanmana.apps`, including Apple sign-in, Push, and App Attest capabilities. The workflow fetches existing assets without `--create`. |
| `CERTIFICATE_PRIVATE_KEY` | Secure private key matching the distribution certificate if required by the owner's Codemagic signing setup. This is a signing certificate key, separate from the App Store Connect API `.p8`. |

The YAML has no automatic trigger or publishing block. With upload disabled, it retains the signed IPA as an artifact. The optional CLI upload has no beta-review, App Store-review, release, or tester-group flags. This task did not run the workflow or upload anything.

## Owner console actions and release gates

1. **Firebase:** download the real iOS app plist for the existing production bundle; verify Google authentication is enabled and its iOS client matches the file. Enable/configure the Apple authentication provider for the existing app and Apple team. Native Firebase Apple sign-in does not require an invented web Service ID. If Apple's provider settings require owner key/team details, configure them securely in the console.
2. **Apple Developer:** verify the existing identifier's Apple sign-in capability (already reported present), Push Notifications, and App Attest. Ensure the existing distribution profile actually carries all three. Do not create new identifiers.
3. **APNs / FCM:** owner must configure the appropriate existing APNs authentication key or certificates in Firebase Cloud Messaging, using the correct team ID/key ID and secure key handling. This task neither created nor uploaded APNs keys and did not access FCM settings. Those values are console inputs, not source or Dart definitions.
4. **App Check:** register/configure the production iOS app for App Attest and its DeviceCheck fallback; supply owner provider settings as required. Register debug tokens only for debug testing. Keep enforcement unchanged; activating enforcement is not part of this handoff.
5. **Subscriptions:** verify the two existing products, subscription group, pricing/localization, purchase agreements/tax/banking, and Sandbox tester access in App Store Connect. Later, configure Notifications V2 against the reviewed deployed endpoint for the matching environment; there is no fabricated endpoint URL in this handoff.
6. **TestFlight Sandbox billing:** settle and implement a reviewed isolated Sandbox arrangement for the existing production app identity before paid end-to-end TestFlight testing. TestFlight purchases are Sandbox, while this backend deliberately accepts Production only in production. [Apple testing documentation](https://developer.apple.com/documentation/StoreKit/testing-at-all-stages-of-development-with-xcode-and-the-sandbox). The historical `.qa` branch is not a solution for a TestFlight build of `com.makanmana.apps`. Never let Sandbox purchases grant production paid access or bypass signed verification to clear this gate.
7. **Privacy:** review actual account, location, user content/photo, purchase, analytics and diagnostic collection against the app's behavior and SDK defaults. Complete App Store privacy labels and applicable collected-data manifest declarations, and inspect the archive's aggregate SDK privacy report. The added app manifest covers app-local UserDefaults reason `CA92.1`; it is not a completed privacy audit.
8. **macOS and device:** execute the archive/signing checks and iPhone test matrix in `MAKANMANA_IOS_FIRST_BUILD_READINESS.md`. A later backend release requires separate review and authorization; current deployed functions/secrets/notification delivery have not been verified.

**Current decision: NOT READY for the first TestFlight build/upload.** Source and a manual archive workflow are prepared; required credentials, native build evidence, isolated billing setup, and owner console gates remain outstanding.

## Primary references checked

- [Apple App Store Server Library for Node](https://github.com/apple/app-store-server-library-node)
- [Firebase Flutter federated authentication](https://firebase.google.com/docs/auth/flutter/federated-auth)
- [Firebase Flutter App Check providers](https://firebase.google.com/docs/app-check/flutter/default-providers)
- [Codemagic signing through the CLI](https://docs.codemagic.io/yaml-code-signing/alternative-code-signing-methods/)
- [Codemagic App Store Connect publishing](https://docs.codemagic.io/yaml-publishing/app-store-connect/)
- [Codemagic publish command flags](https://github.com/codemagic-ci-cd/cli-tools/blob/master/docs/app-store-connect/publish.md)
