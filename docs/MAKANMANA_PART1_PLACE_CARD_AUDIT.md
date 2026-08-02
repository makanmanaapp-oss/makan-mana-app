# MakanMana Part 1 — Place Data & Place Card Audit (Phase 1.1)

> **Jenis:** READ-ONLY TECHNICAL AUDIT. **Tiada kod diubah. Tiada deploy. Tiada
> migration. Tiada fix.** Sumber kebenaran = PDF "MakanMana Bahagian 1 — Kad
> Kedai & Rule Tambahan".
> **Skop:** HANYA data kedai, Shared Place Database, identiti/dedup, tags,
> provenance, freshness, kad kedai, Restaurant Detail, tindakan kad, admin
> place-data, rules, tests, legacy. **Algoritma pemilihan/mood/Food Memory/Fit
> TIDAK disentuh** (didokumen sebagai dependency sahaja bila relevan).

---

## 1. Executive Summary

MakanMana **tidak mempunyai lapisan "canonical place" seperti yang ditetapkan
PDF**. Tiada `place_registry`, `place_staging`, `place_publications`,
`place_merge_queue`, `place_tag_sets`, `food_coverage_cells`, mahupun
`CanonicalPlace`/`PlaceCardViewModel` — carian kod mengesahkan **kesemuanya
tiada** (`grep` kosong merentas `lib/**` dan `functions/src/**`).

Keadaan sebenar hari ini:

- **Sumber data kedai:** Google Places API (New) `searchNearby`
  (`functions/src/services/placesService.ts`) → cache Firestore
  `places_cache` (TTL 7 hari) + snapshot `place_details`. Fallback statik:
  `DUMMY_PLACES` (10 rekod, server) dan `DummySuggestionService` (klien).
- **Model kedai:** hanya **2** — `PlaceCandidate` (TS,
  `functions/src/types/place.ts`) dan `PlaceSummary` (Dart,
  `lib/models/place_summary.dart`). Tiada model canonical.
- **Shared Place Database:** **PARTIAL** — `places_cache` *dikongsi* antara
  pengguna dalam kawasan sama (kunci = koordinat dibundar + radius; dibaca
  mana-mana pengguna log masuk), jadi User B **memang** menikmati pool yang
  dibina User A. TETAPI tiada coverage cell stabil, tiada sel jiran, tiada
  approval/publication, tiada discovery latar (fetch menyekat permintaan pada
  cache miss), dan entri stale/duplicate boleh kekal.
- **Provenance/freshness:** minimum — medan `source` + `place_details.lastFetchedAt`
  + `cache.expiresAt`. **Tiada** provenance per-medan, `verifiedAt`,
  `approvedBy`, `confidence`, `evidenceLevel`, `verificationStatus`,
  `publicationStatus`.
- **Tags:** **tiada sistem tag kedai**. `cuisine` = satu string bebas dari
  Google `primaryTypeDisplayName`. Tiada keluarga tag (place_type/dish/
  mealSlot/health/dietary/allergen/halal_evidence), tiada evidence/confidence.
- **Admin place-data module:** projek `makanmana-control-center` (Next.js)
  **wujud** tetapi berorientasi pemasaran/ops; **tiada** Place Data Dashboard/
  Import/Staging/Editor/Tag Editor/Merge Center/Coverage Map/Freshness Queue/
  Publication History. Modul bersebelahan (`menu-intelligence`, `media-manager`)
  berjalan dalam **"Mock Mode"** (data rekaan).

**Risiko data mengelirukan yang paling penting (P1):**

1. **Rating 0.0 dipapar sebagai rating sebenar** — semua kad render
   `★ ${place.rating}` tanpa syarat; `PlaceCandidate`/`PlaceSummary` default
   `rating = 0` bila Google tiada nilai.
2. **Status "Buka sekarang" untuk waktu tidak diketahui** — `isOpenNow()`
   memulangkan `true` bila jadual `null`/kosong (`placesService.ts:159`).
3. **Harga anggaran direka** — `priceEstimate` sentiasa memberi julat RM;
   `priceLevel` default `1` bila Google tiada → papar "RM5–RM15" seolah-olah
   diketahui.
4. **Amaran halal/alahan tidak dipapar** pada kad Home/Explore/Restaurant
   Detail — hanya pada Suggestion Screen + Meal Plan.

**Status keseluruhan Phase 1.1:** PASS (audit lengkap, bukti fail-spesifik,
tiada kod diubah). Sistem canonical place yang PDF minta = **projek greenfield**
(Phase 1.2–1.14).

## 2. Audit Scope

Diliputi: sumber data kedai (Google Places + dummy), `places_cache`,
`place_details`, identiti/dedup, Shared DB, provenance/freshness, taksonomi tag
kedai, semua kad kedai (Home Nearby, Home AI Pick, Suggestion, Explore, Map,
Restaurant Detail, Saved, Meal Plan, sample), ketepatan medan kad, tindakan kad,
admin place-data (`makanmana-control-center`), `firestore.rules`,
`storage.rules`, indexes, Cloud Functions berkaitan kedai, tests, legacy.

