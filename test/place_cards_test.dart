import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/localization/place_card_strings.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/features/place_cards/place_card_adapter.dart';
import 'package:makan_mana/features/place_cards/place_card_flags.dart';
import 'package:makan_mana/features/place_cards/place_card_primitives.dart';
import 'package:makan_mana/features/place_cards/place_card_view_model.dart';
import 'package:makan_mana/features/place_cards/place_cards.dart';
import 'package:makan_mana/models/place_summary.dart';

/// PART 1 Phase 1.9 — ujian kad kedai kanonikal.
/// Fokus: peraturan JUJUR (rating/harga/waktu/halal), penyesuai legasi,
/// label sample, flag selamat, pariti l10n, dan render 6 varian kad.

String _en(String key) => AppLocalizations(const Locale('en')).t(key);

Widget _host(Widget child, {bool dark = false, String lang = 'en'}) =>
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
      home: Scaffold(
        body: Center(
          child: SingleChildScrollView(
            child: SizedBox(width: 320, child: child),
          ),
        ),
      ),
    );

/// Pam DUA kali: delegate l10n memuat secara async (bukan SynchronousFuture),
/// jadi frame pertama kosong sehingga localizations selesai dimuat.
Future<void> _pump(WidgetTester t, Widget child,
    {bool dark = false, String lang = 'en'}) async {
  await t.pumpWidget(_host(child, dark: dark, lang: lang));
  await t.pump();
}

PlaceSummary _summary({
  double rating = 4.3,
  int ratingCount = 88,
  bool isOpen = true,
  String priceEstimate = 'RM10-RM15',
  int matchScore = 0,
  List<String> matchReasonKeys = const [],
  List<String> negativeSignals = const [],
  String? photoUrl,
  String? source,
}) =>
    PlaceSummary(
      placeId: 'p1',
      name: 'Nasi Kandar Pelita',
      cuisine: 'Mamak',
      emoji: '🍛',
      rating: rating,
      userRatingCount: ratingCount,
      priceLevel: 2,
      distanceKm: 1.2,
      isOpen: isOpen,
      address: 'Jalan Ampang',
      matchScore: matchScore,
      matchReasonKeys: matchReasonKeys,
      priceEstimate: priceEstimate,
      photoUrl: photoUrl,
      negativeSignals: negativeSignals,
      source: source,
    );

