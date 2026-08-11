import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/localization/restaurant_detail_strings.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/features/restaurant/canonical/canonical_restaurant_detail_screen.dart';
import 'package:makan_mana/features/restaurant/canonical/restaurant_detail_adapter.dart';
import 'package:makan_mana/features/restaurant/canonical/restaurant_detail_flags.dart';
import 'package:makan_mana/features/restaurant/canonical/restaurant_detail_view_model.dart';
import 'package:makan_mana/models/place_summary.dart';

/// PART 1 Phase 1.10 — ujian Butiran Kedai kanonikal.

String _en(String key) => AppLocalizations(const Locale('en')).t(key);

Widget _host(Widget child,
        {bool dark = false, String lang = 'en', double width = 390, double scale = 1.0}) =>
    MaterialApp(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: dark ? ThemeMode.dark : ThemeMode.light,
      locale: Locale(lang),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: MediaQuery(
        data: MediaQueryData(
          size: Size(width, 900),
          textScaler: TextScaler.linear(scale),
        ),
        child: child,
      ),
    );

Future<void> _pump(WidgetTester t, Widget child,
    {bool dark = false, String lang = 'en', double width = 390, double scale = 1.0}) async {
  await t.pumpWidget(_host(child, dark: dark, lang: lang, width: width, scale: scale));
  await t.pump();
}

PlaceSummary _summary({
  double rating = 4.3,
  int ratingCount = 88,
  bool isOpen = true,
  String priceEstimate = 'RM10-RM15',
  List<String> negativeSignals = const [],
  String? photoUrl,
  String? source,
  String address = 'Jalan Ampang 55000 Kuala Lumpur Wilayah Persekutuan Malaysia',
}) =>
    PlaceSummary(
      placeId: 'stable-place-123',
      name: 'Nasi Kandar Pelita',
      cuisine: 'Mamak',
      emoji: '🍛',
      rating: rating,
      userRatingCount: ratingCount,
      priceLevel: 2,
      distanceKm: 1.2,
      isOpen: isOpen,
      address: address,
      matchScore: 0,
      matchReasonKeys: const [],
      priceEstimate: priceEstimate,
      photoUrl: photoUrl,
      negativeSignals: negativeSignals,
      source: source,
    );

RestaurantDetailViewModel _vm({
  CardRatingModel? rating,
  int? reviewCount = 88,
  CardPriceModel price = const CardPriceModel(state: CardPriceState.estimatedRange, amountLabel: 'RM10-RM15'),
  CardHoursModel hours = const CardHoursModel(state: CardHoursState.hoursUnknown),
  CardBusinessState businessState = CardBusinessState.active,
  CardSourceMode sourceMode = CardSourceMode.live,
  HalalDisplayState halal = HalalDisplayState.none,
  List<DietarySuitability> dietary = const [],
  List<AllergenEvidence> allergens = const [],
  ContactInfo contact = ContactInfo.none,
  List<String> cuisineLabels = const ['Mamak'],
  List<String> extraTags = const [],
  DetailActionConfig? actions,
  FreshnessSummary freshness = FreshnessSummary.unknown,
  ProvenanceSummary? provenance,
  String address = 'Jalan Ampang 55000 Kuala Lumpur',
}) =>
    RestaurantDetailViewModel(
      placeId: 'stable-place-123',
      title: 'Nasi Kandar Pelita',
      subtitle: 'Mamak',
      sourceMode: sourceMode,
      gallery: const DetailGallery(
          images: [DetailImageItem(image: CardImageModel())]),
      businessState: businessState,
      hours: DetailHours(model: hours),
      rating: rating ?? const CardRatingModel(rating: 4.3, reviewCount: 88),
      reviewCount: reviewCount,
      price: price,
      location: LocationInfo(address: address, distanceMeters: 1200),
      contact: contact,
      cuisineLabels: cuisineLabels,
      healthTagIds: extraTags,
      dietaryStates: dietary,
      allergenStates: allergens,
      halalState: halal,
      actions: actions ??
          (sourceMode == CardSourceMode.sample
              ? DetailActionConfig.sampleOnly
              : const DetailActionConfig(
                  canOpenMaps: true, canSave: true, canShare: true, canLogMeal: true)),
      freshness: freshness,
      provenance: provenance ?? ProvenanceSummary(sourceMode: sourceMode),
    );