Dikecualikan (didokumen sebagai dependency sahaja): skor cadangan akhir, mood
weights, Food Memory, Fit/Sport/nutrition, ranking/primary/rotation, quota,
harga langganan, sosial/DM/group/Tong-Tong/Meal Wallet/payment.

## 3. Repository Architecture Map

```
Repo roots:
  makan_mana/               <- Flutter app + Firebase Functions + rules
  makanmana-control-center/ <- Next.js admin (Mock Mode; no place-data module)
  play_release_pack/        <- artifak release
  qa15/                     <- artifak QA

CURRENT place-data flow (no canonical layer):

  Google Places API (New) searchNearby
    functions/src/services/placesService.ts :: searchNearby()
      -> places_cache/{v2_lat.3_lng.3_radiusM}   (TTL 7 hari)
      -> place_details/{placeId}                  (snapshot + photoUrl)
    (miss/gagal/tiada key) -> functions/src/data/dummyPlaces.ts :: DUMMY_PLACES (10)
        |
        v
  PlaceCandidate (functions/src/types/place.ts)
        |
   getSuggestions.ts / getNearbyPlaces.ts  (onCall, asia-southeast1)
        |  (scoreAndRank melekatkan matchScore/reasons — Part 2, tak disentuh)
        v
  CloudSuggestionService (lib/core/services/cloud_suggestion_service.dart)
        -> PlaceSummary.fromMap (lib/models/place_summary.dart)
        |
   Providers (lib/core/providers.dart):
     nearbyPlacesProvider, homeSuggestionProvider, currentSuggestionProvider
        |
   Cards:
     Home Nearby   _NearbyCard        (home_screen.dart)
     Home AI Pick  _HeroPickCard      (home_screen.dart)
     Suggestion    suggestion_screen.dart
     Explore       _PlaceTile         (explore_screen.dart)
     Restaurant    restaurant_detail_screen.dart
     Meal Plan     _SlotCard          (meal_plan_screen.dart)
        |
   User action: openPlaceInMaps / Save / Accept / Reject
     (lib/core/utils/place_actions.dart, suggestion controllers)

  Client static fallback: DummySuggestionService (lib/core/services/dummy_suggestion_service.dart)
```

**Fallback offline:** bila `firebaseReady==false`/CF null, klien guna dummy dan
**melabel** `source ∈ {demo_preview, offline_fallback}` (`isSample=true`).

## 4. Current Place-Data Flow (exact)

1. `nearbyPlacesProvider` / `homeSuggestionProvider` / `SpinController.spin`
   dapatkan lokasi (`locationService.getPosition`), radius (`effectiveRadiusMeters`).
2. Panggil `getNearbyPlaces` (Home grid) atau `getSuggestions` (hero/spin).
3. Backend `searchNearby(lat,lng,radiusMeters)`:
   - `cacheId = v2_${lat.toFixed(3)}_${lng.toFixed(3)}_${radiusMeters}`.
   - Baca `places_cache/{cacheId}`; jika `expiresAt > now` → guna cache,
     kira semula `isOpen` (`applyOpenStatus`), **0 panggilan API**.
   - Jika miss/luput → POST Google `places:searchNearby` (FieldMask; 20 hasil;
     `rankPreference:POPULARITY`; `includedTypes:["restaurant"]`), selesaikan
     foto sekali, tulis `places_cache` + `place_details` (batch).
4. `scoreAndRank` (Part 2, tak disentuh) melekatkan `matchScore`, `matchReasonKeys`,
   `negativeSignals`.
5. Respons → `PlaceSummary.fromMap` → kad.

**Nota:** fetch pada cache miss adalah **synchronous di dalam permintaan
pengguna** (tiada discovery latar) — melanggar keperluan PDF §5.1 "discovery/
refresh must not block existing approved results".

## 5. Current Collections and Schemas

| Path | Canonical? | Penulis | Pembaca | ID strategy | Rules |
|---|---|---|---|---|---|
| `places_cache/{v2_lat_lng_radius}` | **Cache sahaja** | Cloud Functions (Admin SDK) | signedIn (app tidak baca terus; melalui CF) | `v2_{lat.3}_{lng.3}_{radiusM}` | read:signedIn, **write:false** |
| `place_details/{placeId}` | **Snapshot sahaja** | Cloud Functions | signedIn (client `placeCommunityProvider` baca terus) | Google placeId | read:signedIn, **write:false** |
| `users/{uid}/suggestions/{id}` | rekod cadangan | owner+server | owner | auto | owner |
| `users/{uid}/meals/{id}` | sejarah (simpan placeId) | owner+server | owner | auto | owner |
| `users/{uid}/favorites/{placeId}` | saved place | owner | owner | **placeId (canonical-ish)** | owner |
| `suggestion_sessions/{id}` | sesi (candidatePlaceIds) | pencipta+server | pencipta | auto | userId |

