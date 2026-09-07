# WAVE 4 + WAVE 5 — COMBINED PRODUCTION CUTOVER ORDER

> **NOTHING IN THIS DOCUMENT HAS BEEN EXECUTED.** It is the prepared plan.
> Prepared 2026-09-08. No Firebase deploy, no rules deploy, no Supabase apply,
> no Vercel deploy, no Play upload, no merge to main has occurred.

Wave 4 (commercial promotions) and Wave 5 (CMS, discovery collections, media)
ship as ONE cutover because they share the same three planes: the audited
Control Center command path, the Firebase receiver, and the Firebase to
Supabase mirror. Deploying one and not the other would leave a console that can
enqueue commands nothing receives.

---

## 1. What is being cut over

| Repo | Branch | Head | Pushed | Merged to main |
|---|---|---|---|---|
| makan-mana-app | `feature/wave5-cms-discovery` | `11163e0` | yes | **NO — owner decision** |
| makanmana-control-center | `feature/wave5-cms-discovery` | `2c0325a` | yes | **NO — owner decision** |

| Plane | Artefact | Count |
|---|---|---|
| Firestore rules | 3 new server-write-only blocks | `restaurant_promotions`, `cms_content`, `cms_collections` |
| Firestore indexes | **none** | `firestore.indexes.json` is byte-unchanged since `d720180` |
| Cloud Functions | 14 new exports | listed in section 5 |
| Firebase secrets | 2 new, 1 reused | section 4 |
| Supabase migrations | 3 unapplied | `0039`, `0040`, `0041` |
| Control Center env | 5 variables | step 12 |
| Mobile | 1 production AAB | step 15 |

---

## 2. Rollback bases — CAPTURE BEFORE STEP 3

None of these can be reconstructed after the fact. Record them first.

| # | Capture | How | Why |
|---|---|---|---|
| B1 | Live Firestore ruleset id + SHA256 of its source | `firebase firestore:rules:releases:list --limit 1` | the only exact rules rollback target |
| B2 | Full list of deployed functions with versions | `firebase functions:list` | proves which 14 are new, so a rollback deletes only those |
| B3 | Current Control Center production deployment id | Vercel dashboard, Production tab | instant rollback target |
| B4 | Supabase migration head | `supabase migration list` — expect `0038` | proves 0039/0040/0041 are the only new ones |
| B5 | Installed production app version | expect `0.1.8 (13)` | the version to stay on if the AAB is held |

---

## 3. Order of operations — 16 steps

The order is chosen so that **no customer sees anything different until step 16**,
and every step before it is individually reversible.

### Phase A — data plane first (nothing is reachable yet)

**Step 1 — Freeze and capture.**
Capture B1 to B5. Announce a change window. No other deploy in flight.
*Rollback:* nothing has changed.

**Step 2 — Code review and merge decision.**
Open a PR per repo from `feature/wave5-cms-discovery`. Merge to main only after
review. The cutover may proceed from the feature branch if the owner prefers to
merge after production proof; the deploy artefacts are identical either way.
*Rollback:* close the PRs.

**Step 3 — Apply Supabase migration `0039` (promotions mirror).**
Verify: table `restaurant_promotions_mirror` exists, RLS **forced**, RPC
`control_center_apply_promotion_mirror_batch` present, row count **0**.
*Rollback:* drop the objects 0039 created. The table holds no data yet, so the
drop is lossless, and nothing reads it until step 13.

**Step 4 — Apply migration `0040` (CMS content mirror).**
Verify `cms_content_mirror`, RLS forced, `control_center_apply_cms_mirror_batch`,
row count 0.
*Rollback:* as step 3, for 0040 objects.

**Step 5 — Apply migration `0041` (discovery collections mirror).**
Verify `cms_collections_mirror`, RLS forced,
`control_center_apply_cms_collection_mirror_batch`, row count 0.
Confirm the table stores a restaurant **count** and no membership list.
*Rollback:* as step 3, for 0041 objects.

> Migrations are applied in file order and never edited after review. If 0039
> fails, stop — do not skip ahead to 0040.

### Phase B — Firebase, still with nothing to serve

