// Restaurant Detail redesign (Image 3) — legacy production path.
//
// Renders the REAL RestaurantDetailScreen without Firebase (data providers
// no-op safely when firebaseReady=false; only currentSuggestionProvider is
// seeded with a fixture). Verifies the PDF's minimum regression set: hero,
// authoritative match badge gating, honest rating/open display, icon-only
// action row (no visible text labels, tooltips+semantics for all 6), reviews +
// location sections, diagnostics hidden by default, and no overflow across
// 360/412 × scale 1.0/1.3 × Bright/Dark. A source guard locks the 6 callbacks.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/core/widgets/location_preview_card.dart';
import 'package:makan_mana/core/widgets/place_image.dart';
import 'package:makan_mana/features/place_migration/cohort_diagnostics_overlay.dart';
import 'package:makan_mana/features/restaurant/restaurant_detail_screen.dart';
import 'package:makan_mana/models/place_summary.dart';
import 'package:shared_preferences/shared_preferences.dart';

String _en(String k) => AppLocalizations(const Locale('en')).t(k);

PlaceSummary _place({
  String id = 'stable-place-1',
  String name = 'Nasi Kandar Pelita',
  double rating = 4.3,
  int ratingCount = 88,
  int matchScore = 92,
  bool isOpen = true,
  String priceEstimate = 'RM10 - RM15',
  String? photoUrl,
  List<String> reasons = const ['withinBudget', 'nearYou'],
}) =>
    PlaceSummary(
      placeId: id,
      name: name,
      cuisine: 'Mamak',
      emoji: '🍛',
      rating: rating,
      userRatingCount: ratingCount,
      priceLevel: 2,
      distanceKm: 1.4,
      isOpen: isOpen,
      address: 'Jalan Ampang, 55000 Kuala Lumpur',
      matchScore: matchScore,
      matchReasonKeys: reasons,
      priceEstimate: priceEstimate,
      photoUrl: photoUrl,
    );

Widget _host(
  PlaceSummary place,
  SharedPreferences prefs, {
  bool dark = false,
  double width = 412,
  double scale = 1.0,
}) {
  return ProviderScope(
    overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      currentSuggestionProvider.overrideWith((ref) => place),
    ],
    child: MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: dark ? ThemeMode.dark : ThemeMode.light,
      locale: const Locale('en'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: MediaQuery(
        data: MediaQueryData(
          size: Size(width, 920),
          textScaler: TextScaler.linear(scale),
        ),
        child: RestaurantDetailScreen(placeId: place.placeId),
      ),
    ),
  );
}

Future<void> _pump(WidgetTester t, Widget w) async {
  await t.pumpWidget(w);
  await t.pump();
  await t.pump(const Duration(milliseconds: 200));
}

