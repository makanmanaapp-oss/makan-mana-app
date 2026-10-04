# Makan Mana first iOS build readiness

**Decision: NOT READY for the first TestFlight build/upload.** The real production Firebase plist has now been applied and its derived configuration validated offline. Owner signing/provider configuration, macOS archive validation, and an isolated TestFlight Sandbox billing arrangement remain required. No build, upload, submission, or production deployment was triggered.

Prepared on **4 October 2026**, on Windows. See `MAKANMANA_IOS_REQUIRED_CONFIGURATION.md` for the exact credential names and owner setup.

## Real production Firebase plist follow-up — 4 October 2026

This update changes only the Firebase/Google configuration state and records the remaining native/signing/TestFlight gates. Earlier subscription, capability and privacy findings below remain applicable.

| Area | New state |
| --- | --- |
| Firebase plist | **APPLIED / OFFLINE CHECKS PASS.** The file was found at the checkout root as `GoogleService-Info.plist`; the stated `C:\Users\MAMAT\Downloads\GoogleService-Info.plist` path did not exist. The prepared script validated it before copying it to `ios/Firebase/prod/GoogleService-Info.plist`. The copy is byte-identical and the owner's original is unchanged. `BUNDLE_ID = com.makanmana.apps` and `PROJECT_ID = makanmana-c59f3`; the real Firebase iOS app ID has the correct iOS format and matches its sender and the existing production project's sender. Registration is owner-confirmed; this task did not independently query the Firebase console. |
| Google Sign-In | **SOURCE CONFIGURATION PASS.** The real `CLIENT_ID` and `REVERSED_CLIENT_ID` are internally consistent. Generated native client/callback settings exactly match the owner file. Source resolution for Debug-prod, Profile-prod and Release-prod yields that callback, consumed by `CFBundleURLTypes`. Actual Xcode resolution and successful iPhone authentication remain unverified. |
| Firebase runtime configuration | **GENERATED / OFFLINE RUNTIME CHECK PASS.** `ios/Firebase/prod/firebase-defines.json` and `ios/Flutter/Firebase-prod.generated.xcconfig` exist. Every generated field matches the owner input; no example/test/QA replacements were used. An additional offline Flutter test compiled with the actual generated definitions successfully constructs `DefaultFirebaseOptions.currentPlatform` for iOS and checks all supplied fields without printing values, initializing Firebase, or making network calls. Later native builds must pass `--dart-define-from-file=ios/Firebase/prod/firebase-defines.json`. |
| Remaining macOS/signing gates | **NOT RUN — REQUIRES MACOS.** CocoaPods resolution, Xcode/native compile, resolved build settings, existing distribution certificate/profile and production signed entitlements, IPA/archive validation, SDK privacy review, and installed-device startup/login remain outstanding. Source resolution is not an Xcode or signed-archive pass. |
| Remaining TestFlight blockers | **NOT READY.** Owner Codemagic integration/signing/secure plist input and unique build number remain unverified. The production-bundle isolated Sandbox billing path, backend credentials/live signed verification and separately authorized backend release, relevant Apple/Firebase authentication/APNs/App Check console settings, privacy review and device acceptance remain outstanding. Firebase iOS registration and local plist application are now complete; they do not clear those other gates. Upload stays disabled. |

The original plist, production copy, generated Dart definitions and generated xcconfig are all **Git-ignored and untracked**. Their contents and credential values were not printed or committed. App Store Connect app ID remains `6817102237`; it is separate from the Firebase iOS app ID.

Validation rerun after applying the real file:

- Full `flutter analyze --no-pub`: **PASS**, no issues.
- Full `flutter test --no-pub`: **1,897 passed, 0 failed**.
- Focused iOS configuration/runtime/App Check/billing suite: **81 passed, 0 failed**.
- Additional offline runtime test with real plist-derived definitions: **1 passed, 0 failed**.
- Firebase preparation script unit tests: **3 passed, 0 failed**.
- Real-input equality/identity/callback and Git-ignore checks: **PASS**.
- Android source and Android v18 artifact hashes: **unchanged** from this task's starting snapshot. Existing tracked source diff and Git path status are unchanged; the only source document edited in this follow-up is this report.
- `git diff --check`: **PASS**.

