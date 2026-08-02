# MakanMana Part 1 — Canonical Place Schema (Phase 1.2)

> **Fasa:** 1.2 — Canonical Place Schemas & Backend Test Foundation.
> **Sifat:** ADDITIVE SAHAJA. Kontrak canonical **belum disambung** ke laluan
> baca produksi. Tiada data dimigrasi. Tiada deploy. `PlaceCandidate`,
> `PlaceSummary`, `places_cache`, `place_details`, `getSuggestions`, skor/mood/
> ranking dan semua kad **tidak berubah**.
> **Lokasi kod:** `functions/src/domain/places/` (+ ujian di `__tests__/`).
> **Rujukan:** PDF "MakanMana Bahagian 1", audit `docs/MAKANMANA_PART1_PLACE_CARD_AUDIT.md`.

---

## 1. Domain Model

`CanonicalPlace` (`canonicalPlace.ts`) ialah rekod kedai pusat — satu identiti,
snapshot sumber, dan intelligence. Dibina daripada **interface bersarang
eksplisit** (bukan satu map tanpa jenis):

```
CanonicalPlace
├─ placeId, status, verificationStatus, publicationStatus
├─ identity: PlaceIdentity            (nama canonical/normalized/alternate)
├─ location: PlaceLocation            (lat/lng + alamat + canonicalCellId?)
├─ contacts: PlaceContacts
├─ providerRefs: SourceReference[]    (provenance peringkat rekod)
├─ displaySnapshot: ApprovedDisplaySnapshot
├─ media: PlaceMediaSet               (status kelulusan + fallback eksplisit)
├─ commercial: PlaceCommercialData    (priceState: verified|estimated|unknown)
├─ hours: PlaceHoursData              (hoursState eksplisit)
├─ quality: PlaceQualityData          (rating?/reviewCount? = undefined bila tiada)
├─ tagSet: CanonicalTagSet            (tag berbukti)
├─ safetyEvidence: PlaceSafetyEvidence(halal/diet/alahan sebagai DATA)
├─ provenance: FieldProvenanceMap     (bukti per-medan)
├─ completeness: PlaceCompleteness    (10 dimensi + overallScore)
├─ freshness: PlaceFreshness          (freshness per-medan)
├─ mergeState: MergeState
├─ aliases: PlaceAlias[]              (keserasian placeId Google)
└─ createdAt/updatedAt/publishedAt?/publishedVersion?
```

Fail domain (18): `common, placeEnums, placeIdentity, placeSource,
placeProvenance, placeTags, placeMedia, placeCommercial, placeHours,
placeQuality, placeSafetyEvidence, placeFreshness, placeCompleteness,
placeMerge, placeCardContract, placePublication, canonicalPlace, validation`
(+`index` barrel).

## 2. Enums (union string immutable — `placeEnums.ts`)

Setiap enum mengeksport array runtime (`as const`) + jenis union. **Nilai
disimpan = ID kanonikal bebas bahasa; JANGAN guna label terjemah.**

| Enum | Nilai |
|---|---|
| `PlaceStatus` | active, temporarily_closed, permanently_closed, moved, pending_validation, hidden_by_admin, stale_critical, community_unverified |
| `VerificationStatus` | unverified, source_verified, merchant_verified, community_reported, admin_verified, rejected |
| `PublicationStatus` | draft, needs_review, approved, published, stale, hidden, rejected, superseded |
| `SourceType` | provider, owner_upload, merchant, community, makanmana, licensed_dataset |
| `EvidenceLevel` | verified, reported, inferred, unknown |
| `FreshnessState` | fresh, aging, stale, expired, unknown |
| `HoursState` | known, unknown, expired, temporarily_closed, permanently_closed |
| `MediaStatus` | pending, approved, rejected, unavailable, fallback |
| `MergeStatus` | none, possible_duplicate, review_required, merged, superseded, split_required |
| `CardSourceMode` | live, approved_cache, community, sample |
| `HalalEvidenceState` | certified, merchant_claimed, community_reported, unknown, possible_non_halal |

## 3. Nested Contracts

- **PlaceIdentity:** canonicalName, normalizedName, alternateNames[], branchName?,
  merchantRegistrationId?, websiteDomain?
- **PlaceLocation:** lat, lng, address?, locality?, state?, countryCode?,
  postalCode?, canonicalCellId?, geohash?
- **PlaceContacts:** phones[], email?, website?
- **SourceReference:** sourceType, sourceRecordId, providerName?, providerPlaceId?,
  fetchedAt?, verifiedAt?, expiresAt?, licenseId?, attribution?