**Tiada (MISSING sepenuhnya):** `place_registry`, `place_staging`,
`place_publications`, `place_merge_queue`, `place_media`, `place_tag_sets`,
`food_coverage_cells`, `coverage_metrics`, `place_source_snapshots`.

### 5.1 place_details schema sebenar (ditulis `placesService.ts:311`)
`displayName, rating, userRatingCount, priceLevel, keywords:[cuisine],
photoUrl, lastFetchedAt` (+ `communityRating/communityCount` dari
`onReviewApproved` trigger). Ini **snapshot ringkas**, bukan rekod canonical.

## 6. Current Place Models (field-level)

| Konsep | `PlaceCandidate` (TS) | `PlaceSummary` (Dart) | Konflik/nota |
|---|---|---|---|
| ID | `placeId` | `placeId` | konsisten |
| Nama | `name` | `name` | konsisten (default "Tempat Makan") |
| Cuisine | `cuisine` (string) | `cuisine` (string) | **satu string**, bukan tag[] |
| Emoji | `emoji` | `emoji` | derivasi dari types |
| Rating | `rating` (default 0) | `rating` (default 0) | **0 = tiada, dipapar sebagai 0.0** |
| Bilangan ulasan | `userRatingCount` | `userRatingCount` | konsisten |
| Harga | `priceLevel` (1–4, default 1) | `priceLevel` | **default 1 bila unknown** |
| Anggaran harga | `priceEstimate` | `priceEstimate` | sentiasa julat RM |
| Jarak | `distanceKm` | `distanceKm` | konsisten |
| Buka | `isOpen` (default true) | `isOpen` (default true) | **true bila unknown** |
| Alamat | `address` | `address` | konsisten |
| Match | `matchScore`, `matchReasonKeys` | `matchScore`, `matchReasonKeys` | dari Part 2 |
| Isyarat negatif | `negativeSignals?` | `negativeSignals` | tidak dipapar kebanyakan kad |
| Foto | `photoUrl?` | `photoUrl?` | URL Google; fallback monogram klien |
| Jadual | `openingPeriods?` | — (server sahaja) | klien tak terima |
| Sumber | — | `source` (google_places/mock_fallback/demo_preview/offline_fallback) | provenance kasar |

**Konflik nama yang PDF cari:** tiada `id` vs `googlePlaceId` (satu `placeId`
sahaja); tiada `latitude/longitude` (koordinat tidak dihantar ke klien — hanya
`distanceKm`); `priceLevel` sahaja (tiada `priceBand`/`budget`); `isOpen` sahaja
(tiada `openNow`); `photoUrl` sahaja (tiada `imageUrl`/`photos[]`); `cuisine`
string (tiada `cuisines[]`/`tags[]`). Skema **konsisten** merentas dua model —
tetapi **cetek** berbanding `CanonicalPlace` PDF.

## 7. Shared Place Database Status

Jawapan eksplisit kepada 10 soalan PDF §Part E:

1. **User A search → simpan pusat?** Ya — `places_cache` (per kawasan).
2. **User B baca pool sama?** **Ya** — cache doc dibaca mana-mana pengguna
   (melalui CF), dikongsi ikut `cacheId`.
3. **Setiap Spin bina dari kosong?** Tidak — cache hit = 0 API.
4. **Cache terikat kepada?** `(lat.3, lng.3, radiusMeters)` — **satu koordinat
   + satu radius** (bukan sel stabil; bukan per-pengguna; bukan per-slot).
5. **Pool boleh berkembang > 1 respons provider?** **Tidak** — satu `cacheId`
   = satu respons `searchNearby` (maxResultCount 20). Radius berbeza = doc
   berbeza, tiada gabungan pool.
6. **Sel jiran disokong?** **Tidak.**
7. **Coverage version stabil?** **Tidak** (tiada `coveragePoolVersion`).
8. **Discovery/refresh latar?** **Tidak** — fetch synchronous pada miss.
9. **Provider search menyekat permintaan?** **Ya** (pada cache miss).
10. **Stale/duplicate kekal selamanya?** Boleh — sehingga `expiresAt` (7 hari)
    untuk stale; duplicate merentas radius/koordinat berdekatan **tidak
    dinyahduakan**.

| Komponen diperlukan (PDF) | Status |
|---|---|
| Location cell (stabil) | **MISSING** (guna koordinat dibundar 3 titik perpuluhan) |
| Approved published place IDs | **MISSING** (tiada approval/publication) |
| Exact radius filtering | **PARTIAL** (radius = kunci cache + jarak dikira; tiada tapis radius pasca-baca) |
| Standardized canonical payload | **PARTIAL** (`PlaceSummary` seragam tetapi bukan canonical/approved) |
| Background discovery & refresh | **MISSING** (synchronous, tiada job latar) |

## 8. Place Identity and Duplicate Status

- **Identiti:** `placeId` = Google Places ID (tempat sebenar) atau `dummy_*`
  (statik) atau `sess_*`/`sug_*` (id sesi/cadangan tempatan, bukan kedai).
