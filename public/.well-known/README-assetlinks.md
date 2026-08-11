# App Links — assetlinks.json fingerprints (HOTFIX 4.6A)

`package_name`: `com.makanmana.apps`

`sha256_cert_fingerprints` currently listed:

1. `ED:9A:AF:48:79:A0:A2:02:D1:DF:FF:C8:D2:50:4D:02:F6:A8:FB:5E:7D:AF:C5:31:2F:97:F8:40:B7:34:F3:7E`
   — **debug/QA** keystore (`~/.android/debug.keystore`, alias `androiddebugkey`).
   Enables App Link verification for locally-installed debug/QA builds.

2. `B9:64:7B:AA:8F:6D:42:15:C5:8B:7A:95:53:A2:50:C2:87:9F:E1:A4:84:68:24:8C:38:34:5A:AF:A2:AD:57:80`
   — **upload** key (`android/upload-keystore.jks`, alias `upload`).

## REQUIRED before public release

Google Play **App Signing** re-signs the app with a *different* production
certificate. Android verifies App Links against the **app signing key**, NOT the
upload key. Before public release you MUST append the production SHA-256 from:

  Play Console → your app → Test and release → App integrity →
  App signing key certificate → SHA-256 certificate fingerprint

Add that value to `sha256_cert_fingerprints` and redeploy Hosting. Until then,
App Links verify only for debug/QA and direct upload-signed installs.