- **PlaceMediaItem/Set:** status kelulusan + `isFallback` eksplisit; foto fallback
  jelas generik (bukan foto venue palsu).
- **PlaceCommercialData:** `priceState` (verified|estimated|**unknown**) — baiki
  F-05 (harga tidak direka).
- **PlaceHoursData:** `hoursState` eksplisit — baiki F-04 (tidak papar "buka"
  bila tidak diketahui).
- **PlaceQualityData:** `rating?`/`reviewCount?` **undefined = tidak diketahui**
  — baiki F-03 (tiada 0.0 palsu).

## 4. Field Evidence Rules (`placeProvenance.ts`)

```ts
FieldEvidence<T> {
  value: T; sourceType: SourceType; sourceRecordId?;
  evidenceLevel: EvidenceLevel; confidence: number /*0..1*/;
  fetchedAt?; verifiedAt?; expiresAt?; approvedBy?;
}
```

Peraturan (dikuatkuasa oleh `validation.ts`):
- `confidence` **mesti** 0..1 (`confidence_out_of_range`).
- `sourceType` **mesti** hadir dan sah.
- `evidenceLevel: "unknown"` kekal eksplisit — kami TIDAK mendakwa nilai.
- Timestamp opsyenal mesti nombor bukan-negatif bila hadir (`invalid_timestamp`).

`FieldProvenanceMap` menyimpan bukti untuk sekurang-kurangnya: displayName,
address, coordinates, phone, website, price, rating, reviewCount, openingHours,
businessStatus, halalEvidence, dietaryEvidence, allergenEvidence, media, tags.

**Prinsip:** menukar format data TIDAK menghapuskan asal sumber. App boleh
memapar format seragam; backend mengekalkan provenance.

## 5. Freshness Model (`placeFreshness.ts`)

`PlaceFreshness` = freshness bebas per-medan (businessStatus, openingHours,
rating, reviewCount, price, images, address, location, tags, merchantData).
Setiap `FieldFreshness`: fetchedAt?, verifiedAt?, staleAfter?, expiresAt?, state.

Helper tulen **deterministik** (masa disuntik — tiada `Date.now()` dalaman):

```
calculateFreshnessState(now, fetchedAt?, staleAfter?, expiresAt?)
  fetchedAt tiada                          -> "unknown"
  staleAfter & expiresAt kedua tiada       -> "unknown"
  now >= expiresAt                          -> "expired"
  now >= staleAfter:
    tiada expiresAt                         -> "stale"
    now < titik-tengah[staleAfter,expiresAt]-> "aging"
    selepas titik-tengah                    -> "stale"
  selainnya                                 -> "fresh"
```

## 6. Completeness Formula (`placeCompleteness.ts`)

```
overallScore =
  0.20*identity + 0.20*location + 0.15*display + 0.10*commercial
+ 0.10*hours + 0.10*quality + 0.10*tag + 0.05*provenance
```

- Jumlah pemberat = **1.00**.
- `safetyEvidenceCompleteness` **SENGAJA dikecualikan** dari `overallScore`
  (kekal sebagai dimensi berasingan; didokumen di sini secara eksplisit).
- Semua komponen mesti 0..1; `calculatePlaceCompleteness` melempar `RangeError`
  untuk input luar julat (helper defensif); `validatePlaceCompleteness` (skema)
  mengendalikannya secara graceful.
- Skor dibundarkan (1e-6) untuk keputusan deterministik.

## 7. Publication Eligibility (`placePublication.ts`)

`evaluatePublicationEligibility(place) -> { eligible, reasons[], warnings[] }`
(helper tulen; **TIADA tulisan**). Pemalar (bukan nombor ajaib):
`MIN_PUBLICATION_COMPLETENESS=0.6`, `STANDARD_PUBLICATION_COMPLETENESS=0.8`.

**Layak HANYA bila** semua benar:
- `publicationStatus === "published"`
- `verificationStatus ∈ {source_verified, merchant_verified, admin_verified,
  community_reported}` (dan bukan `rejected`)
- `status ∉ {permanently_closed, hidden_by_admin, pending_validation,
  stale_critical}`
- identiti lengkap (canonicalName + normalizedName)
- lokasi sah (lat/lng)
- tidak digabung (`mergeStatus ∉ {merged, superseded}` dan tiada `duplicateOf`)
- `completeness.overallScore >= 0.6`