- **Strategi dedup semasa:** **TIADA** dedup rentас-rekod. Satu-satunya
  penyahduaan ialah dalam reject-chain sesi (`SpinController._pickCandidate`
  menapis `_shownPlaceIds`/`_rejectedPlaceIds` ikut `placeId`).
- **Kes duplicate (PDF §Part D):**
  1. Google place sama dari dua search kawasan → **doc cache berbeza**, tetapi
     `placeId` sama → jika dua pool digabung, muncul dua kali (tiada dedup
     merentas cache).
  2. Nearby vs owner-upload → **tiada laluan owner-upload**, jadi tidak berlaku.
  3. Ejaan berbeza / cawangan rangkaian / kedai berpindah / dinamakan semula /
     provider ID berubah → **tiada pengendalian** (tiada matching name/phone/
     geo, tiada alias, tiada `mergedIntoPlaceId`).
- **Risiko pemadaman merosakkan:** rendah setakat ini (cache overwrite by key,
  bukan padam kedai). Tetapi **tiada alias** bermakna jika ID canonical
  diperkenalkan kemudian, `favorites/{placeId}`, `meals.placeId` dan deep-link
  `/restaurant/{placeId}` **akan pecah** tanpa peta alias → **dependency Phase
  1.4/1.12**.

## 9. Provenance and Freshness Status

**Provenance:** wujud sebagai **satu label sumber am** sahaja, bukan per-medan.
- Klien: `PlaceSummary.source` (`google_places`/`mock_fallback`/`demo_preview`/
  `offline_fallback`).
- `place_details.lastFetchedAt`; `places_cache.createdAt/expiresAt`.
- **Tiada:** `sourceRecordId`, `verifiedAt`, `approvedBy`, `confidence`,
  `evidenceLevel`, `expiresAt` per-medan, `verificationStatus`,
  `publicationStatus`, `FieldEvidence<T>`.

**Freshness:** satu TTL 7 hari untuk **seluruh kawasan** (bukan per-medan seperti
PDF §11). `isOpen` sahaja dikira semula setiap baca (baik). **Tiada** `hoursState`
(`known/unknown/expired`), tiada `staleAfter`, tiada penanda stale UI.

**Missing-data digantikan secara tidak jujur (P1):**
- `rating` tiada → `0` → dipapar "★ 0.0".
- `priceLevel` tiada → `1` → `priceEstimate` "RM5–RM15" (harga direka).
- `isOpen` tiada → `true` → "Buka sekarang".
- Foto tiada → monogram klien (jujur — bukan foto palsu kedai).

## 10. Tag Taxonomy Status

**Tiada taksonomi tag kedai.** `cuisine` = satu string bebas dari Google
`primaryTypeDisplayName` (atau "Restoran"). Padanan enjin guna
`cuisine.toLowerCase().includes(substring)` (senarai keras dalam
`scoringService.ts` — Part 2, tak disentuh).

| Keluarga tag (PDF §9) | Status |
|---|---|
| place_type, cuisine, dish, meal_slot, mood_support, service, ambience, health, dietary, allergen, halal_evidence, spice, portion, speed, price | **MISSING** sebagai tag kedai berstruktur |

**Nota:** `taste_taxonomy.dart` (ISSUE 003) ialah **keutamaan PENGGUNA**, bukan
tag kedai — ID Inggeris stabil + label 4-bahasa, tetapi tidak dilekatkan pada
rekod kedai. **`place_tag_sets` tiada.** Ini greenfield untuk Phase 1.5.

## 11. Full Card Inventory

| Kad | Fail | Widget | Model | Sumber | Medan dipapar | Tindakan | Fallback | Masalah |
|---|---|---|---|---|---|---|---|---|
| Home Nearby | home_screen.dart | `_NearbyCard` | PlaceSummary | nearbyPlacesProvider (getNearbyPlaces/dummy) | foto, nama, ★rating, distance, open chip | tap→detail | monogram | **★0.0**, **open-when-unknown**, fallback dummy senyap |
| Home AI Pick | home_screen.dart | `_HeroPickCard` | PlaceSummary | homeSuggestionProvider (getSuggestions preview) | foto, nama, matchScore, cuisine, ★rating, distance, priceEstimate | tap→suggestion | monogram + `_sampleBanner` | **★0.0**, **harga direka** |
| Suggestion | suggestion_screen.dart | (screen) | PlaceSummary | suggestionActionController | hero, quick facts, match, **reasons+warnings**, CTA | Accept/Reject/Next/Detail/Map | sample label | (kad terbaik — ada warnings) |
| Explore | explore_screen.dart | `_PlaceTile` | PlaceSummary | (explore search) | foto, nama, cuisine, ★rating, distance, closed? | tap→detail | monogram | **★0.0**, **open-when-unknown** |
| Restaurant Detail | restaurant_detail_screen.dart | (screen) | PlaceSummary | currentSuggestion/route | carousel foto, ★rating (userRatingCount), open, priceEstimate, community rating, ulasan | Map/Save/Share/Log | monogram | **open-when-unknown**, **tiada seksyen amaran halal/alahan** |
| Meal Plan | meal_plan_screen.dart | `_SlotCard` | MealPlanItem(PlaceSummary) | buildMealPlan (client) | nama, cuisine, budget, reasons, **cautions** | tap | idea (bukan kedai palsu) | (ada cautions) |
| Empty/Sample | home_screen.dart | `_aiPickEmpty/_nearbyEmptyState/_sampleBanner` | — | — | mesej jujur + besarkan radius | retry | — | nearby grid fallback dummy tanpa banner |