Evidence is kept locally in ignored `.buildlog/ios-real-firebase/`: `configuration-checks.json`, `flutter-analyze.log`, `flutter-tests.log`, `flutter-ios-focused.log`, and `flutter-real-runtime.log`. No native archive, deployment, push, merge, TestFlight upload or App Store submission was performed.

## Checkout and scope

| Item | Observed state |
| --- | --- |
| Checkout used | `C:\Users\MAMAT\Downloads\Makan Mana\makan_mana-ios-rc-20260921` |
| Current branch | `ios/candidate-rc-20260921` |
| Current SHA | `5c7d2fc44422e729c107f963974e02c0a4aad93b` |
| Initial worktree | Clean, inspected before edits |
| Final worktree | Source changes are uncommitted; no commit, push, merge, reset, stash, or clean performed |
| iOS project | Existing `ios/Runner`, `Runner.xcodeproj`, workspace, prod/qa schemes, and Podfile |
| Runtime used | Flutter 3.44.4 / Dart 3.12.2; backend validation with Node 22.23.2 |
| Flutter release version | Existing `0.1.9+17` retained; Codemagic requires a separate unique owner-supplied iOS build number |

The main checkout `C:\Users\MAMAT\Downloads\Makan Mana\makan_mana` was already dirty on `rescue/ui-baseline-2026-09-07`, SHA `0a952416ff1ef66d6836dac49339084a2883f5c5`. It was left untouched. Changes are confined to the existing iOS candidate checkout. Android v18 artifacts at `release_artifacts\makanmana-0.1.9-18-ceeee5c` were not modified. Final Git checks show no changes under `android/` or to `pubspec.yaml` / `pubspec.lock` in the candidate checkout.

## Reassessment of the previous plan

The previous `FEED_MAKAN_QA/MAKANMANA_IOS_IMPLEMENTATION_PLAN.md` and later iOS handoffs were compared with the actual checkout rather than treated as current facts.

- The Podfile, production/QA schemes, and all nine build configurations already existed. The deployment target was already **iOS 15.0**, consistent with the locked Firebase plugin requirements; historical 13.0/missing-Podfile findings were obsolete.
- Apple App Check was already correctly selected in this commit. Its Android/Apple provider bootstrap needed no edit.
- Apple verification and Notifications V2 source already existed, but their signed-payload checks assumed fields absent from Apple's real transaction/renewal schemas. Those paths now use Apple's official verifier and bind real transaction/renewal fields correctly.
- The StoreKit purchase callback still called the Google Play verifier, Firebase iOS options still threw unconditionally, Apple login support/entitlements were absent, and the plist/callback was unconfigured. These source gaps were addressed without fabricating owner configuration.
- The current user-provided production identity and display name supersede historical identity/name questions. The existing QA scaffold remains gated and is not a new approved Apple identifier.

## Configuration and feature status

