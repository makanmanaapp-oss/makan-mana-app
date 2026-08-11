// Explore redesign (Image 2) — presentation-only.
//
// Two layers: (1) the full ExploreScreen renders clean (no diagnostics by
// default, Trending pill, search, chips, cards from the honest dummy fallback);
// (2) ExplorePlaceCard unit checks for the critical requirements — full name up
// to 2 lines, honest rating/distance/review-count, tap route, and no overflow
// across 360/412 × scale 1.0/1.3 × Bright/Dark. A source guard locks the
// preserved providers/route + the diagnostics gate.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/core/widgets/place_image.dart';
import 'package:makan_mana/features/explore/explore_flags.dart';
import 'package:makan_mana/features/explore/explore_screen.dart';
import 'package:makan_mana/models/place_summary.dart';
import 'package:shared_preferences/shared_preferences.dart';

String _en(String k) => AppLocalizations(const Locale('en')).t(k);

PlaceSummary _place({
  String id = 'p1',
  String name = 'Sambal Bakar Malaya Puncak Alam Cawangan Utama',
  String cuisine = 'Malaysian restaurant',
  double rating = 4.6,
  int ratingCount = 2456,
  double distanceKm = 1.2,
  String? photoUrl,
}) =>
    PlaceSummary(
      placeId: id,
      name: name,
      cuisine: cuisine,
      emoji: '🍢',
      rating: rating,
      userRatingCount: ratingCount,
      priceLevel: 2,
      distanceKm: distanceKm,
      isOpen: true,
      address: 'Jalan Test',
      matchScore: 0,
      matchReasonKeys: const [],
      photoUrl: photoUrl,
    );

Widget _card(
  PlaceSummary place, {
  bool dark = false,
  double width = 412,
  double scale = 1.0,
}) {
  return ProviderScope(
    child: MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: dark ? AppTheme.dark() : AppTheme.light(),
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
          size: Size(width, 900),
          textScaler: TextScaler.linear(scale),
        ),
        child: Scaffold(
          backgroundColor: const Color(0xFFFDF8F4),
          body: Align(
            alignment: Alignment.topCenter,
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: ExplorePlaceCard(place: place),
            ),
          ),
        ),
      ),
    ),
  );
}

Widget _screen(SharedPreferences prefs, {bool dark = false}) {
  return ProviderScope(
    overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
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
      home: const MediaQuery(
        data: MediaQueryData(size: Size(412, 900)),
        child: ExploreScreen(),
      ),
    ),
  );
}