**Match score dikira sendiri oleh kad?** Tidak — hanya hero + suggestion papar
`matchScore` **dari respons server** (`_HeroPickCard` guna `place.matchScore`).
`_NearbyCard`/`_PlaceTile` **tidak** papar match. Ini selaras PDF §17/§18.

## 12. Card Field Accuracy Matrix

| # | Medan | Sumber | Verified? | Boleh hilang? | Fallback | Fallback mengelirukan? | Boleh stale? | Wording jujur? |
|---|---|---|---|---|---|---|---|---|
| 1 | Nama | Google displayName | provider | ya | "Tempat Makan" | rendah | 7d | ya |
| 2 | Imej | Google photo URL | provider | ya | monogram klien | **Tidak** (jelas generik) | 7d | ya |
| 3 | Rating | Google rating | provider | ya | **0 → "★ 0.0"** | **YA (P1)** | 7d | **Tidak** |
| 4 | Bilangan ulasan | Google userRatingCount | provider | ya | 0 | sederhana (Home tak papar; Detail papar `(0)`) | 7d | separa |
| 5 | Jarak | Haversine | dikira | jika lokasi tiada | disembunyikan | rendah | segar | ya |
| 6 | Harga | priceLevel→estimate | inferred | ya | **1 → "RM5–RM15"** | **YA (P1)** | 7d | **Tidak** |
| 7 | Open/closed | isOpenNow(hours) | dikira | ya (jadual unknown) | **true → "Buka sekarang"** | **YA (P1)** | dikira setiap baca | **Tidak** bila unknown |
| 8 | Cuisine | primaryTypeDisplayName | provider | ya | "Restoran" | rendah | 7d | ya |
| 9 | Place type | (tiada berasingan) | — | — | — | — | — | — |
| 10 | Match score | scoreAndRank (Part 2) | dikira server | jika bukan hasil server | tidak dipapar | rendah | — | ya |
| 11 | Match reasons | scoreAndRank | dikira | ya | tiada | rendah | — | ya |
| 12 | Warnings | negativeSignals | dikira best-effort | **jarang dipapar** | tiada di kebanyakan kad | **YA (P1)** (peninggalan) | — | separa |
| 13 | Halal | negativeSignals/HALAL_* | inferred | ya | tiada seksyen di Detail | **YA (P2)** | — | (bila dipapar: jujur) |
| 14 | Diet | scoring safetyAdj | inferred | ya | tiada di kad | sederhana | — | n/a |
| 15 | Allergy | ALLERGY_CONFLICT | inferred (rosak—lihat Part 2 C1) | ya | `allergy_data_unknown` | sederhana | — | jujur bila dipapar |
| 16 | Map link | placeId/nama+alamat | dikira | tidak | carian nama | rendah | — | ya |
| 17 | Alamat | shortFormattedAddress | provider | ya | "" | rendah | 7d | ya |
| 18 | Sumber/sample | PlaceSummary.source | dikira | tidak | offline_fallback | rendah (dilabel) | — | ya |

## 13. Action / Button Audit

| Tindakan | Fail | Kaedah | Guna placeId stabil? | Simpan sumber/versi? | Dilog? | Boleh double-submit? | Tulis terus place canonical? |
|---|---|---|---|---|---|---|---|
| Open details | home/explore/suggestion | `context.push('/restaurant/{placeId}')` | ya | tidak (versi) | `restaurant_detail_viewed` | tidak | tidak |
| Open Maps | place_actions.dart:59 | `openPlaceInMaps` → launchUrl | ya (query_place_id) | tidak | `open_map` (klien) | tidak | tidak |
| Save/Unsave | restaurant_detail | `users/{uid}/favorites/{placeId}` | **ya (canonical-ish)** | tidak | favorite_added/removed | tidak | tidak |
| Share | restaurant_detail | share_plus | ya | tidak | share_clicked | tidak | tidak |
| Accept/Reject/Next | suggestion controllers | submitFeedback/local | ya | separa (source) | ya | dikawal (processing flag) | tidak |
| **Report wrong data** | — | — | — | — | — | — | **MISSING** |
| **Suggest edit** | — | — | — | — | — | — | **MISSING** |
| Log Meal | controllers | mealRepository/submitFeedback | ya | ya | meal_logged | dikawal | tidak (tulis meal) |

