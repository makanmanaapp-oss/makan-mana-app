# MakanMana — PART 1 / Phase 1.10

## Model Butiran Kedai Kanonikal, Skrin Butiran Jujur & Migrasi Flutter Selamat-Legasi

Status: **SIAP — LULUS**. Aditif sahaja. Flag `canonicalRestaurantDetailEnabled` **default OFF**.

> **Laluan baca Butiran Kedai produksi kekal pada laluan backend legasi sedia ada.**
> Google Places → places_cache/place_details → PlaceCandidate/PlaceSummary → skrin
> Butiran Kedai legasi. Fasa ini TIDAK menukar sumber data produksi, TIDAK mengubah
> pemarkahan cadangan/Fit, dan TIDAK deploy.

---

## 1. RestaurantDetailViewModel
`lib/features/restaurant/canonical/restaurant_detail_view_model.dart`

Model paparan immutable tunggal. **Menggunakan semula** model paparan kad Phase 1.9
(`CardImageModel`, `CardRatingModel`, `CardPriceModel`, `CardHoursModel`,
`CardBusinessState`, `CardSourceMode`, `HalalDisplayState`, `CardWarning`,
`CardReason`, `CardBadge`) — tiada pertindihan kontrak.

Model detail-khusus baharu: `DetailGallery/DetailImageItem`, `DetailHours/DetailDayHours`,
`DietarySuitability`, `AllergenEvidence`, `DishHighlight`, `MenuSummary`, `LocationInfo`,
`ContactInfo`, `ProvenanceSummary`, `FreshnessSummary`, `DetailActionConfig`.

Enum: `EvidenceLevel` (verified/reported/inferred/unknown), `FreshnessState`,
`AllergenPresence`.

Invarian keselamatan (dikuatkuasa oleh getter):
- `CardRatingModel.hasRating` → sembunyi 0.0
- `AllergenEvidence.provesAbsent` → **hanya** absent + verified
- `DietarySuitability.isPromotable` → **bukan** untuk inferred
- `RestaurantDetailViewModel.isInactive` → blocked/hidden/perm-closed tidak nampak aktif

## 2. Penyesuai legasi
`restaurant_detail_adapter.dart` — 10 kompromi didokumen dalam fail:
rating≤0→null; count 0→null; harga kosong→unknown / ada→estimated;
isOpen true→hoursUnknown; isOpen false→closedNow; tiada bukti halal→none/possibleNonHalal;
konflik alergen→unknown+caution; tiada telefon/web→ContactInfo.none;
matchReasons hanya fromRecommendation; **placeId stabil dikekalkan**.

## 3. Struktur halaman
`canonical_restaurant_detail_screen.dart` — 20 seksyen (hero/galeri, identiti+status,
fakta ringkas, waktu, harga, penilaian/ulasan, masakan/jenis, hidangan, servis/suasana,
halal, pemakanan, alahan, tag kesihatan/pedas/porsi/laju, lokasi, hubungan,
pengesahan+sumber, kesegaran, provenans, tindakan, amaran sample). Seksyen kosong
**tidak** dipapar blank — keadaan kosong jujur diguna.

## 4. Imej/galeri
Keutamaan: imej diluluskan → provider → komuniti → ilustrasi kategori → fallback neutral.
Guna `PlaceCardImage`/`PlaceImage` (fallback monogram deterministik, tiada ikon rosak,
label semantik). Kiraan galeri dipapar bila > 1; sample bertanda.

## 5. Status perniagaan
active/temporarily_closed/permanently_closed/moved/hidden/blocked/status_unknown —
banner ikon+teks (bukan warna sahaja); perm-closed = keadaan kuat bersempadan;
blocked/hidden tidak nampak aktif; unknown tidak jadi "buka".

## 6. Waktu
Guna `CardHoursState` + `PlaceStatusChip`. Waktu hari ini + jadual mingguan boleh-kembang
+ "sah terakhir" + amaran recheck untuk expired. `open_now` tidak pernah dari unknown/expired.

## 7. Penilaian/ulasan
rating tiada → sembunyi nombor; count tiada → tiada rekaan; bukti rendah → "not enough reviews".
Tiada ulasan/sentimen palsu dicipta tempatan.

## 8. Harga
`PlacePriceLabel` — verified/estimated(berlabel)/band/unknown(unavailable)/expired(recheck).
Harga TIDAK disimpulkan dari masakan/kategori/kawasan.

## 9-11. Halal / Pemakanan / Alahan
- Halal via `PlaceVerificationBadges` — certified hanya dengan bukti sijil disahkan;
  merchant/community berlabel dakwaan/laporan; expired → recheck; unknown kekal unknown.
- Pemakanan ikut `EvidenceLevel` — inferred berlabel "Disimpulkan" (tidak dinaik taraf).
- Alahan — **tidak pernah "selamat" dari ketiadaan data**; tidak lengkap → caution.

## 12. Tag & hidangan
ID canonical dalaman; label dilokalkan; pendua dibuang; "Lihat lagi/kurang" boleh-kembang.

## 13. Lokasi & hubungan
Alamat penuh (membalut), jarak, tindakan Maps (placeId/koordinat stabil).
Telefon/web disembunyi bila tiada / "Tiada maklumat hubungan"; tiada butiran direka;
sample tidak boleh maps/call live.

## 14. Provenans & kesegaran (selamat-pengguna)
Mod sumber, kemas kini/sah terakhir, label approved-cache / community-reported, amaran recheck.
**TIDAK** dedah UID aktor, audit peribadi, payload import, nota admin.

## 15. Tindakan
Save/Share/OpenMaps/Call/Website/LogMeal/Rate/Accept/Reject/Back dipelihara.
Semua guna `placeId` stabil + sourceMode + suggestion/session ID bila ada.
Cegah hantar-dua-kali (kunci `_submitting`); tindakan live disekat untuk sample.

## 16. Feature flag
`RestaurantDetailFlags.canonicalRestaurantDetailEnabled` — **default OFF** +
`resetToSafeDefault()`. Skrin legasi kekal tersedia; rollback = tetapkan semula flag.

## 17. Keserasian navigasi
Gate di dalam `RestaurantDetailScreen.build`: kontrak laluan/deep-link `placeId` sama;
payload legasi diterima melalui adapter; ID tiada/tidak dijumpai → keadaan ralat, bukan crash.

## 18. Lokalisasi
42 kunci baharu × 4 bahasa (ms/en/zh/ta) via `restaurant_detail_strings.dart`
(kunci Phase 1.9 & `locationLabel` sedia ada diguna semula). Jumlah kunci: **1346 → 1388**,
pariti penuh.

## 19. Keadaan UI
loading/skeleton, no-image, partial, no-rating, no-price, no-hours, stale, expired,
temp/perm-closed, moved, blocked, sample, approved-cache, error, missing-id, not-found —
tiada skrin blank.

## 20. Aksesibiliti & responsif
320/360/390/tablet, skala teks 1.0–1.6, terang/gelap, label semantik imej,
status bukan warna-sahaja, seksyen boleh-kembang, tiada overflow mendatar, teks membalut.

## 21. Ujian
`test/restaurant_detail_test.dart` — **57 ujian** (adapter jujur, invarian keselamatan,
render halal/harga/waktu/alahan/diet, status perniagaan, sample, provenans selamat,
tag/tindakan, keadaan UI, responsif/a11y, flag, pariti l10n).

## 22. Pernyataan eksplisit
**The production restaurant-detail read path remains on the existing legacy backend path.**
Tiada suis baca produksi, tiada perubahan pemarkahan, tiada migrasi, tiada deploy.