void main() {
  late SharedPreferences prefs;
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  testWidgets('renders: hero + name + reviews + location sections',
      (t) async {
    await _pump(t, _host(_place(), prefs));
    expect(t.takeException(), isNull);
    expect(find.text('Nasi Kandar Pelita'), findsWidgets); // appbar + title
    expect(find.byType(PlaceImage), findsOneWidget); // hero (honest image)
    expect(find.text(_en('reviewsTitle')), findsOneWidget);
    expect(find.byType(LocationPreviewCard), findsOneWidget);
  });

  testWidgets('placeholder hero renders when no photo (honest fallback)',
      (t) async {
    await _pump(t, _host(_place(photoUrl: null), prefs));
    expect(find.byType(PlaceImage), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('match badge present with authoritative score', (t) async {
    await _pump(t, _host(_place(matchScore: 92), prefs));
    expect(find.text('92% ${_en('matchLabel')}'), findsOneWidget);
  });

  testWidgets('match badge ABSENT when no authoritative score', (t) async {
    await _pump(t, _host(_place(matchScore: 0), prefs));
    expect(find.textContaining('% ${_en('matchLabel')}'), findsNothing);
    expect(find.textContaining('96%'), findsNothing); // never hardcoded
  });

  testWidgets('honest rating: missing rating is NOT shown as 0.0', (t) async {
    await _pump(t, _host(_place(rating: 0, ratingCount: 0), prefs));
    expect(find.textContaining('0.0'), findsNothing);
    expect(find.textContaining('(0)'), findsNothing);
    expect(t.takeException(), isNull);
  });

  testWidgets('honest open: not-open place is NOT labelled Open now', (t) async {
    await _pump(t, _host(_place(isOpen: false), prefs));
    expect(find.text(_en('openNow')), findsNothing);
  });

  testWidgets('icon-only action row: tooltips+semantics for all 6, no labels',
      (t) async {
    await _pump(t, _host(_place(), prefs));
    // All six actions expose a Tooltip (== accessibility semantics label).
    for (final key in const [
      'openMap',
      'save',
      'share',
      'checkinAction',
      'deliveryRate',
      'logSpendToWallet',
    ]) {
      expect(find.byTooltip(_en(key)), findsOneWidget, reason: 'tooltip $key');
    }
    // No VISIBLE text labels next to the ACTION-ROW icons (icon-only).
    // (Note: the separate Location card keeps its own labelled Open-Maps
    // button per Image 3, so 'openMap' text may legitimately exist there.)
    expect(find.text(_en('logSpendToWallet')), findsNothing);
    expect(find.text(_en('deliveryRate')), findsNothing);
    expect(find.text(_en('checkinAction')), findsNothing);
  });

  testWidgets('diagnostics overlay hidden by default (clean presentation)',
      (t) async {
    await _pump(t, _host(_place(), prefs));
    expect(find.byType(CohortDiagnosticsOverlay), findsNothing);
    expect(find.textContaining('CANONICAL COHORT DIAG'), findsNothing);
  });

  for (final width in const [360.0, 412.0]) {
    for (final scale in const [1.0, 1.3]) {
      for (final dark in const [false, true]) {
        final tag = '${width.toInt()}dp s$scale ${dark ? 'Dark' : 'Bright'}';
        testWidgets('no overflow: $tag', (t) async {
          await t.binding.setSurfaceSize(Size(width, 920));
          addTearDown(() => t.binding.setSurfaceSize(null));
          await _pump(
            t,
            _host(_place(name: 'Restoran Nasi Ayam Penyet Istimewa Sedap Sekali',
                    photoUrl: null),
                prefs,
                dark: dark,
                width: width,
                scale: scale),
          );
          expect(t.takeException(), isNull, reason: 'overflow $tag');
          expect(find.byType(RestaurantDetailScreen), findsOneWidget);
        });
      }
    }
  }

  group('source guard — all 6 callbacks preserved + icon-only + diag gate', () {
    final src = File('lib/features/restaurant/restaurant_detail_screen.dart')
        .readAsStringSync();
    test('6 action callbacks unchanged', () {
      for (final needle in const [
        'openPlaceInMaps(ref, place',
        '_toggleFavorite(place',
        '_share(context, place)',
        '_checkIn(place)',
        "_rate(place, 'delivery')",
        '_logMeal(place)',
      ]) {
        expect(src.contains(needle), isTrue, reason: 'hilang: $needle');
      }
    });
    test('icon-only presentation (no old text buttons in legacy path)', () {
      expect(src.contains('_IconAction('), isTrue);
      expect(src.contains("label: Text(l.t('openMap'))"), isFalse);
      expect(src.contains("label: Text(l.t('logSpendToWallet')"), isFalse);
    });
    test('match badge gated on authoritative score (not hardcoded)', () {
      expect(src.contains('place.matchScore > 0'), isTrue);
      expect(src.contains('96%'), isFalse);
    });
    test('diagnostics gated behind explicit flag', () {
      expect(src.contains('cohortDiagnosticsVisible'), isTrue);
      expect(src.contains('kDebugMode &&'), isTrue);
    });
  });
}