**Rule PDF dipatuhi:** pengguna mudah **tidak boleh** menulis data kedai
canonical (tiada laluan tulis; `places_cache`/`place_details` write:false).
**Laluan pembetulan-ke-staging (Report/Suggest edit) TIDAK wujud** → dependency
Phase 1.11.

## 14. Admin Place-Data Audit (makanmana-control-center)

Projek Next.js berasingan (`src/app/(admin)/*`), guna `firebase-admin`
(`src/lib/firebase-admin.ts`). Modul sedia ada: dashboard, users, subscriptions,
coupons, social-moderation, social-inbox, ai-brain-hq, algorithm-lab,
experiments, feature-flags, audit-logs, media-manager, menu-intelligence,
meal-wallet-monitor, tong-tong-monitor, api-integrations, dll.

| Modul diperlukan (PDF §28) | Status |
|---|---|
| Place Data Dashboard | **MISSING** |
| Upload/Import Center | **MISSING** |
| Staging Review Queue | **MISSING** |
| Place Detail Editor | **MISSING** |
| Tag Editor | **MISSING** |
| Duplicate Merge Center | **MISSING** |
| Coverage Map | **MISSING** |
| Freshness Queue | **MISSING** |
| Publication History | **MISSING** |
| Audit Log | **PARTIAL** (`audit-logs` wujud, umum — bukan place-specific) |
| (bersebelahan) Media Manager | **PARTIAL** (`media-manager` wujud) |
| (bersebelahan) Menu Intelligence | **MOCK ONLY** (metadata: *"…in Mock Mode"*) |

**Kesimpulan:** modul Place Data yang PDF tetapkan **belum wujud**; yang
bersebelahan berjalan **mock**. Tidak disambung ke Firebase produksi untuk data
kedai.

## 15. Security and Permission Audit

Jawapan eksplisit (PDF §Part L) — berdasarkan `firestore.rules` + `storage.rules`:

1. User biasa tulis `place_registry`? **Tidak** (tiada koleksi; `places_cache`/
   `place_details` write:false).
2. Tukar `publicationStatus`? **Tidak** (medan/koleksi tiada).
3. Set `verificationStatus`? **Tidak.**
4. Timpa source/provenance? **Tidak** (server-only).
5. Merge/padam places? **Tidak** (tiada laluan).
6. Pelayar admin tulis terus medan dipercayai? Admin guna `firebase-admin`
   (server) — **tiada rules-bypass klien**; tetapi tiada custom-claim gate
   place-specific kerana modul belum ada.
7. Approval/publish server-side? **N/A** (belum wujud) — apabila dibina, mesti
   server-side.
8. Audit log append-only? Rules umum `events` append-only; `audit-logs` admin
   ada tetapi bukan place-specific.
9. Source payload akses terkawal? **N/A** (belum wujud).
10. Data alahan peribadi bocor ke rekod kedai awam? **Tidak** — alahan disimpan
    `user_profiles` (owner-only); rekod kedai (`place_details`) tidak mengandungi
    data pengguna.

**Storage:** `storage.rules` hanya `feed_images`, `profile_images`,
`wallet_images` (semua owner-write, imej ≤5MB). **Tiada bucket media kedai** —
foto kedai = URL Google (googleusercontent) disimpan sebagai string dalam
`place_details`. Selamat, tetapi tiada media approval/attribution.

**Verdict:** tiada P0 keselamatan dalam lapisan kedai semasa (permukaan tulis
kedai = server-only). Risiko keselamatan sebenar akan muncul **apabila** modul
admin place-data dibina (Phase 1.8) — mesti guna custom claims + server writes.

## 16. Test Coverage Matrix

| Area | Ujian sedia ada | Ujian tiada | Risiko |
|---|---|---|---|
| Place model (PlaceSummary.fromMap) | **tiada** | parse/round-trip, default fields | P2 |
| places_cache / TTL / cacheId | **tiada** | hit/miss/expiry/key | P2 |
| place_details snapshot | **tiada** | tulis/merge | P3 |
| Card rendering (field accuracy) | separa (widget_test sentuh suggestion) | ★0.0, open-unknown, harga-unknown, warnings | **P1** |
| Restaurant Detail | **tiada** | render/fallback | P2 |
| Image fallback | **tiada** | monogram/broken | P3 |
| Rating/price/hours honesty | **tiada** | unknown states | **P1** |
| Tags | **tiada** (tiada sistem) | — | P2 |
| Deduplication/merge | **tiada** (tiada sistem) | — | P1 |
| Provenance/freshness | **tiada** | — | P1 |
| Import/staging/approval/publication | **tiada** (tiada sistem) | — | P1 |
| Security rules (places) | **tiada** | write:false enforce | P2 |
| Firestore indexes (places) | **tiada** (tiada indeks place) | — | P3 |
| Mobile correction flow | **tiada** (tiada laluan) | — | P2 |

