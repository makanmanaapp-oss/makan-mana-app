# Outlet recommendation policy: implementation and release evidence

Status: source implementation under review. No merge, backend deployment,
production data write, app binary or store release has been performed.

Base: `ios/candidate-rc-20260921`, commit
`43440a4a9d95e80c0aa00d4ad3565165c5dc68bd` (committed 6 October 2026).
This is a verified Git source base, not proof that the installed app or currently
deployed Functions use this exact commit. The repository default is a divergent
older source-custody checkpoint and was deliberately not used as the base.

## Resulting behavior

- Home preview, Spin and Next use one server delivery boundary for every account.
  Neither cohort flags, a new context/session nor `forceLegacy` bypass the policy.
- A primary delivery records a rolling 93,600,000 ms exclusion on user/outlet
  identity. Cross-context concurrent selection conflicts on the same transactional
  memory documents. Merely loading alternatives does not mark them shown.
- Reject starts at least another 26 hours, preserves longer existing suppression
  and permanent avoidance, and records an idempotent learning event. Expired
  rejected outlets are stably partitioned behind eligible never-rejected outlets.
- Provider/canonical aliases share memory, including pre-registration provider
  history. A new merchant registration cannot reset an outlet's history.
- Approved Supabase merchant data enters through the existing Control Center
  master-publication bridge. Fresh active immutable publications are merged before
  selection. Raw registrations, drafts and private owner/evidence data are never
  used as recommendation payloads. Withdrawn known identities cannot fall back to
  their provider copy. Source versions are checked again inside selection.
- Current server profile, allergies, diet, budget, meals, Food Memory and fit data
  are read for delivery, including stored-queue reuse. Available published meal
  prices influence budget fit; a cheap drink does not establish a cheap meal.
  Halal confidence is based on the published status, not ethnicity/name tokens.
- Empty/blocked pools return an honest empty state and refund reserved Spin quota.
  Provider failure is distinguished from an eligible pool exhausted by policy.
- The app persists unresolved rejects by account and synchronizes them before a
  new suggestion. A late acknowledgement cannot delete a newer pending reject.
  Real recommendations do not advance through local fallback lists.

## Verification

Recorded local verification before publishing the review branch:

| Check | Evidence/status |
| --- | --- |
| Production TypeScript build | Pass; rerun on final source before closing review |
| Full Functions domain regression | 1,796/1,796 pass at the recorded intermediate checkpoint; final rerun required after subsequent compatibility changes |
| New pure policy tests | 17/17 pass: rolling boundary, midnight, longer TTL, permanent avoid, canonical dedupe, twenty unique choices then exhaustion, expired-reject tier |
| Initial actual Firestore emulator suite | 12/12 pass, zero skipped, on project `demo-makanmana-qa` |
| Expanded emulator suite | Adds actual Home -> Reject -> Spin/refund and legacy-preview event ingestion; final result recorded in the PR/checks |
| Flutter local execution | Blocked by automatic approval review after SDK startup contacted the instance-metadata endpoint; not retried through another local execution route |
| Flutter CI | Fresh GitHub-hosted runner, `contents: read`, no cloud secrets/OIDC. Analyze and outbox/location/learning-order tests defined in `recommendation-26h.yml` |
| Device UI/E2E | Not performed; no connected Android/iOS device in this environment |
| Supabase integration | Existing production schema/publication lifecycle inspected read-only; no schema/data writes. Emulator tests use isolated publication fixtures, not real merchants |

The emulator suite exercises the actual exported callable handlers as well as
real Firestore transactions. It covers simultaneous requests, user separation,
26-hour equality, legacy suggestion history, alias history, changing profiles,
publication version races, withdrawal, private-field projection, idempotent
feedback, request replay, full-pool exhaustion and quota refund. It does not
constitute native-device or live provider end-to-end verification.

## Operational bounds and release gates

1. Deploy backend before an upgraded app: the new client refuses real suggestion
   responses without `outlet_26h_v1`. Old Home reason-bearing skips have an
   idempotent server bridge; pre-upgrade sessions end rather than recycling.
2. This implementation conservatively counts the primary when the server issues
   it, rather than waiting for a viewport acknowledgement. An issued primary may
   therefore consume a slot even when the response is never viewed. Actual
   viewport-confirmed impression timing remains a separate UX improvement.
3. More than 300 unique candidates / a 700 KB queue, 2,000 relevant legacy shown
   records, or an exhausted bounded registry/alias scan fails closed explicitly.
   There is no silent truncated-pool claim that every restaurant was exhausted.
4. Ranking uses the existing deterministic profile/Food Memory model. No new paid
   generative model or LLM provider is configured or claimed active.
5. Unknown price, nutrition, halal and allergen evidence must remain unknown.
   This change does not certify establishments or establish absence of allergens.
6. Before release, match app/backend provenance, verify the existing Supabase
   approval -> publication bridge in the approved environment, check all CI
   results and run native Home/Spin/Reject/Next/restart/network QA on both platforms.
7. Production authorization is still required. Code review and isolated test
   success are not a claim that the user-facing app has changed already.

## Reproduction

From `functions/` with Node 22 and the reviewed Firebase CLI installed:

```sh
npm ci
npm run build
npm test
npm run test:recommendation
npm run test:emulator:recommendation
```

The emulator command starts Firestore and its test child in the same isolated
environment. Never point the tests at a real Firebase project or production
Supabase endpoint. No credentials are necessary for emulator fixtures.