void main() {
  tearDown(RestaurantDetailFlags.resetToSafeDefault);

  // -------------------------------------------------------------------------
  group('Adapter legasi -> kanonikal (jujur)', () {
    test('placeId stabil dikekalkan', () {
      expect(restaurantDetailFromSummary(_summary()).placeId, 'stable-place-123');
    });

    test('rating <= 0 -> null', () {
      expect(restaurantDetailFromSummary(_summary(rating: 0)).rating.hasRating,
          isFalse);
    });

    test('review count 0 -> null', () {
      expect(
          restaurantDetailFromSummary(_summary(ratingCount: 0)).reviewCount, isNull);
    });

    test('isOpen true -> hoursUnknown (bukan open)', () {
      expect(restaurantDetailFromSummary(_summary(isOpen: true)).hours.model.state,
          CardHoursState.hoursUnknown);
    });

    test('priceEstimate kosong -> unknown', () {
      expect(restaurantDetailFromSummary(_summary(priceEstimate: '')).price.isUnknown,
          isTrue);
    });

    test('priceEstimate ada -> estimatedRange', () {
      expect(restaurantDetailFromSummary(_summary()).price.state,
          CardPriceState.estimatedRange);
    });

    test('tiada bukti halal -> none', () {
      expect(restaurantDetailFromSummary(_summary()).halalState,
          HalalDisplayState.none);
    });

    test('possible_non_halal -> possibleNonHalal + amaran', () {
      final vm = restaurantDetailFromSummary(
          _summary(negativeSignals: ['possible_non_halal']));
      expect(vm.halalState, HalalDisplayState.possibleNonHalal);
      expect(vm.warnings.any((w) => w.id == 'possible_non_halal'), isTrue);
    });

    test('allergy conflict -> allergen unknown (bukan selamat)', () {
      final vm = restaurantDetailFromSummary(
          _summary(negativeSignals: ['possible_allergy_conflict']));
      expect(vm.allergenStates.single.presence, AllergenPresence.unknown);
      expect(vm.allergenStates.single.provesAbsent, isFalse);
    });

    test('sample -> sourceMode sample + tiada tindakan live', () {
      final vm = restaurantDetailFromSummary(_summary(source: 'demo_preview'));
      expect(vm.sourceMode, CardSourceMode.sample);
      expect(vm.actions.canOpenMaps, isFalse);
    });

    test('approved cache -> verificationLevelKey', () {
      final vm = restaurantDetailFromSummary(_summary(source: 'firestore_cache'));
      expect(vm.provenance.verificationLevelKey, 'cachedApprovedLabel');
    });
  });

  // -------------------------------------------------------------------------
  group('View model — invarian keselamatan', () {
    test('allergen absent tanpa verified TIDAK membuktikan selamat', () {
      const a = AllergenEvidence(
          allergenId: 'peanut',
          presence: AllergenPresence.absent,
          evidence: EvidenceLevel.reported);
      expect(a.provesAbsent, isFalse);
    });

    test('allergen absent + verified membuktikan selamat', () {
      const a = AllergenEvidence(
          allergenId: 'peanut',
          presence: AllergenPresence.absent,
          evidence: EvidenceLevel.verified);
      expect(a.provesAbsent, isTrue);
    });

    test('dietary inferred tidak boleh dipromosi', () {
      expect(
          const DietarySuitability(tagId: 'vegan', evidence: EvidenceLevel.inferred)
              .isPromotable,
          isFalse);
    });

    test('venue permanently closed = inactive', () {
      expect(_vm(businessState: CardBusinessState.permanentlyClosed).isInactive,
          isTrue);
    });
  });

  // -------------------------------------------------------------------------
  group('Render — peraturan jujur', () {
    testWidgets('rating tiada -> "No rating", bukan 0.0', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(
          vm: _vm(rating: CardRatingModel.none, reviewCount: null)));
      expect(find.text(_en('ratingUnavailable')), findsWidgets);
      expect(find.textContaining('0.0'), findsNothing);
    });

    testWidgets('review count tiada -> "not enough reviews"', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(
          vm: _vm(rating: const CardRatingModel(rating: 4.1), reviewCount: null)));
      expect(find.text(_en('notEnoughReviews')), findsWidgets);
    });

    testWidgets('waktu unknown -> tidak papar "Open now"', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(vm: _vm()));
      expect(find.text(_en('openNow')), findsNothing);
      expect(find.text(_en('hoursUnknown')), findsWidgets);
    });

    testWidgets('waktu expired -> recheck, bukan open', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(
          vm: _vm(hours: const CardHoursModel(state: CardHoursState.hoursExpired))));
      expect(find.text(_en('openNow')), findsNothing);
      expect(find.text(_en('hoursExpired')), findsWidgets);
    });

    testWidgets('harga unknown -> unavailable', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(
          vm: _vm(price: CardPriceModel.unknown)));
      expect(find.text(_en('priceUnavailable')), findsWidgets);
    });

    testWidgets('harga estimasi -> label Estimated', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(vm: _vm()));
      expect(find.textContaining(_en('estimatedPrice')), findsWidgets);
    });

    testWidgets('harga expired -> recheck', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(
          vm: _vm(price: const CardPriceModel(state: CardPriceState.expired))));
      expect(find.text(_en('priceRecheck')), findsWidgets);
    });

    testWidgets('halal expired/recheck -> bukan certified', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(
          vm: _vm(halal: HalalDisplayState.recheckRequired)));
      expect(find.text(_en('halalCertified')), findsNothing);
      expect(find.text(_en('halalRecheck')), findsWidgets);
    });

    testWidgets('halal merchant claim -> bukan certified', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(
          vm: _vm(halal: HalalDisplayState.merchantClaimed)));
      expect(find.text(_en('halalCertified')), findsNothing);
      expect(find.text(_en('halalMerchantClaim')), findsWidgets);
    });

    testWidgets('halal community report -> bukan certified', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(
          vm: _vm(halal: HalalDisplayState.communityReported)));
      expect(find.text(_en('halalCertified')), findsNothing);
      expect(find.text(_en('halalCommunityReport')), findsWidgets);
    });

    testWidgets('halal certified -> certified (bukti disahkan)', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(
          vm: _vm(halal: HalalDisplayState.certified)));
      expect(find.text(_en('halalCertified')), findsWidgets);
    });

    testWidgets('allergen data tidak lengkap -> caution', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(
          vm: _vm(allergens: const [
        AllergenEvidence(
            allergenId: 'unspecified',
            presence: AllergenPresence.unknown,
            evidence: EvidenceLevel.inferred)
      ])));
      expect(find.text(_en('allergenCaution')), findsWidgets);
    });

    testWidgets('dietary inferred dilabel Inferred, bukan Verified', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(
          vm: _vm(dietary: const [
        DietarySuitability(tagId: 'Vegetarian', evidence: EvidenceLevel.inferred)
      ])));
      expect(find.textContaining(_en('dietInferred')), findsWidgets);
      expect(find.textContaining(_en('dietVerified')), findsNothing);
    });
  });

  // -------------------------------------------------------------------------
  group('Status perniagaan', () {
    testWidgets('temporarily closed -> banner', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(
          vm: _vm(businessState: CardBusinessState.temporarilyClosed)));
      expect(find.text(_en('tempClosed')), findsWidgets);
    });

    testWidgets('permanently closed -> keadaan kuat', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(
          vm: _vm(businessState: CardBusinessState.permanentlyClosed)));
      expect(find.text(_en('permClosed')), findsWidgets);
    });
  });

  // -------------------------------------------------------------------------
  group('Sample, lokasi, hubungan, provenans', () {
    testWidgets('sample -> label kelihatan', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(
          vm: _vm(sourceMode: CardSourceMode.sample)));
      expect(find.text(_en('sampleDataLabel')), findsWidgets);
    });

    testWidgets('sample -> tindakan maps dimatikan', (t) async {
      var tapped = false;
      await _pump(t, CanonicalRestaurantDetailScreen(
        vm: _vm(sourceMode: CardSourceMode.sample),
        callbacks: RestaurantDetailCallbacks(onOpenMaps: () => tapped = true),
      ));
      // Tiada butang maps live untuk sample.
      final maps = find.widgetWithText(FilledButton, _en('openMap'));
      expect(maps, findsNothing);
      expect(tapped, isFalse);
    });

    testWidgets('alamat panjang membalut (tiada overflow)', (t) async {
      await _pump(
          t, CanonicalRestaurantDetailScreen(vm: _vm()),
          width: 320);
      expect(t.takeException(), isNull);
      expect(find.textContaining('Jalan Ampang'), findsWidgets);
    });

    testWidgets('telefon disembunyi bila tiada', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(vm: _vm()));
      expect(find.widgetWithText(OutlinedButton, _en('callAction')), findsNothing);
      expect(find.text(_en('contactUnavailable')), findsWidgets);
    });

    testWidgets('laman web disembunyi bila tiada', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(vm: _vm()));
      expect(find.widgetWithText(OutlinedButton, _en('websiteAction')), findsNothing);
    });

    testWidgets('telefon & web dipapar bila ada', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(
          vm: _vm(
              contact: const ContactInfo(
                  phone: '+60312345678', website: 'https://pelita.com'))));
      expect(find.widgetWithText(OutlinedButton, _en('callAction')), findsWidgets);
      expect(find.widgetWithText(OutlinedButton, _en('websiteAction')), findsWidgets);
    });

    testWidgets('approved-cache label dipapar', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(
          vm: _vm(sourceMode: CardSourceMode.approvedCache)));
      expect(find.text(_en('cachedApprovedLabel')), findsWidgets);
    });

    testWidgets('freshness expired -> amaran recheck', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(
          vm: _vm(freshness: const FreshnessSummary(state: FreshnessState.expired))));
      expect(find.text(_en('freshnessExpired')), findsWidgets);
    });

    testWidgets('provenans tidak dedah medan dalaman (UID/audit)', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(
          vm: _vm(
              provenance: const ProvenanceSummary(
                  sourceMode: CardSourceMode.approvedCache,
                  lastUpdatedLabel: '2 hari lalu'))));
      expect(find.textContaining('uid'), findsNothing);
      expect(find.textContaining('audit'), findsNothing);
      expect(find.text(_en('lastUpdated')), findsWidgets);
    });
  });

  // -------------------------------------------------------------------------
  group('Tag & tindakan', () {
    testWidgets('tag localize & pendua dibuang', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(
          vm: _vm(cuisineLabels: const ['Nasi', 'Nasi'], extraTags: const ['Halal'])));
      expect(find.text('Nasi'), findsOneWidget); // pendua dibuang (subtitle = Mamak)
      expect(find.text('Halal'), findsWidgets);
    });

    testWidgets('show more untuk tag banyak', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(
          vm: _vm(
              cuisineLabels: const ['a', 'b', 'c', 'd'],
              extraTags: const ['e', 'f', 'g', 'h'])));
      final more = find.text(_en('showMore'));
      expect(more, findsOneWidget);
      await t.ensureVisible(more);
      await t.tap(more);
      await t.pump();
      expect(find.text(_en('showLess')), findsOneWidget);
    });

    testWidgets('maps action guna callback (placeId stabil di vm)', (t) async {
      var count = 0;
      final vm = _vm();
      await _pump(t, CanonicalRestaurantDetailScreen(
        vm: vm,
        callbacks: RestaurantDetailCallbacks(onOpenMaps: () => count++),
      ));
      final maps = find.widgetWithText(FilledButton, _en('openMap')).first;
      await t.ensureVisible(maps);
      await t.tap(maps);
      await t.pump();
      expect(count, 1);
      expect(vm.placeId, 'stable-place-123');
    });

    testWidgets('hantar-dua-kali dicegah', (t) async {
      var count = 0;
      await _pump(t, CanonicalRestaurantDetailScreen(
        vm: _vm(),
        callbacks: RestaurantDetailCallbacks(onSave: () => count++),
      ));
      final save = find.widgetWithText(OutlinedButton, _en('save')).first;
      await t.ensureVisible(save);
      await t.tap(save);
      await t.tap(save);
      await t.pump();
      expect(count, 1);
    });
  });

  // -------------------------------------------------------------------------
  group('Keadaan UI peringkat skrin', () {
    testWidgets('loading render', (t) async {
      await _pump(t, const RestaurantDetailLoading());
      expect(t.takeException(), isNull);
    });

    testWidgets('missing id render', (t) async {
      await _pump(t, const RestaurantDetailMissingId());
      expect(find.text(_en('missingPlaceId')), findsOneWidget);
    });

    testWidgets('not found render', (t) async {
      await _pump(t, const RestaurantDetailNotFound());
      expect(find.text(_en('detailNotFound')), findsOneWidget);
    });

    testWidgets('generic fallback image (tiada foto)', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(vm: _vm()));
      expect(t.takeException(), isNull); // monogram fallback, tiada ikon rosak
    });
  });

  // -------------------------------------------------------------------------
  group('Responsif & aksesibiliti', () {
    for (final w in [320.0, 360.0, 390.0, 800.0]) {
      testWidgets('tiada overflow @ ${w.toInt()}dp', (t) async {
        await _pump(t, CanonicalRestaurantDetailScreen(vm: _vm()), width: w);
        expect(t.takeException(), isNull);
      });
    }

    testWidgets('skala teks 1.6 tiada overflow', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(vm: _vm()),
          width: 360, scale: 1.6);
      expect(t.takeException(), isNull);
    });

    testWidgets('mod terang & gelap render', (t) async {
      await _pump(t, CanonicalRestaurantDetailScreen(vm: _vm()), dark: false);
      expect(t.takeException(), isNull);
      await _pump(t, CanonicalRestaurantDetailScreen(vm: _vm()), dark: true);
      expect(t.takeException(), isNull);
    });

    testWidgets('label semantik imej wujud', (t) async {
      final handle = t.ensureSemantics();
      await _pump(t, CanonicalRestaurantDetailScreen(vm: _vm()));
      // Label imej boleh bergabung dengan teks monogram — padan substring.
      expect(find.bySemanticsLabel(RegExp(_en('placePhotoSemantic'))),
          findsWidgets);
      handle.dispose();
    });
  });

  // -------------------------------------------------------------------------
  group('Flag & l10n', () {
    test('flag default OFF', () {
      RestaurantDetailFlags.resetToSafeDefault();
      expect(RestaurantDetailFlags.canonicalRestaurantDetailEnabled, isFalse);
    });

    test('flag boleh diaktif dalam ujian + reset', () {
      RestaurantDetailFlags.canonicalRestaurantDetailEnabled = true;
      expect(RestaurantDetailFlags.canonicalRestaurantDetailEnabled, isTrue);
      RestaurantDetailFlags.resetToSafeDefault();
      expect(RestaurantDetailFlags.canonicalRestaurantDetailEnabled, isFalse);
    });

    test('pariti l10n 4 bahasa', () {
      final keys = kRestaurantDetailStringsMs.keys.toSet();
      for (final m in [
        kRestaurantDetailStringsMs,
        kRestaurantDetailStringsEn,
        kRestaurantDetailStringsZh,
        kRestaurantDetailStringsTa,
      ]) {
        expect(m.keys.toSet(), keys);
        for (final e in m.entries) {
          expect(e.value.trim().isNotEmpty, isTrue, reason: e.key);
          expect(e.value == e.key, isFalse, reason: e.key);
        }
      }
      for (final k in keys) {
        expect(AppLocalizations.hasKey(k), isTrue, reason: k);
      }
    });
  });
}
