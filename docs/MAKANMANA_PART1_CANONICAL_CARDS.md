# MakanMana — PART 1 / Phase 1.9

## Sistem Kad Kedai Kanonikal, Peraturan Paparan Jujur & Semua Kad Flutter

Status: **SIAP — LULUS**. Aditif sahaja. Flag `canonicalCardsEnabled` **default OFF**.
Laluan produksi legasi TIDAK diubah. Tiada suis baca produksi, tiada perubahan
skor/mood/ranking, tiada deploy, tiada migrasi.

---

## 1. Tujuan

Satu sumber kebenaran paparan untuk **semua** kad kedai supaya isu kejujuran yang
dikenal pasti dalam audit Phase 1.1 tidak berulang di setiap skrin:

| Kod audit | Masalah legasi | Peraturan kanonikal |
|-----------|----------------|---------------------|
| F-03 | rating `0.0` dipapar bila data hilang | rating `<= 0` → **null** (sembunyi), papar `ratingUnavailable` |
| F-04 | `isOpen` default `true` → "Buka" palsu | `isOpen==true` → **hoursUnknown** (bukan openNow); hanya `openNow` sebenar boleh papar "Buka" |
| F-05 | julat RM disimpulkan dipapar seolah verified | → **estimatedRange**, berlabel "Anggaran" |
| Keselamatan | halal/alahan diandaikan | ikut **BUKTI** sahaja; tiada dakwaan "selamat"/"halal" tanpa bukti disahkan; isyarat negatif dipapar sebagai amaran jujur |

---

## 2. Fail baharu (semua aditif, di bawah `lib/features/place_cards/`)

| Fail | Peranan |
|------|---------|
| `place_card_view_model.dart` | Model paparan immutable + enum keadaan (harga/waktu/perniagaan/sumber/halal) |
| `place_card_adapter.dart` | Penyesuai `PlaceSummary` legasi → `PlaceCardViewModel` (peraturan jujur) |
| `place_card_flags.dart` | Feature flag `canonicalCardsEnabled` (default OFF) + `resetToSafeDefault()` |
| `place_card_primitives.dart` | Primitif boleh guna semula (imej, tajuk, fakta, status, harga, rating, tag, amaran, sebab, badge, tindakan, sample, skeleton, kosong, ralat) |
| `place_cards.dart` | 6 varian kad kanonikal dikarang dari primitif |
| `lib/app/localization/place_card_strings.dart` | 26 kunci l10n baharu × 4 bahasa (ms/en/zh/ta) |

**Ujian:** `test/place_cards_test.dart` — 44 ujian.

---

## 3. Model & enum keadaan (`place_card_view_model.dart`)

- `CardPriceState`: verifiedAverage, verifiedRange, menuFromPrice, providerBand, estimatedRange, unknown, expired
- `CardHoursState`: openNow, closedNow, hoursUnknown, hoursExpired, temporarilyClosed, permanentlyClosed, statusUnknown, blocked
- `CardBusinessState`: active, temporarilyClosed, permanentlyClosed, moved, hidden, blocked, unknown
- `CardSourceMode`: live, approvedCache, community, sample
- `HalalDisplayState`: certified, merchantClaimed, communityReported, unknown, possibleNonHalal, recheckRequired, none

Getter kunci kejujuran:
- `CardRatingModel.hasRating => rating != null && rating! > 0` (menyembunyikan 0.0)
- `CardHoursModel.isOpenNow => state == openNow` (tidak pernah dari unknown/expired)
- `CardPriceModel.isUnknown / isEstimated`
- `PlaceCardViewModel.matchScore` — **hanya** diisi bila dibekalkan respons cadangan (Part 2); TIDAK dikira di sini.

---

## 4. Penyesuai legasi — kompromi didokumen (`place_card_adapter.dart`)

`PlaceSummary` tidak dapat membezakan "0 sebenar" daripada "data hilang", jadi
penyesuai memilih tafsiran **paling berhati-hati**:

1. `rating <= 0` → `CardRatingModel.none` (sembunyi).
2. `priceEstimate` kosong → `unknown`; ada nilai → `estimatedRange` (label "Anggaran", bukan verified).
3. `isOpen == false` → `closedNow`; `isOpen == true` → `hoursUnknown` (BUKAN openNow).
4. `matchScore` dipetakan **hanya** bila `PlaceCardAdapterOptions.fromRecommendation == true`.
5. `negativeSignals` → `CardWarning` jujur (alahan/halal/harga) dengan severiti.
6. Halal: `possible_non_halal` → `possibleNonHalal`; jika tiada bukti → `none` (tiada dakwaan).
7. `isSample` → `CardSourceMode.sample` → `CardActionConfig.sampleOnly` (tiada tindakan live).
8. Sumber `firestore_cache` → `approvedCache`; `community` → `community`; lain → `live`.

---

## 5. Varian kad (`place_cards.dart`)

| Widget | Konteks | Struktur |
|--------|---------|----------|
| `CanonicalNearbyCard` | Home "Berdekatan" | kad mendatar, imej 120dp |
| `CanonicalAiPickCard` | Home "Pilihan AI" | kad hero, imej 170dp, tindakan penuh |
| `CanonicalSuggestionCard` | Cadangan (Terima/Tolak/Seterusnya) | delegat AI Pick + tindakan cadangan |
| `CanonicalExploreListCard` | Baris senarai Explore | imej 72dp + butiran |
| `CanonicalExploreGridCard` | Sel grid Explore | AspectRatio 1.4 |
| `CanonicalMapPreviewCard` | Pratonton peta | padat, imej 56dp |

Semua guna token tema (`context.mm`) — **tiada** warna hardcode; sokong light + dark.
Status + fakta ringkas dipapar dalam `Wrap` (bukan `Row`) supaya **tiada overflow**
pada lebar sempit.

---

## 6. Lokalisasi

26 kunci baharu × 4 bahasa (ms/en/zh/ta) disebar ke `AppLocalizations` melalui
`...kPlaceCardStrings{Ms,En,Zh,Ta}` (pola sama seperti sport strings). Semua kunci
mempunyai nilai bukan kosong dan berbeza daripada nama kunci. Jumlah kunci l10n:
1320 → **1346** (pariti penuh 4 bahasa; gate `typography_qa_test` dikemas kini).

---

## 7. Keselamatan integrasi

- Flag `canonicalCardsEnabled` **default OFF** — laluan legasi kekal & selamat.
- **Tiada** skrin produksi disambung semula (tiada import kad kanonikal ke laluan baca produksi).
- Rollback = tetapkan semula flag; kedua-dua laluan diliputi ujian.
- Tiada perubahan skor/mood/Food Memory/Fit/ranking. Tiada tulisan `place_registry`. Tiada deploy.

---

## 8. Keputusan pengesahan

| Semakan | Keputusan |
|---------|-----------|
| `flutter analyze` (seluruh projek) | **No issues found** |
| `flutter test` (seluruh suite) | **494 lulus** (450 → +44 baharu) |
| `test/place_cards_test.dart` | **44 lulus** |
| Backend `tsc -p tsconfig.json --noEmit` | **EXIT 0** |
| Backend `npm run test` (deterministik) | **358 lulus / 0 gagal** |
| Control Center `npm run typecheck` | **EXIT 0** |

Tiada fail backend/Control Center diubah dalam fasa ini (Flutter sahaja); semakan
di atas mengesahkan tiada regresi.