**Step 6 — Create the two new secrets.**
Generate high-entropy values and set them **without printing them**:
`PROMOTION_ADMIN_BRIDGE_SECRET`, `CMS_ADMIN_BRIDGE_SECRET`.
`CONTROL_CENTER_SYNC_SECRET` already exists from Wave 3 and is **reused
unchanged** — do not rotate it during this cutover, that would break the live
Wave 3 mirror.
*Rollback:* destroy the two new secret versions. Nothing consumes them yet.

**Step 7 — Deploy Firestore rules.**
`firebase deploy --only firestore:rules`.
The change adds three blocks that are `allow read, write: if false` — strictly
MORE restrictive than today, where those paths fall through to the default-deny
catch-all. No existing client path changes.
**No index deploy.** `firestore.indexes.json` is unchanged; do not run
`--only firestore:indexes`.
*Rollback:* redeploy ruleset **B1**.

**Step 8 — Deploy the 4 merchant promotion callables.**
`listMerchantPromotions`, `createPromotion`, `updatePromotion`,
`setPromotionStatus`.
They reuse the Wave 3 `authorizeMerchantPlace` bridge unchanged, so a merchant
who could not manage a place before still cannot.
*Rollback:* `firebase functions:delete` the 4. No shipped app calls them — the
0.1.8(13) build in production contains no promotion code.

**Step 9 — Deploy the 3 promotion Control-Center functions.**
`controlCenterPromotionAdminBridge`, `mirrorPromotionOnWrite`,
`reconcilePromotionMirrorDaily`.
Bind `PROMOTION_ADMIN_BRIDGE_SECRET` and `CONTROL_CENTER_SYNC_SECRET`.
The bridge stays unreachable until step 12 gives the Control Center its URL.
*Rollback:* delete the 3. The mirror trigger fires only on
`restaurant_promotions` writes, and that collection is empty.

**Step 10 — Deploy the CMS read callable `getCmsContent`.**
With zero `cms_content` documents it returns an empty plan. The shipped
0.1.8(13) app never calls it.
*Rollback:* delete it.

**Step 11 — Deploy the 6 CMS Control-Center functions.**
`controlCenterCmsAdminBridge`, `controlCenterCmsMediaUpload`,
`mirrorCmsContentOnWrite`, `reconcileCmsMirrorDaily`,
`mirrorCmsCollectionOnWrite`, `reconcileCmsCollectionMirrorDaily`.
Bind `CMS_ADMIN_BRIDGE_SECRET` and `CONTROL_CENTER_SYNC_SECRET`.
*Rollback:* delete the 6.

> After step 11 the backend is complete and **completely idle**. No document
> exists in any of the three collections, so every trigger, every reconcile and
> every read returns empty.

### Phase C — the console

**Step 12 — Configure the Control Center environment.**
Set in Vercel **production** scope:

| Variable | Value |
|---|---|
| `FIREBASE_PROMOTION_ADMIN_BRIDGE_URL` | deployed URL of `controlCenterPromotionAdminBridge` |
| `PROMOTION_ADMIN_BRIDGE_SECRET` | the value from step 6 |
| `FIREBASE_CMS_ADMIN_BRIDGE_URL` | deployed URL of `controlCenterCmsAdminBridge` |
| `CMS_ADMIN_BRIDGE_SECRET` | the value from step 6 |
| `FIREBASE_CMS_MEDIA_BRIDGE_URL` | deployed URL of `controlCenterCmsMediaUpload` |

Each bridge has its own slot: a missing pair makes **that one** family report
unconfigured, never a neighbouring family.
*Rollback:* delete the 5 variables and redeploy — the console returns to
read-only for these families and says so honestly.

**Step 13 — Deploy the Control Center to Vercel production.**
*Rollback:* promote deployment **B3**.

**Step 14 — Verify the empty plane end to end.**
All checks are read-only or draft-only. No customer-visible content is created.

| Check | Expected |
|---|---|
| `/commercial` loads | zero promotions, totals all 0, no error banner |
| `/cms` loads | zero content, totals all 0 |
| `/cms/collections` loads | zero collections, totals all 0 |
| a `cms.read`-only role | sees data, sees "Commands unavailable" |
| enqueue one **draft** promotion | receipt written, `restaurant_promotions` gains 1 doc, mirror row appears, `sync_receipts` records it once |
| replay the same command | idempotent — no second row |
| upload one 100 KB PNG via `/cms` | returns a `cms/...` path; an HTML file renamed `.png` is refused |
| mobile 0.1.8(13) on a device | Home, Explore, Restaurant Detail **unchanged** |