| Area | Current result | Remaining gate |
| --- | --- | --- |
| Identity/name | Production configs use `com.makanmana.apps`; display name is `Makan Mana`; server app ID is pinned to `6817102237` | Confirm resolved archive metadata and signing on macOS |
| Deployment target | Podfile, Runner settings, and Flutter framework metadata use iOS 15.0 | Actual native dependency resolution and compile |
| CocoaPods | Existing Podfile maps all nine configurations; base xcconfigs now include their generated Pods settings | No Pods or Podfile.lock generated here; `pod install` is NOT RUN — REQUIRES MACOS |
| Firebase plist | Real owner file **applied** to `ios/Firebase/prod/GoogleService-Info.plist`; byte-identical to supplied input. Bundle, project, iOS app ID shape and production sender match; Google client/callback consistency passes. File is ignored and untracked | Firebase console registration is owner-confirmed; installed-app initialization remains a macOS/iPhone check |
| Google Sign-In | Real client and reversed callback generated from that same plist. Debug/Profile/Release production xcconfig source resolution and `CFBundleURLTypes` wiring pass; no fabricated or QA values introduced | Actual Xcode build settings, archive callback and iPhone login/callback test |
| Firebase runtime configuration | Ignored `ios/Firebase/prod/firebase-defines.json` and `ios/Flutter/Firebase-prod.generated.xcconfig` created; every generated value matches the supplied owner field | Native launch with `--dart-define-from-file=ios/Firebase/prod/firebase-defines.json`; live Firebase initialization is unverified |
| Sign in with Apple | iOS-only native Firebase provider/button with email/name scopes and localized label; Apple sign-in entitlement wired | Owner Firebase provider setup, matching existing Apple capability/profile, device login test |
| App Check | Existing debug Apple provider; release/profile App Attest with DeviceCheck fallback. Android debug/Play Integrity selection retained | Owner provider registration and physical-device verification; cloud enforcement unchanged |
| APNs/push | `remote-notification` background mode retained; Push/Background capability flags and `aps-environment` entitlement wired, development for debug and production for profile/release | Owner APNs/FCM configuration, signed profile inspection, real push delivery tests |
| StoreKit client | Existing StoreKit plugin/account-token flow retained; iOS now calls `verifyAppleSubscription` for purchases/restores and finishes only after server authorization; manage-subscription link opens Apple's page | Real product lookup, purchase, restore and completion on an iPhone |
| Products | Exact allowlist: `makanmana_plus_monthly` → `plus`, `makanmana_pro_monthly` → `pro` | Owner confirms existing product/subscription group readiness |
| Apple server verification | Official Apple library 3.1.0, strict identity/ownership/product checks, atomic persistence and replay/refund protection; offline tests pass | Production credentials/roots, separately authorized deployment, authentic Apple JWS/API/OCSP evidence |
| Codemagic | Manual macOS workflow prepared, Flutter pinned, validation before archive, existing automatic signing assets, upload disabled by default | Owner team integration/secure variables/signing assets; actual workflow has not run |
| Permissions | Camera, photos and location purpose strings present; existing ms/zh-Hans/ta strings now linked as localized resources | Device prompts and archive localization review |
| Privacy | App manifest linked into Resources; no tracking declared; app-local UserDefaults reason `CA92.1` declared | Actual data collection/privacy labels and aggregate SDK archive review remain incomplete |
| App icons | iOS assets generated from the existing Makan Mana artwork; stock Flutter icon replaced | Native asset compilation/archive inspection |
| Compile status | Flutter analyzer and backend TypeScript build pass; static PBX references/configs pass | Swift/Objective-C plugin compile, linking and Xcode archive remain unverified |

## Subscription security and behavior

The client provides an opaque StoreKit transaction lookup ID and an allowlisted product, never a plan, expiry, ownership assertion, or environment. The request field retains its existing name `originalTransactionId`; Apple's status endpoint also accepts a current transaction ID. The server derives the original transaction and entitlement from authenticated Apple responses and verified signed data.

Production verification uses the official `SignedDataVerifier` with trusted Apple roots and online certificate/revocation checks. Transaction payloads are checked for bundle, environment, subscription type, IDs, signed date, and authenticated ownership through the existing deterministic `appAccountToken` binding. Renewal payloads are bound by original transaction, product, and environment; they are not required to carry invented bundle/app-ID fields. The status response and outer notification data must match the configured app identity. Unknown products, malformed data, missing credentials, invalid signatures, conflicting owners, and wrong environments grant no entitlement.

Ownership binding, user entitlement and a deterministic verification event are committed atomically. Duplicate verify/restore calls do not create duplicate events. Notification receipt/state/user writes share one transaction and recheck current ownership and ordering. A delayed verify cannot undo a newer refund or revocation; concurrent duplicate refunds have one durable result. Revoked chains are conservatively blocked from regranting through verify; later live testing must include refund/re-purchase behavior.