Ujian klien sedia ada (13 fail: taste taxonomy/pickers, sport mood, onboarding,
typography, social) **tidak menyentuh** ketepatan medan kad kedai atau lapisan
data. **0 ujian backend.**

## 17. Legacy and Migration Inventory

| Item | Klasifikasi | Nota |
|---|---|---|
| `places_cache` v1 (tanpa foto) | **DEPRECATE LATER** | cacheId sudah `v2_`; v1 luput sendiri (7d) |
| `places_cache` v2 | **MIGRATE** (jadi sumber discovery ke registry) | kekal sebagai cache provider |
| `place_details` | **MIGRATE** | jadi snapshot sumber di bawah registry |
| `DUMMY_PLACES` / `DummySuggestionService` | **WRAP TEMPORARILY** | kekal sebagai sample berlabel sahaja |
| `PlaceSummary` / `PlaceCandidate` | **KEEP + EXTEND** | jadi asas `PlaceCardViewModel` (Phase 1.9) |
| `favorites/{placeId}`, `meals.placeId`, deep-link `/restaurant/{placeId}` | **MIGRATE (alias)** | jika ID canonical baharu → perlu peta alias (Phase 1.4/1.12) |

**Risiko migrasi:** deep-link + saved + meal history semua berpaut `placeId`
Google/dummy. Memperkenalkan `place_registry` dengan ID canonical baharu **mesti**
mengekalkan alias `googlePlaceId → canonicalPlaceId`, jika tidak favorites/history/
deep-link pecah. Feature-flag + read-path switch (PDF §31) diperlukan.

## 18. File-by-File Findings

- `functions/src/services/placesService.ts` — sumber utama; cache 7d; **F-07**
  (isOpen true bila unknown, L159), **F-05** (priceLevel default 1 → estimate),
  FieldMask kos-terkawal (baik).
- `functions/src/types/place.ts` — `PlaceCandidate`; rating/priceLevel default
  0/1 (asal **F-03/F-05**).
- `functions/src/data/dummyPlaces.ts` — 10 rekod statik; dilabel `mock_fallback`
  di CF (baik).
- `functions/src/callable/getNearbyPlaces.ts` — skor minimum (budget/fav/radius);
  tiada mood/halal/alahan (di luar skop Part 1).
- `lib/models/place_summary.dart` — `isSample` getter jujur; **F-03/F-05/F-07**
  merambat ke UI.
- `lib/features/home/home_screen.dart` — `_NearbyCard` L1149 **F-03**;
  `_HeroPickCard` L1079 **F-03/F-05**; nearby fallback dummy **F-08** (senyap).
- `lib/features/explore/explore_screen.dart` — `_PlaceTile` L164–165 **F-03/F-07**.
- `lib/features/restaurant/restaurant_detail_screen.dart` — L203 **F-07**;
  papar `userRatingCount` (baik separa); **F-06** (tiada seksyen amaran halal/
  alahan).
- `lib/features/suggestions/suggestion_screen.dart` — kad terbaik; papar
  reasons+warnings.
- `lib/core/utils/place_actions.dart` — open_map log + launchUrl; guna
  query_place_id (baik).
- `firestore.rules` — `places_cache`/`place_details` write:false (baik);
  favorites owner (baik).
- `storage.rules` — tiada bucket media kedai.
- `makanmana-control-center/src/app/(admin)/*` — tiada modul place-data;
  menu-intelligence **Mock Mode**.

## 19. Critical Risks (severity-classified)

**Tiada P0** dalam lapisan kedai semasa (permukaan tulis = server-only; tiada
kebocoran privasi/pemadaman merosakkan).

