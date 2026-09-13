import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/widgets/place_image.dart';
import 'package:makan_mana/features/explore/explore_screen.dart';
import 'package:makan_mana/models/place_summary.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

PlaceSummary _place({
  String name = 'Kedai Makan Nama Panjang Sangat Sedap Dan Popular',
  double rating = 4.6,
  int reviews = 123,
  double distance = 1.2,
  String cuisine = 'Melayu',
  String? photoUrl,
}) =>
    PlaceSummary(
      placeId: 'p1',
      name: name,
      cuisine: cuisine,
      rating: rating,
      userRatingCount: reviews,
      priceLevel: 2,
      distanceKm: distance,
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
      theme: dark ? AppTheme.darkTheme : AppTheme.lightTheme,
      localizationsDelegates: const [AppLocalizations.delegate],
      supportedLocales: const [Locale('ms')],
      home: MediaQuery(
        data: MediaQueryData(
          size: Size(width, 900),
          textScaler: TextScaler.linear(scale),
        ),
        child: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(20),
            child: ExplorePlaceCard(place: place),
          ),
        ),
      ),
    ),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('ExplorePlaceCard — truthful metadata', () {
    testWidgets('rating + reviews + distance visible when authoritative', (t) async {
      await t.pumpWidget(_card(_place()));
      await t.pump();
      expect(find.text('4.6 (123)  •  1.2 km'), findsOneWidget);
      expect(find.byIcon(Icons.star_rounded), findsOneWidget);
      expect(t.takeException(), isNull);
    });

    testWidgets('rating hidden when zero', (t) async {
      await t.pumpWidget(_card(_place(rating: 0, reviews: 0)));
      await t.pump();
      expect(find.byIcon(Icons.star_rounded), findsNothing);
      expect(find.textContaining('0.0'), findsNothing);
      expect(find.text('1.2 km'), findsOneWidget);
      expect(t.takeException(), isNull);
    });

    testWidgets('distance hidden when zero', (t) async {
      await t.pumpWidget(_card(_place(distance: 0)));
      await t.pump();
      expect(find.textContaining('0.0 km'), findsNothing);
      expect(find.text('4.6 (123)'), findsOneWidget);
      expect(t.takeException(), isNull);
    });

    testWidgets('all metadata row hidden when both rating and distance unknown',
        (t) async {
      await t.pumpWidget(_card(_place(rating: 0, reviews: 0, distance: 0)));
      await t.pump();
      expect(find.byIcon(Icons.star_rounded), findsNothing);
      expect(find.textContaining('km'), findsNothing);
      expect(t.takeException(), isNull);
    });

    testWidgets('rating without reviews does not invent count', (t) async {
      await t.pumpWidget(_card(_place(reviews: 0)));
      await t.pump();
      expect(find.text('4.6  •  1.2 km'), findsOneWidget);
      expect(find.textContaining('(0)'), findsNothing);
      expect(t.takeException(), isNull);
    });
  });

  group('ExplorePlaceCard — content + image', () {
    testWidgets('name is present and constrained to two lines', (t) async {
      await t.pumpWidget(_card(_place()));
      await t.pump();
      final name = t.widget<Text>(find.text(
          'Kedai Makan Nama Panjang Sangat Sedap Dan Popular'));
      expect(name.maxLines, 2);
      expect(name.overflow, TextOverflow.ellipsis);
      expect(t.takeException(), isNull);
    });

    testWidgets('cuisine is shown', (t) async {
      await t.pumpWidget(_card(_place(cuisine: 'Mamak')));
      await t.pump();
      expect(find.text('Mamak'), findsOneWidget);
      expect(t.takeException(), isNull);
    });

    testWidgets('uses PlaceImage for honest real/monogram image handling', (t) async {
      await t.pumpWidget(_card(_place()));
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
    test('providers / filters / pagination + full-pool server search preserved', () {
      for (final n in const [
        'explorePaginationProvider',
        'loadFirst()',
        'loadMore()',
        '.refresh()',
        '_cuisineFilter',
        'setState(() => _query = v)',
        '.setSearchQuery(v)',
        'dummySuggestionServiceProvider',
      ]) {
        expect(src.contains(n), isTrue, reason: 'hilang: $n');
      }
    });
    test('card tap stores suggestion and routes by canonical identity when available', () {
      expect(src.contains('final routeId = place.canonicalPlaceId ?? place.placeId;'),
          isTrue);
      expect(src.contains("context.push('/restaurant/\$routeId')"), isTrue);
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