Active, expired, grace, billing retry, revoked, and cancelled-but-active states are mapped from Apple data. Cancellation retains access only until its verified deadline. Grace requires a future verified grace deadline. Apple paid feature reads now enforce the stored verified expiry even if an expiry notification is delayed. Non-Apple plan handling (Google Play, coupons, legacy/admin plans) retains its prior results. These checks do not replace a deployed operational reconciliation process; no such production process or live notification delivery was established by this task.

**TestFlight billing blocker:** TestFlight transactions use Sandbox. [Apple testing documentation](https://developer.apple.com/documentation/StoreKit/testing-at-all-stages-of-development-with-xcode-and-the-sandbox). The production backend deliberately rejects Sandbox, while the existing QA identity uses `.qa` and has no approved real QA project. A TestFlight archive of `com.makanmana.apps` therefore has no approved isolated paid Sandbox path yet. Resolve this explicitly before end-to-end subscription testing; never weaken production identity checks or grant production paid plans from Sandbox receipts. Existing emulator tests use fake transport/signed-data fixtures in a demo project and do not solve that release gate.

## Validation actually executed

Final results below are from executed commands, not inferred readiness. Counts overlap between broad and focused suites; do not add every row into one total.

| Check | Final result | Evidence in ignored `.buildlog/ios-first-build/` |
| --- | --- | --- |
| `flutter pub get --offline --enforce-lockfile` | PASS; lockfile unchanged | `flutter-pub-get.log` |
| Full `flutter analyze --no-pub` | PASS; no issues; rerun with real plist present | `.buildlog/ios-real-firebase/flutter-analyze.log` (new follow-up location) |
| Full `flutter test --no-pub --reporter expanded` | PASS; **1,897 passed, 0 failed**; rerun with real plist present | `.buildlog/ios-real-firebase/flutter-tests.log` (new follow-up location) |
| Focused iOS configuration/runtime/App Check/billing tests, final rerun | PASS; **81 passed, 0 failed**; rerun with real plist present | `.buildlog/ios-real-firebase/flutter-ios-focused.log` (new follow-up location) |
| Backend `npm run build` | PASS | `backend-build-complete.log` |
| Existing backend `npm test` | PASS; **1,771 passed, 0 failed** at that checkpoint | `backend-tests.log` |
| All current-source backend domain tests, `npm run test:offline` | PASS; **1,797 passed, 0 failed** on final backend source | `backend-offline-complete.log` |
| Focused Apple Firestore emulator integration | PASS; **5 passed, 0 failed** | `apple-emulator-complete.log` |
| All current-source Firestore/Storage emulator integration tests | PASS; **128 passed, 0 failed**; includes Apple tests | `all-emulator-tests.log` |
| Existing emulator suite | PASS; **48 passed, 0 failed** | `backend-emulator-tests.log` |
| Firestore rules emulator suite | PASS; **220 passed, 0 failed** | `backend-rules-tests.log` |
| Firebase preparation Python tests | PASS; **3 passed, 0 failed**, rerun after final configuration edits | Command output; temporary synthetic fixtures only |
| `validate_pbxproj.py` | PASS; structural references, nine configs and three config lists | Command output; this is not Xcode validation |
| XML/plist/entitlements/privacy parsing | PASS | Local configuration check output |
| Codemagic YAML parsing and safe-default assertions | PASS; manual-only, upload `false`, no publishing block, nine scripts | Command output |
| Ignore rules and Android/pubspec diff checks | PASS | Git checks; no Android or Flutter lock/version changes |
| `git diff --check` | PASS | Final local Git check |

Initial validation found test-fixture compile errors, outdated display-name/localization expectations, a missing QA documentation literal, and stale previously compiled test files. These were corrected; the final domain runner selects current source tests rather than stale generated files. The initial refund replay regression was fixed and its integration test passed. No final executed suite listed above has failing tests.

There is no Flutter `integration_test` directory in this checkout. The full offline unit/widget suite and available current-source backend integration/rules suites were executed. The Apple tests include mapping, allowlist/prototype-key rejection, expiry/cancellation/grace, identity/environment/ownership rejection, renewal binding, invalid JWS rejection by the real library, atomic verify/restore, concurrent duplicate notifications, and refunds. Authentic Apple-signed payloads, live certificate-chain/OCSP validation, and live App Store communication were not exercised.

## Native checks not executed

Every check in this table is **NOT RUN — REQUIRES MACOS**. The static project pass is not a substitute.

| Remaining check | Required evidence |
| --- | --- |
| `pod install` | Successful resolution for all prod configs and generated Podfile.lock; preserve it for review |
| Xcode project/workspace acceptance | `xcodebuild -list` and prod build settings show correct bundle, minimum iOS, callback, plist phase and entitlements |
| Native build and linking | Successful production Flutter/Xcode compile with locked plugins |
| Distribution signing | Existing team/certificate/profile match `com.makanmana.apps`; signed APNs, Apple sign-in and App Attest entitlements match production |
| `flutter build ipa --release --flavor prod` | Signed archive with unique owner build number and plist-derived Dart definitions |
| Archive validation script | Run `ios/scripts/validate_production_archive.py` against IPA and signed Runner.app; verify real Firebase/callback/permissions/privacy/capabilities |
| Archive privacy inspection | Aggregate SDK required-reason/data declarations, App Store labels and actual behavior reviewed |
| App Store Connect validation/processing | Later owner-authorized upload/processing; no submission or public rollout implied |

Physical iPhone tests are also **NOT RUN — REQUIRES IOS DEVICE**: launch with the real config, Google callback, Apple sign-in/cancel/sign-out/account switching, permissions, push in foreground/background/terminated states, release App Attest/fallback behavior, product query, purchase/renewal/cancel/expiry/grace/refund, restore after reinstall, ownership conflict, and transaction completion/retry. Test paid flows only after the isolated Sandbox gate is resolved. Offline regression coverage does not prove Android device behavior or iOS native linking.

## Owner actions before READY

1. **Completed locally:** apply the real production Firebase plist and generate its ignored native/Dart settings. For a later Codemagic run, securely supply that same real file through `IOS_FIREBASE_PLIST_BASE64`; local application does not configure the CI environment.
2. Configure the existing Apple/Firebase authentication, App Check and APNs/FCM settings and matching existing profiles. Do not create new Apple identifiers or activate App Check enforcement as part of this handoff.
3. Configure the exact backend parameters and Codemagic secure integration/group listed in `MAKANMANA_IOS_REQUIRED_CONFIGURATION.md`. A later reviewed backend deployment remains a separate authorization; current production availability was not verified.
4. Resolve the production-bundle TestFlight Sandbox isolation design and validate real signed transactions, ownership, renewals, refunds and restore end to end.
5. Finish the privacy review and execute the macOS/archive/iPhone matrix above.
6. Only after the gates pass, the owner may explicitly enable a manual TestFlight upload. Keep upload disabled during preparation. No App Store submission or production rollout is prepared as an automatic action.

The prepared manual workflow can attempt an archive after owner configuration, but there is currently no signed native build evidence. **Final first-TestFlight decision remains NOT READY.**

## Primary references checked

- [Apple's official server library and signed-data verifier](https://github.com/apple/app-store-server-library-node/blob/main/jws_verification.ts)
- [Firebase Flutter federated authentication](https://firebase.google.com/docs/auth/flutter/federated-auth)
- [Firebase Flutter App Check](https://firebase.google.com/docs/app-check/flutter/default-providers)
- [Codemagic automatic signing methods](https://docs.codemagic.io/yaml-code-signing/alternative-code-signing-methods/)
- [Codemagic publishing and upload controls](https://docs.codemagic.io/yaml-publishing/app-store-connect/)
- [Codemagic CLI upload/review flags](https://github.com/codemagic-ci-cd/cli-tools/blob/master/docs/app-store-connect/publish.md)
- [Apple required-reason API declarations](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)

## Exact source files changed

Paths below are relative to the candidate checkout stated above. `M` means modified; `A` means new, currently untracked. This list includes the two handoff documents and generated iOS icon assets, and excludes ignored local logs/build outputs and credential inputs.

82 changed/new source paths:

```text
M  .gitignore
A  MAKANMANA_IOS_FIRST_BUILD_READINESS.md
A  MAKANMANA_IOS_REQUIRED_CONFIGURATION.md
A  codemagic.yaml
A  flutter_launcher_icons_ios.yaml
M  functions/package-lock.json
M  functions/package.json
A  functions/scripts/runOfflineTests.cjs
M  functions/src/callable/appStoreServerNotifications.ts
M  functions/src/callable/getCmsContent.ts
M  functions/src/callable/getSuggestions.ts
M  functions/src/callable/getWeeklyReport.ts
M  functions/src/callable/redeemCoupon.ts
M  functions/src/callable/refreshMyPlanStatus.ts
M  functions/src/callable/saveScanMeal.ts
M  functions/src/callable/scanCalories.ts
M  functions/src/callable/verifyAppleSubscription.ts
A  functions/src/domain/billing/__tests__/appleAccess.test.ts
M  functions/src/domain/billing/__tests__/appleAppIdentity.test.ts
A  functions/src/domain/billing/__tests__/appleReleaseVerification.test.ts
A  functions/src/domain/billing/__tests__/emulator/appleSubscription.test.ts
M  functions/src/domain/billing/appStoreSubscription.ts
A  functions/src/domain/billing/appleAccess.ts
M  functions/src/domain/billing/appleAppIdentity.ts
A  functions/src/domain/billing/applePurchaseVerification.ts
A  functions/src/domain/billing/appleSignedData.ts
M  functions/src/domain/billing/notificationProcessing.ts
M  functions/src/services/appleNotificationService.ts
M  functions/src/services/appleSubscriptionService.ts
M  functions/src/services/promotionReadService.ts
M  ios/Firebase/README.md
M  ios/Flutter/Debug-prod.xcconfig
M  ios/Flutter/Debug-qa.xcconfig
M  ios/Flutter/Debug.xcconfig
M  ios/Flutter/Profile-prod.xcconfig
M  ios/Flutter/Profile-qa.xcconfig
M  ios/Flutter/Release-prod.xcconfig
M  ios/Flutter/Release-qa.xcconfig
M  ios/Flutter/Release.xcconfig
M  ios/README.md
M  ios/Runner.xcodeproj/project.pbxproj
M  ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json
M  ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png
M  ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@1x.png
M  ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@2x.png
M  ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@3x.png
M  ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@1x.png
M  ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@2x.png
M  ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@3x.png
M  ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@1x.png
M  ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@2x.png
M  ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@3x.png
A  ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-50x50@1x.png
A  ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-50x50@2x.png
A  ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-57x57@1x.png
A  ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-57x57@2x.png
M  ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@2x.png
M  ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@3x.png
A  ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-72x72@1x.png
A  ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-72x72@2x.png
M  ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@1x.png
M  ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@2x.png
M  ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-83.5x83.5@2x.png
M  ios/Runner/Info.plist
A  ios/Runner/PrivacyInfo.xcprivacy
A  ios/Runner/Runner.entitlements
A  ios/scripts/prepare_production_firebase.py
M  ios/scripts/select_firebase_plist.sh
A  ios/scripts/tests/test_production_firebase.py
A  ios/scripts/validate_production_archive.py
M  lib/app/localization/app_localizations.dart
A  lib/core/security/ios_firebase_configuration.dart
A  lib/core/services/apple_auth_service.dart
A  lib/core/services/apple_purchase_request.dart
M  lib/core/services/google_auth_service.dart
M  lib/core/services/purchase_service.dart
M  lib/features/auth/login_screen.dart
M  lib/features/paywall/paywall_screen.dart
M  lib/firebase_options.dart
M  test/ios_configuration_test.dart
A  test/ios_release_runtime_test.dart
M  test/typography_qa_test.dart
```
