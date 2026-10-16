# Native Merchant approved menus, source only

The existing Profile V2 reader can overlay an explicitly approved native
Merchant menu from Supabase onto an already published canonical profile.
This does not migrate Auth, Notifications, Feed, follows or other user data.

Configuration defaults off:
- MERCHANT_NATIVE_MENU_ENABLED=true only in a reviewed isolated environment.
- MERCHANT_NATIVE_SUPABASE_URL points to that same environment.
- MERCHANT_NATIVE_PUBLISHABLE_KEY is its publishable key, never a service key.

Every request passes the existing egress guard. Local demo/emulator QA can
contact only loopback. No production endpoint or credentials are required by
the companion Merchant integration suite.

No native publication (404) preserves the existing curated menu. An approved
empty/withdrawn menu clears it. When native reads are enabled, an outage or
invalid response produces an empty menu rather than reviving stale prices.
Operational edits do not affect public menus until an admin approves a new
immutable snapshot. Suspension/revocation withdraws it at the read boundary.

This branch is based on ios/candidate-rc-20260921, not an assertion about the
binary installed on devices or the currently deployed Functions version.
No Flutter layout or release binary changes are included. Companion local E2E
runs the actual reader against Firestore emulator and Supabase Auth/Storage/DB.
