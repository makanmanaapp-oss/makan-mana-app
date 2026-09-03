# Wave 2 - Restaurant Profile V2 Mobile/Backend Anchor

Status: SOURCE IMPLEMENTATION ONLY

Starting baseline: `f9564a43c4cf2fb2b69890cd3fae0b012679d47a`

The authoritative cross-system Wave 2 contract is:

- Control Center repository: `makanmanaapp-oss/makanmana-control-center`
- Branch: `feature/restaurant-profile-v2`
- Contract: `docs/RESTAURANT_PROFILE_V2_CONTRACT.md`
- Contract lock commit: `eb3f4ddad96af65b0ee339d186d42fcc21e7485c`

This file is only the app/backend implementation anchor. It does not duplicate or override the authoritative contract.

Mobile/backend guardrails:

1. Extend the existing canonical Restaurant Detail model, adapter and screen. Do not create a parallel restaurant identity.
2. Preserve stable place IDs, canonical alias resolution and legacy fallback.
3. Restaurant Profile V2 remains OFF by default until controlled activation.
4. Merchant profile edits must go through Firebase Auth -> Cloud Functions -> bearer-protected Control Center merchant bridge. No direct mobile Supabase writes.
5. Existing-place merchant edits require the existing Wave 1 ownership rules enforced server-side.
6. Merchant edits are proposals only. Mobile must not write Master Place Registry or Firebase publication collections directly.
7. Halal, dietary and allergen verification remain evidence/admin-controlled and cannot be self-certified by merchant profile edits.
8. Firebase publication remains separate from submission review and registry apply, and must preserve canonical eligibility/versioning rules.
9. No broad Firebase deploy, Firestore rules/indexes deploy, production rollout, or merge is authorized during source-only phases.

Implementation sequencing follows the authoritative contract phases 2A through 2G.