Then delete the draft promotion, or leave it — a draft is never public.
*Rollback:* steps 13, 12, 11 down to 3 in reverse.

### Phase D — the customer sees it

**Step 15 — Ship the mobile client.**
Only after step 14 passes. Run `flutter clean` first — the build-12 defect
recorded in QA-DEV29A was a stale AOT. Build the signed production AAB, prove
the AOT contains the Wave 4 and Wave 5 strings, upload to **Play Internal
Testing**, verify on a device, and only then promote.
*Rollback:* halt the staged rollout in Play and stay on 0.1.8(13). A client
carrying Wave 4/5 code with no authored content still renders exactly as
0.1.8(13) does.

**Step 16 — Author the first real content.**
One promotion and one banner, created as drafts, reviewed, then published by a
separate deliberate status command. Watch the effective status flip at the
scheduled instant, verify on a device, then hand the console to operators.
*Rollback:* set status `paused` — a single audited command, effective on the
next read. This is the fastest kill switch in the system and needs no deploy.

---

## 4. SAFE-OFF state

Everything through step 14 can be deployed and left indefinitely. That is the
SAFE-OFF state, and it is what production looks like the moment step 14 ends:

- **Three empty collections**, each `allow read, write: if false`, so no client
  can reach them directly under any circumstance.
- **`getCmsContent` returns an empty plan.** Every Wave 5 slot renders nothing.
  A banner is a guest on the screen, not a tenant: with no active content the
  app is the approved UI, unchanged.
- **No promotion documents**, so no offer strip appears on any restaurant.
- **Mirror triggers idle** — they fire on writes that never happen.
- **Reconcile jobs run daily over nothing** and write nothing.
- **The console shows real zeros**, not placeholders.
- **The shipped app is 0.1.8(13)**, which contains no Wave 4 or Wave 5 code at
  all and therefore cannot be affected.

To return to SAFE-OFF from a live state without any deploy: set every promotion
and every CMS item to `paused`. Effective status is re-derived at read time, so
the next customer read is already clean.

---

## 5. Function inventory

| # | Export | Family | Secrets |
|---|---|---|---|
| 1 | `listMerchantPromotions` | merchant | — |
| 2 | `createPromotion` | merchant | — |
| 3 | `updatePromotion` | merchant | — |
| 4 | `setPromotionStatus` | merchant | — |
| 5 | `controlCenterPromotionAdminBridge` | CC to Firebase | `PROMOTION_ADMIN_BRIDGE_SECRET` |
| 6 | `mirrorPromotionOnWrite` | Firebase to CC | `CONTROL_CENTER_SYNC_SECRET` |
| 7 | `reconcilePromotionMirrorDaily` | Firebase to CC | `CONTROL_CENTER_SYNC_SECRET` |
| 8 | `getCmsContent` | mobile read | — |
| 9 | `controlCenterCmsAdminBridge` | CC to Firebase | `CMS_ADMIN_BRIDGE_SECRET` |
| 10 | `controlCenterCmsMediaUpload` | CC to Firebase | `CMS_ADMIN_BRIDGE_SECRET` |
| 11 | `mirrorCmsContentOnWrite` | Firebase to CC | `CONTROL_CENTER_SYNC_SECRET` |
| 12 | `reconcileCmsMirrorDaily` | Firebase to CC | `CONTROL_CENTER_SYNC_SECRET` |
| 13 | `mirrorCmsCollectionOnWrite` | Firebase to CC | `CONTROL_CENTER_SYNC_SECRET` |
| 14 | `reconcileCmsCollectionMirrorDaily` | Firebase to CC | `CONTROL_CENTER_SYNC_SECRET` |

---

## 6. What this cutover deliberately does NOT do

- No index deploy — none is needed, and deploying an unchanged index file
  invites an unrelated rebuild.
- No rotation of `CONTROL_CENTER_SYNC_SECRET` — rotating it would break the
  live Wave 3 mirror mid-cutover.
- No production data write beyond the reversible draft in step 14.
- No Wave 6 analytics. Impressions and taps are not tracked, so the console
  states that gap instead of filling it.