void main() {
  tearDown(PlaceCardFlags.resetToSafeDefault);

  // -------------------------------------------------------------------------
  group('View model — peraturan jujur', () {
    test('rating tiada -> hasRating false (sembunyi 0.0)', () {
      expect(const CardRatingModel(rating: 0).hasRating, isFalse);
      expect(CardRatingModel.none.hasRating, isFalse);
      expect(const CardRatingModel(rating: 4.1).hasRating, isTrue);
    });

    test('rating negatif -> tidak dipapar', () {
      expect(const CardRatingModel(rating: -1).hasRating, isFalse);
    });

    test('lowEvidence bila ulasan sedikit', () {
      expect(const CardRatingModel(rating: 4.0, reviewCount: 2).lowEvidence,
          isTrue);
      expect(const CardRatingModel(rating: 4.0, reviewCount: 40).lowEvidence,
          isFalse);
    });

    test('harga unknown -> isUnknown', () {
      expect(CardPriceModel.unknown.isUnknown, isTrue);
      expect(
          const CardPriceModel(state: CardPriceState.estimatedRange)
              .isEstimated,
          isTrue);
    });

    test('waktu: openNow HANYA dari openNow, bukan unknown', () {
      expect(const CardHoursModel(state: CardHoursState.openNow).isOpenNow,
          isTrue);
      expect(CardHoursModel.unknown.isOpenNow, isFalse);
      expect(CardHoursModel.unknown.isUnknown, isTrue);
    });

    test('sample dikenal pasti', () {
      const vm = PlaceCardViewModel(
        placeId: 'x',
        title: 'X',
        image: CardImageModel(),
        rating: CardRatingModel.none,
        price: CardPriceModel.unknown,
        hours: CardHoursModel.unknown,
        sourceMode: CardSourceMode.sample,
      );
      expect(vm.isSample, isTrue);
      expect(vm.hasMatchScore, isFalse);
    });
  });

  // -------------------------------------------------------------------------
  group('Adapter legasi -> kanonikal', () {
    test('rating 0 -> null (data hilang, bukan 0 sebenar)', () {
      final vm = placeCardFromSummary(_summary(rating: 0));
      expect(vm.rating.hasRating, isFalse);
    });

    test('rating sah dipetakan + kiraan ulasan', () {
      final vm = placeCardFromSummary(_summary(rating: 4.3, ratingCount: 88));
      expect(vm.rating.rating, 4.3);
      expect(vm.rating.reviewCount, 88);
    });

    test('priceEstimate kosong -> unknown', () {
      final vm = placeCardFromSummary(_summary(priceEstimate: ''));
      expect(vm.price.isUnknown, isTrue);
    });

    test('priceEstimate ada -> estimatedRange (Anggaran, bukan verified)', () {
      final vm = placeCardFromSummary(_summary(priceEstimate: 'RM8-RM12'));
      expect(vm.price.state, CardPriceState.estimatedRange);
      expect(vm.price.amountLabel, 'RM8-RM12');
    });

    test('isOpen true -> hoursUnknown (JANGAN dakwa buka)', () {
      final vm = placeCardFromSummary(_summary(isOpen: true));
      expect(vm.hours.state, CardHoursState.hoursUnknown);
      expect(vm.hours.isOpenNow, isFalse);
    });

    test('isOpen false -> closedNow', () {
      final vm = placeCardFromSummary(_summary(isOpen: false));
      expect(vm.hours.state, CardHoursState.closedNow);
    });

    test('matchScore diabai kecuali fromRecommendation', () {
      final without = placeCardFromSummary(_summary(matchScore: 90));
      expect(without.hasMatchScore, isFalse);
      final withRec = placeCardFromSummary(
        _summary(matchScore: 90),
        options: const PlaceCardAdapterOptions(fromRecommendation: true),
      );
      expect(withRec.matchScore, 90);
    });

    test('negativeSignals -> warnings jujur', () {
      final vm = placeCardFromSummary(_summary(
          negativeSignals: ['possible_allergy_conflict', 'possible_non_halal']));
      final ids = vm.warnings.map((w) => w.id).toSet();
      expect(ids, containsAll(['possible_allergy_conflict', 'possible_non_halal']));
      expect(vm.halal, HalalDisplayState.possibleNonHalal);
    });

    test('halal none bila tiada bukti (JANGAN dakwa halal)', () {
      final vm = placeCardFromSummary(_summary());
      expect(vm.halal, HalalDisplayState.none);
    });

    test('source mode dipetakan', () {
      expect(placeCardFromSummary(_summary(source: 'firestore_cache')).sourceMode,
          CardSourceMode.approvedCache);
      expect(placeCardFromSummary(_summary(source: 'community')).sourceMode,
          CardSourceMode.community);
      expect(placeCardFromSummary(_summary(source: 'google_places')).sourceMode,
          CardSourceMode.live);
    });

    test('sample -> tiada tindakan live', () {
      final s = _summary().copyWithSource('demo_preview');
      expect(s.isSample, isTrue);
      final vm = placeCardFromSummary(s);
      expect(vm.sourceMode, CardSourceMode.sample);
      expect(vm.actions.canOpenMaps, isFalse);
      expect(vm.actions.canViewDetails, isFalse);
    });
  });

  // -------------------------------------------------------------------------
  group('Primitif — render jujur', () {
    testWidgets('rating tiada -> papar "No rating", bukan bintang', (t) async {
      await _pump(t, const PlaceRatingLabel(model: CardRatingModel.none));
      expect(find.text(_en('ratingUnavailable')), findsOneWidget);
      expect(find.byIcon(Icons.star_rounded), findsNothing);
    });

    testWidgets('rating sah -> papar nilai', (t) async {
      await _pump(t,
          const PlaceRatingLabel(model: CardRatingModel(rating: 4.2, reviewCount: 30)));
      expect(find.text('4.2'), findsOneWidget);
      expect(find.byIcon(Icons.star_rounded), findsOneWidget);
    });

    testWidgets('harga unknown -> papar "Price unavailable"', (t) async {
      await _pump(t, const PlacePriceLabel(model: CardPriceModel.unknown));
      expect(find.text(_en('priceUnavailable')), findsOneWidget);
    });

    testWidgets('waktu unknown -> "Hours not verified", bukan "Open"',
        (t) async {
      await _pump(t, const PlaceStatusChip(hours: CardHoursModel.unknown));
      expect(find.text(_en('hoursUnknown')), findsOneWidget);
      expect(find.text(_en('openNow')), findsNothing);
    });

    testWidgets('openNow -> papar "Open now"', (t) async {
      await _pump(t, const PlaceStatusChip(
          hours: CardHoursModel(state: CardHoursState.openNow)));
      expect(find.text(_en('openNow')), findsOneWidget);
    });

    testWidgets('halal none -> tiada badge', (t) async {
      await _pump(t, const PlaceVerificationBadges(halal: HalalDisplayState.none));
      expect(find.text(_en('halalCertified')), findsNothing);
      expect(find.text(_en('halalUnknown')), findsNothing);
    });

    testWidgets('halal certified -> badge disahkan', (t) async {
      await _pump(t,
          const PlaceVerificationBadges(halal: HalalDisplayState.certified));
      expect(find.text(_en('halalCertified')), findsOneWidget);
    });

    testWidgets('sample badge dilabel jelas', (t) async {
      await _pump(t, const PlaceCardSampleBadge(sourceMode: CardSourceMode.sample));
      expect(find.text(_en('samplePreview')), findsOneWidget);
    });

    testWidgets('live -> tiada badge sumber', (t) async {
      await _pump(t, const PlaceCardSampleBadge(sourceMode: CardSourceMode.live));
      expect(find.text(_en('samplePreview')), findsNothing);
      expect(find.text(_en('cachedApprovedLabel')), findsNothing);
    });
  });

  // -------------------------------------------------------------------------
  group('Kad kanonikal — render 6 varian (light + dark)', () {
    final vm = placeCardFromSummary(
      _summary(negativeSignals: ['price_unknown']),
      options: const PlaceCardAdapterOptions(fromRecommendation: true),
    );

    for (final dark in [false, true]) {
      final mode = dark ? 'dark' : 'light';
      testWidgets('Nearby render tanpa ralat ($mode)', (t) async {
        await _pump(t, CanonicalNearbyCard(vm: vm), dark: dark);
        expect(t.takeException(), isNull);
        expect(find.text('Nasi Kandar Pelita'), findsOneWidget);
      });

      testWidgets('AI Pick render tanpa ralat ($mode)', (t) async {
        await _pump(t, CanonicalAiPickCard(vm: vm), dark: dark);
        expect(find.text('Nasi Kandar Pelita'), findsWidgets);
      });

      testWidgets('Suggestion render tanpa ralat ($mode)', (t) async {
        await _pump(t, CanonicalSuggestionCard(vm: vm), dark: dark);
        expect(find.text('Nasi Kandar Pelita'), findsWidgets);
      });

      testWidgets('Explore list render tanpa ralat ($mode)', (t) async {
        await _pump(t, CanonicalExploreListCard(vm: vm), dark: dark);
        expect(find.text('Nasi Kandar Pelita'), findsOneWidget);
      });

      testWidgets('Explore grid render tanpa ralat ($mode)', (t) async {
        await _pump(t, CanonicalExploreGridCard(vm: vm), dark: dark);
        expect(find.text('Nasi Kandar Pelita'), findsOneWidget);
      });

      testWidgets('Map preview render tanpa ralat ($mode)', (t) async {
        await _pump(t, CanonicalMapPreviewCard(vm: vm), dark: dark);
        expect(find.text('Nasi Kandar Pelita'), findsOneWidget);
      });
    }

    testWidgets('kad tidak overflow pada lebar sempit', (t) async {
      await _pump(t, CanonicalExploreListCard(vm: vm));
      expect(t.takeException(), isNull);
    });
  });

  // -------------------------------------------------------------------------
  group('Flag keselamatan', () {
    test('default OFF', () {
      PlaceCardFlags.resetToSafeDefault();
      expect(PlaceCardFlags.canonicalCardsEnabled, isFalse);
    });

    test('reset kembali OFF', () {
      PlaceCardFlags.canonicalCardsEnabled = true;
      PlaceCardFlags.resetToSafeDefault();
      expect(PlaceCardFlags.canonicalCardsEnabled, isFalse);
    });
  });

  // -------------------------------------------------------------------------
  group('Pariti l10n kad', () {
    final keys = kPlaceCardStringsMs.keys.toSet();

    test('semua bahasa ada semua kunci kad', () {
      for (final m in [
        kPlaceCardStringsMs,
        kPlaceCardStringsEn,
        kPlaceCardStringsZh,
        kPlaceCardStringsTa,
      ]) {
        expect(m.keys.toSet(), keys);
      }
    });

    test('tiada nilai kosong / sama dengan kunci', () {
      for (final m in [
        kPlaceCardStringsMs,
        kPlaceCardStringsEn,
        kPlaceCardStringsZh,
        kPlaceCardStringsTa,
      ]) {
        for (final e in m.entries) {
          expect(e.value.trim().isNotEmpty, isTrue, reason: e.key);
          expect(e.value == e.key, isFalse, reason: e.key);
        }
      }
    });

    test('kunci disebar ke AppLocalizations', () {
      for (final k in keys) {
        expect(AppLocalizations.hasKey(k), isTrue, reason: k);
      }
    });
  });
}