| ID | Sev | Ringkasan | Fail:baris | Semasa | Sepatutnya | Kesan pengguna | Kesan data | Fasa | Deploy terjejas? |
|---|---|---|---|---|---|---|---|---|---|
| F-01 | **P1** | Tiada lapisan canonical place (registry/staging/approval/publication) | seluruh repo (tiada) | Data = cache Google + dummy | Canonical + approved published view | App boleh papar data belum disemak | Tiada audit/provenance | 1.2–1.8 | Tidak (guna sekarang stabil) |
| F-02 | **P1** | Shared DB tanpa coverage cell/versi/discovery latar | placesService.ts | cache per koordinat+radius, fetch menyekat | sel stabil + pool + discovery latar | Pool tak berkembang; miss = lambat | Duplicate merentas sel | 1.7 | Tidak |
| F-03 | **P1** | Rating 0.0 dipapar sebagai rating sebenar | place.ts; home_screen.dart:1079,1149; explore:164; restaurant:217 | `★ ${rating}` tanpa syarat | sembunyi bila tiada; "Belum cukup ulasan" | Salah tanggap kualiti | — | 1.9 | **Ya (mengelirukan)** |
| F-04 | **P1** | Waktu tidak diketahui dipapar "Buka sekarang" | placesService.ts:159; home/explore/restaurant | isOpenNow→true bila null | `hours_unknown` "Waktu operasi belum disahkan" | Pergi kedai tutup | — | 1.6/1.9 | **Ya (mengelirukan)** |
| F-05 | **P1** | Harga anggaran direka bila priceLevel unknown | place.ts; placesService PRICE_ESTIMATE_BY_LEVEL | default 1→"RM5–RM15" | `price_unknown` "Harga belum diketahui" | Salah jangka bajet | — | 1.9 | **Ya (mengelirukan)** |
| F-06 | **P2** | Amaran halal/alahan tidak dipapar pada Home/Explore/Detail | restaurant_detail_screen.dart | hanya Suggestion+MealPlan papar | seksyen evidence + warning konsisten | Risiko trust/safety | — | 1.9/1.10 | Sebahagian |
| F-07 | **P2** | Tiada sistem tag kedai berstruktur | seluruh (cuisine=string) | satu string cuisine | keluarga tag + evidence | Mood/filter cetek | — | 1.5 | Tidak |
| F-08 | **P2** | Fallback dummy pada nearby grid tidak berlabel | providers.dart nearbyPlacesProvider | jatuh ke dummy senyap | label SAMPLE/CONTOH | Sample nampak live | — | 1.9 | Sebahagian |
| F-09 | **P2** | Tiada dedup/merge/alias identiti | (tiada) | dedup ikut placeId dalam sesi sahaja | matching + merge + alias | Kedai sama berganda | Deep-link/saved pecah bila migrate | 1.4 | Tidak |
| F-10 | **P2** | Provenance hanya label sumber am (bukan per-medan) | place_summary.dart; place_details | `source` + lastFetchedAt | FieldEvidence per-medan | Sukar audit | — | 1.3 | Tidak |
| F-11 | **P2** | Modul admin Place Data tiada; adjacency Mock Mode | control-center | tiada import/staging/merge/publish | modul penuh + server writes | Tiada kawalan data | — | 1.8 | Tidak |
| F-12 | **P3** | Tiada bucket media kedai / attribution | storage.rules | foto = URL Google | media approval + attribution | — | — | 1.9 | Tidak |
| F-13 | **P3** | Freshness = satu TTL kawasan (bukan per-medan) | placesService.ts | 7d seluruh set | TTL per-medan + hoursState | Data stale halus | — | 1.6 | Tidak |
| F-14 | **P3** | 0 ujian lapisan data/kad kedai | test/**, functions/** | tiada | unit+widget+rules+emulator | Regresi senyap | — | 1.2+ | Tidak |

## 20. Required Dependencies

- **Alias identiti** (F-09) mesti wujud **sebelum** ID canonical menggantikan
  `placeId` Google — jika tidak favorites/meals/deep-link pecah.
- **Feature flag + read-path switch** (PDF §31) untuk migrasi selamat.
- **Custom claims + server writes** untuk modul admin (F-11) sebelum sebarang
  approval/publish.
- **Part 2 (algoritma)** bergantung pada calon bersih dari lapisan ini —
  tetapi Part 1 **tidak boleh** mengubah skor/mood/ranking (kekal terkunci).
- Isyarat alahan Part 2 (peta ID rosak, dirujuk dalam audit teras) ialah
  **dependency berasingan** — bukan skop Part 1, direkod sahaja.

## 21. Recommended Implementation Order (Phase 1.2–1.14)

Selaras PDF §33 (tiada kod ditulis sekarang):
1. **1.2** Skema canonical + asas ujian backend.
2. **1.3** Staging + provenance per-medan.
3. **1.4** Dedup + merge + **alias** (utamakan kerana F-09 blok migrasi).
4. **1.5** Taksonomi tag + evidence.
5. **1.6** Freshness/status/publication (baiki F-04/F-13).
6. **1.7** Shared Place DB read path (coverage cell — baiki F-02).
7. **1.8** Modul admin import/review/approve/publish (F-11).
8. **1.9** `PlaceCardViewModel` + semua kad (baiki F-03/F-05/F-06/F-08).
9. **1.10** Restaurant Detail migration.
10. **1.11** Correction/report flow (F- laluan hilang §13).
11. **1.12** Migrasi legacy + feature flag.
12. **1.13** QA emulator/peranti penuh.
13. **1.14** Deploy terkawal (gate).

**Menang pantas selamat untuk kualiti (tetap Phase 1.9, bukan sekarang):**
F-03/F-04/F-05 (kejujuran rating/open/harga) — pembetulan paparan sahaja, tidak
menyentuh algoritma.

## 22. Confirmation — No Code Modified

Phase 1.1 ialah audit **read-only sahaja**. **Tiada** fail `lib/**`,
`functions/**`, `*.rules`, `*.json` konfigurasi, atau kod admin diubah. Satu
sahaja artifak dicipta: **dokumen audit ini** (`docs/MAKANMANA_PART1_PLACE_CARD_AUDIT.md`).
Tiada migration, tiada seed, tiada deploy, tiada tulisan produksi, tiada tindakan
approval. Hanya arahan baca (ls/grep/find/read) dijalankan.
