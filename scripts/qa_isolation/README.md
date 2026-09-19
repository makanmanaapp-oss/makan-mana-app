# QA backend isolation

## The problem this solves

`com.makanmana.apps.qa` is a separate Android package, but it was **not** a
separate backend. It is a *registered Firebase Android app inside the production
project* — `android/app/src/qa/google-services.json` carried
`project_id: makanmana-c59f3` and the app id
`1:1097613804556:android:0a1014e9b272b547601a29` — so the QA flavour initialised
the **production** Firebase project by design, not by accident. A different
package name isolates nothing.

A QA session run that way writes real documents into the production `events`
collection. That is not hypothetical: the historical incident event
`events/vs79ZLiKjnPXMGFJs74W` is still in production, awaiting an owner decision.

The QA app registration still exists server-side. What changed here is that a QA
**build** no longer carries that configuration.

## The rule

The QA flavour runs **only** when it has a verified isolated backend. There is
deliberately no "carry on without it" branch:

| build | result |
| --- | --- |
| production flavour | unchanged — never consults any of this |
| QA debug, verified isolated services | starts |
| QA debug, no `MM_QA_BACKEND_HOST` | **BLOCKED** |
| QA debug, emulators unreachable or mis-set | **BLOCKED** |
| any release build | **BLOCKED** — a dart-define cannot switch it |

The blocked build shows why, and constructs no application service, repository
or provider.

## Four layers, so no single failure is silent

1. **Native config** — `android/app/src/qa/google-services.json` now describes a
   dead `demo-makanmana-qa` project instead of production, so the
   `google_app_id` / `project_id` / `google_api_key` resources baked into a QA
   APK cannot name production even if every other guard were removed. The
   previous content is in git history at commit `de200b6`.
2. **Native auto-init** — `android/app/src/qa/AndroidManifest.xml` removes
   `FirebaseInitProvider`, which otherwise builds the default `FirebaseApp` from
   `google-services.json` *before Dart runs*.
3. **Dart gate** — `lib/core/qa/qa_isolation_bootstrap.dart` decides, probes the
   emulators **from the phone**, initialises the demo project, and then
   **asserts the resulting app really is that project**. That assertion is what
   catches layers 1–2 having failed.
4. **Server side** — a mirror push from a locally executed function is accepted
   only when the process is genuinely the emulator *and* the target is loopback
   (`functions/src/controlCenter/mirrorEventPush.ts`).

## Runbook

```powershell
# 1. isolated backend (leave running)
scripts\qa_isolation\Start-QaIsolatedBackend.ps1

# 2. tunnel it to the phone, and prove it from the phone
scripts\qa_isolation\Set-QaAdbReverse.ps1

# 3. build the isolated APK
scripts\qa_isolation\Build-QaApk.ps1 -Clean

# 4. install ALONGSIDE production - never replace it
adb install -r build\app\outputs\flutter-apk\app-qa-debug.apk

# 5. launch and watch the gate decide
adb logcat -c; adb shell monkey -p com.makanmana.apps.qa -c android.intent.category.LAUNCHER 1
adb logcat -d | Select-String 'MM QA ISOLATION'
```

`MM QA ISOLATION READY project=demo-makanmana-qa host=127.0.0.1` means isolated.
`MM QA ISOLATION BLOCKED: ...` means it refused, and says what was missing.

## What is *not* covered

- **Storage signed uploads.** `SocialService.putBytesToSignedUrl` PUTs to a URL
  the server hands it. Under isolation that server is the emulator, which holds
  no production credentials, so it cannot mint a production URL — but the app
  does not itself verify the host it was given.
- **Nothing here contains a credential.** The QA `google-services.json`
  describes a project that does not exist: all-zero project number, a
  well-formed but meaningless API key, and the `demo-` prefix that makes it
  unreachable upstream.