**Warning** (layak tetapi perlu label jujur): `completeness_needs_labels`
(0.6–0.8), `community_evidence_only`, `hours_unknown`, `price_unknown`.

## 8. Tag Contracts (`placeTags.ts`)

15 keluarga: place_type, cuisine, dish, meal_slot, mood_support, service,
ambience, health, dietary, allergen, halal_evidence, spice, portion, speed,
price. `CanonicalTagEvidence { tagId, family, evidenceLevel, confidence,
sourceType, sourceRecordId?, verifiedAt?, approvedBy? }`.

Peraturan: `tagId` mesti ID kanonikal (`^[a-z0-9_]+$`) — label terjemah/teks
setempat ditolak (`localized_or_invalid_tag_id`). Confidence 0..1. Setiap tag
boleh diluluskan individu (fasa admin). **Senarai taksonomi penuh belum
dibina** — hanya fixture wakil untuk ujian (Phase 1.5 akan lengkapkan).

## 9. Card Data Contract (`placeCardContract.ts`)

`PlaceCardData` (domain; pemetaan Flutter = Phase 1.9). Utamakan nilai mentah +
kunci l10n; jangan simpan teks sudah-setempat kecuali nama/alamat venue.
- `rating?`/`reviewCount?` kekal undefined bila tiada.
- `priceState` eksplisit; `hoursState` eksplisit.
- `matchScore?` **PILIHAN** — lapisan ini **tidak** mengira match cadangan.
- Pemeta jujur tulen: `toCardQuality` (tidak pernah ganti 0), `toCardPriceState`,
  `toCardHoursState` (tidak pernah reka). `CardReason`, `CardWarning`,
  `CardBadge`, `CardImageData`, `PriceDisplayState` disertakan.

## 10. Alias Compatibility Strategy (`placeMerge.ts`)

`PlaceAlias { aliasId, canonicalPlaceId, aliasType, sourceType?, sourceRecordId?,
createdAt, reason }`. `aliasType ∈ {google_place_id, legacy_place_id,
provider_id, former_name, merged_from}`.

**Strategi keserasian (kritikal untuk migrasi Phase 1.4/1.12):**
`placeId` Google semasa dipakai oleh `users/{uid}/favorites/{placeId}`,
`meals.placeId`, `suggestions`, `suggestion_sessions`, dan deep-link
`/restaurant/{placeId}`. Apabila ID canonical baharu diperkenalkan, setiap
`placeId` Google lama **menjadi `PlaceAlias` bertype `google_place_id`** yang
menunjuk ke `canonicalPlaceId`. Read-path masa depan menyelesaikan
alias → canonical, jadi **tiada favorites/meals/deep-link pecah**. `MergeState`
mengekalkan `preservedSourceRefs` (tiada pemadaman merosakkan). Enjin padanan
duplicate **belum** dibina (Phase 1.4).

## 11. Current Production Integration Status

| Perkara | Status |
|---|---|
| `functions/src/index.ts` import domain? | **Tidak** (barrel tidak diimport) |
| `getSuggestions`/`getNearbyPlaces` guna CanonicalPlace? | **Tidak** |
| `places_cache`/`place_details` baca/tulis berubah? | **Tidak** |
| `PlaceCandidate`/`PlaceSummary` diganti? | **Tidak** |
| Kad Flutter berubah? | **Tidak** |
| Skor/mood/ranking/Food Memory berubah? | **Tidak** |
| Firestore rules berubah? | **Tidak** |
| Data dimigrasi? | **Tidak** |
| Ujian domain | 28 lulus (`node --test`, zero-dep) |
| Binaan produksi (`tsc -p tsconfig.json`) | bersih; ujian dikecualikan dari `lib/` |

**Infrastruktur ujian:** tiada pergantungan baharu — validator hand-rolled
(tiada Zod) + `node:test`/`node:assert` terbina dalam Node. Konfigurasi ujian:
`tsconfig.test.json` (kompil `src/domain` → `lib-test/`, digitignore),
skrip `npm test`. `tsconfig.json` menambah `exclude` untuk fail ujian supaya
`lib/` produksi kekal bersih.

## 12. Pernyataan Eksplisit

> **Canonical contracts are not yet connected to production reads.**
>
> Semua kontrak dalam `functions/src/domain/places/` bersifat additive dan
> tidak digunakan oleh mana-mana laluan produksi. Aplikasi terus berjalan
> menggunakan `PlaceCandidate`/`PlaceSummary` + `places_cache`/`place_details`
> sedia ada, tanpa perubahan tingkah laku.