void main() {
  setUp(() => ExploreFlags.resetToSafeDefault());

  group('ExploreScreen (full)', () {
    late SharedPreferences prefs;
    setUpAll(() async {
      SharedPreferences.setMockInitialValues({});
      prefs = await SharedPreferences.getInstance();
    });

    testWidgets('renders clean: title, Trending pill, search — no diagnostics',
        (t) async {
      await t.pumpWidget(_screen(prefs));
      await t.pump();
      await t.pump(const Duration(milliseconds: 200));
      expect(t.takeException(), isNull);
      expect(find.text('Explore'), findsOneWidget);
      expect(find.byTooltip(_en('trending')), findsOneWidget);
      expect(find.byType(TextField), findsOneWidget); // search bar
      // Diagnostics OFF by default → no monospace BUILD block.
      expect(find.textContaining('BUILD '), findsNothing);
      expect(find.textContaining('cohortEligible'), findsNothing);
      // Cards present (honest dummy fallback).
      expect(find.byType(ExplorePlaceCard), findsWidgets);
    });
  });

  group('ExplorePlaceCard — name + honest metadata', () {
    testWidgets('long name uses up to 2 lines (not single-line truncation)',
        (t) async {
      await t.pumpWidget(_card(_place()));
      await t.pump();
      final nameFinder = find.text(
          'Sambal Bakar Malaya Puncak Alam Cawangan Utama');
      expect(nameFinder, findsOneWidget);
      final nameWidget = t.widget<Text>(nameFinder);
      expect(nameWidget.maxLines, 2);
      expect(nameWidget.overflow, TextOverflow.ellipsis);
    });

    testWidgets('common names render in full', (t) async {
      for (final n in const [
        'Budu Poyok Corner',
        'Andra by Gula Cakery',
        'P&C Kitchen Restaurant',
        'Restoran BangSudu',
      ]) {
        await t.pumpWidget(_card(_place(name: n)));
        await t.pump();
        expect(find.text(n), findsOneWidget, reason: n);
      }
    });

    testWidgets('rating + review count + distance shown when present',
        (t) async {
      await t.pumpWidget(_card(_place(rating: 4.6, ratingCount: 2456, distanceKm: 1.2)));
      await t.pump();
      expect(find.byIcon(Icons.star_rounded), findsOneWidget);
      expect(find.textContaining('4.6 (2456)'), findsOneWidget);
      expect(find.textContaining('1.2 km'), findsOneWidget);
    });

    testWidgets('honest: missing rating → no star, no 0.0', (t) async {
      await t.pumpWidget(_card(_place(rating: 0, ratingCount: 0, distanceKm: 1.2)));
      await t.pump();
      expect(find.byIcon(Icons.star_rounded), findsNothing);
      expect(find.textContaining('0.0'), findsNothing);
      expect(find.textContaining('1.2 km'), findsOneWidget); // remaining field
    });

    testWidgets('honest: missing distance → no 0.0 km', (t) async {
      await t.pumpWidget(_card(_place(rating: 4.2, ratingCount: 10, distanceKm: 0)));
      await t.pump();
      expect(find.textContaining('0.0 km'), findsNothing);
      expect(find.textContaining('4.2 (10)'), findsOneWidget);
    });

    testWidgets('review count not fabricated when zero', (t) async {
      await t.pumpWidget(_card(_place(rating: 4.2, ratingCount: 0, distanceKm: 1.0)));
      await t.pump();
      expect(find.textContaining('(0)'), findsNothing);
      expect(find.textContaining('4.2'), findsOneWidget);
    });

    testWidgets('hero renders (photo or honest monogram fallback)', (t) async {
      await t.pumpWidget(_card(_place(photoUrl: null)));
      await t.pump();
      expect(find.byType(PlaceImage), findsOneWidget);
      expect(t.takeException(), isNull);
    });

    testWidgets('card is tappable + keeps chevron', (t) async {
      await t.pumpWidget(_card(_place()));
      await t.pump();
      expect(find.byType(InkWell), findsWidgets);
      expect(find.byIcon(Icons.chevron_right), findsOneWidget);
    });
  });

  group('ExplorePlaceCard — responsive (no overflow)', () {
    for (final width in const [360.0, 412.0]) {
      for (final scale in const [1.0, 1.3]) {
        for (final dark in const [false, true]) {
          final tag =
              '${width.toInt()}dp s$scale ${dark ? 'Dark' : 'Bright'}';
          testWidgets('no overflow: $tag', (t) async {
            await t.binding.setSurfaceSize(Size(width, 900));
            addTearDown(() => t.binding.setSurfaceSize(null));
            await t.pumpWidget(_card(_place(), dark: dark, width: width, scale: scale));
            await t.pump();
            expect(t.takeException(), isNull, reason: 'overflow $tag');
            expect(find.byType(ExplorePlaceCard), findsOneWidget);
          });
        }
      }
    }
  });

  group('source guard — logic preserved + diagnostics gated', () {
    final src =
        File('lib/features/explore/explore_screen.dart').readAsStringSync();
    test('providers / filters / pagination preserved', () {
      for (final n in const [
        'explorePaginationProvider',
        'loadFirst()',
        'loadMore()',
        '.refresh()',
        '_cuisineFilter',
        'onChanged: (v) => setState(() => _query = v)',
        'dummySuggestionServiceProvider',
      ]) {
        expect(src.contains(n), isTrue, reason: 'hilang: $n');
      }
    });
    test('card tap → existing Restaurant Detail route (unchanged)', () {
      expect(src.contains("context.push('/restaurant/\${place.placeId}')"),
          isTrue);
      expect(src.contains('currentSuggestionProvider.notifier).state = place'),
          isTrue);
    });
    test('Trending pill preserves social callback (no fake backend)', () {
      expect(src.contains('_TrendingPill(onTap: () => context.push(RoutePaths.social))'),
          isTrue);
    });
    test('diagnostics gated behind flag (default clean)', () {
      expect(src.contains('kDebugMode && ExploreFlags.diagnosticsVisible'),
          isTrue);
    });
    test('name uses maxLines: 2', () {
      expect(src.contains('maxLines: 2'), isTrue);
    });
  });
}
