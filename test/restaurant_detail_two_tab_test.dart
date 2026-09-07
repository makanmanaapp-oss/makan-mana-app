import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/features/restaurant/canonical/canonical_restaurant_detail_screen.dart';
import 'package:makan_mana/features/restaurant/canonical/restaurant_detail_flags.dart';
import 'package:makan_mana/features/restaurant/canonical/restaurant_detail_view_model.dart';

/// WAVE 3 GATE 3F — two-tab Restaurant Detail (Profil & Ulasan | Menu).
void main() {
  String read(String path) =>
      File(path).readAsStringSync().replaceAll('\r\n', '\n');

  String ms(String key) => AppLocalizations(const Locale('ms')).t(key);

  DetailMenuItem menuItem({
    required String id,
    required String name,
    String section = 'makanan',
    String? category,
    double? price,
    bool available = true,
  }) =>
      DetailMenuItem(
        id: id,
        section: section,
        name: name,
        category: category,
        price: price,
        available: available,
      );

  RestaurantDetailViewModel vm({
    List<DetailMenuItem> menu = const [],
    CardRatingModel rating = const CardRatingModel(rating: 4.1),
    int? reviewCount,
    DetailActionConfig actions = const DetailActionConfig(),
  }) =>
      RestaurantDetailViewModel(
        placeId: 'p-1',
        title: 'Bakar Bakar',
        subtitle: 'Mamak',
        sourceMode: CardSourceMode.live,
        gallery: const DetailGallery(images: []),
        businessState: CardBusinessState.active,
        hours: const DetailHours(model: CardHoursModel.unknown),
        rating: rating,
        price: CardPriceModel.unknown,
        location: const LocationInfo(address: 'Jalan Ampang'),
        reviewCount: reviewCount,
        menuItems: menu,
        actions: actions,
      );

  /// The profile tab is a lazy ListView; sections below the fold are not built
  /// until scrolled to. Widget tests must scroll rather than assume they exist.
  Future<void> scrollProfileTo(WidgetTester tester, Finder target) async {
    await tester.scrollUntilVisible(
      target,
      250,
      scrollable: find.descendant(
        of: find.byKey(const Key('restaurant-profile-tab')),
        matching: find.byType(Scrollable),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> pump(WidgetTester tester, Widget child) async {
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('ms'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: AppTheme.light(),
      home: child,
    ));
    await tester.pump();
    await tester.pumpAndSettle();
  }

  group('two-tab structure', () {
    testWidgets('1. exactly two tabs exist, labelled Profil & Ulasan and Menu',
        (tester) async {
      await pump(tester, CanonicalRestaurantDetailScreen(vm: vm()));
      expect(find.byKey(const Key('restaurant-detail-tabs')), findsOneWidget);
      expect(find.byType(Tab), findsNWidgets(2));
      expect(find.text(ms('profileReviewsTab')), findsOneWidget);
      expect(find.text(ms('menuTab')), findsOneWidget);
    });

    testWidgets('2. default selected tab is Profil & Ulasan', (tester) async {
      await pump(tester, CanonicalRestaurantDetailScreen(vm: vm()));
      final controller = DefaultTabController.of(
          tester.element(find.byKey(const Key('restaurant-detail-tabs'))));
      expect(controller.index, 0);
      expect(find.byKey(const Key('restaurant-profile-tab')), findsOneWidget);
    });

    testWidgets('3. tapping Menu switches to the menu tab', (tester) async {
      await pump(tester, CanonicalRestaurantDetailScreen(vm: vm()));
      await tester.tap(find.text(ms('menuTab')));
      await tester.pumpAndSettle();
      final controller = DefaultTabController.of(
          tester.element(find.byKey(const Key('restaurant-detail-tabs'))));
      expect(controller.index, 1);
      expect(find.byKey(const Key('restaurant-menu-tab')), findsOneWidget);
    });

    testWidgets('4. horizontal swipe changes tab and keeps the indicator in sync',
        (tester) async {
      await pump(tester, CanonicalRestaurantDetailScreen(vm: vm()));
      await tester.fling(
          find.byKey(const Key('restaurant-detail-tabviews')), const Offset(-400, 0), 1200);
      await tester.pumpAndSettle();
      final controller = DefaultTabController.of(
          tester.element(find.byKey(const Key('restaurant-detail-tabs'))));
      expect(controller.index, 1, reason: 'swipe left must select Menu');
      expect(find.byKey(const Key('restaurant-menu-tab')), findsOneWidget);

      await tester.fling(
          find.byKey(const Key('restaurant-detail-tabviews')), const Offset(400, 0), 1200);
      await tester.pumpAndSettle();
      expect(controller.index, 0, reason: 'swipe right must return to Profile');
    });
  });

  group('menu tab', () {
    testWidgets('5 + 6. empty menu keeps the tab and shows the empty state',
        (tester) async {
      await pump(tester, CanonicalRestaurantDetailScreen(vm: vm()));
      // Tab still exists even though there is no menu.
      expect(find.text(ms('menuTab')), findsOneWidget);
      await tester.tap(find.text(ms('menuTab')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('restaurant-menu-empty')), findsOneWidget);
      expect(find.text(ms('emptyMenuTitle')), findsOneWidget);
      expect(find.text(ms('emptyMenuSubtitle')), findsOneWidget);
    });

    testWidgets('7. populated menu renders its items', (tester) async {
      await pump(
        tester,
        CanonicalRestaurantDetailScreen(
          vm: vm(menu: [
            menuItem(id: 'm-1', name: 'Nasi Lemak', category: 'Nasi', price: 8.5),
            menuItem(id: 'm-2', name: 'Teh Ais', section: 'minuman', category: 'Minuman', price: 3),
          ]),
        ),
      );
      await tester.tap(find.text(ms('menuTab')));
      await tester.pumpAndSettle();
      expect(find.text('Nasi Lemak'), findsOneWidget);
      expect(find.text('Teh Ais'), findsOneWidget);
      expect(find.byKey(const Key('restaurant-menu-empty')), findsNothing);
    });

    testWidgets('8. the STABLE DetailMenuItem.id reaches the comment callback',
        (tester) async {
      final captured = <String>[];
      await pump(
        tester,
        CanonicalRestaurantDetailScreen(
          vm: vm(menu: [
            menuItem(id: 'stable-menu-id-1', name: 'Nasi Lemak', price: 8.5),
          ]),
          onOpenMenuItemComments: (item) => captured.add(item.id),
        ),
      );
      await tester.tap(find.text(ms('menuTab')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('restaurant-menu-comments-stable-menu-id-1')));
      await tester.pumpAndSettle();
      expect(captured, ['stable-menu-id-1'],
          reason: 'menuItemId must be the stable id, never regenerated');
    });

    testWidgets('13. an empty menu invents no item and no comment target',
        (tester) async {
      var invoked = 0;
      await pump(
        tester,
        CanonicalRestaurantDetailScreen(
          vm: vm(),
          onOpenMenuItemComments: (_) => invoked++,
        ),
      );
      await tester.tap(find.text(ms('menuTab')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('restaurant-menu-categories')), findsNothing);
      expect(
        find.byWidgetPredicate((w) =>
            w.key is ValueKey<String> &&
            (w.key as ValueKey<String>).value.startsWith('restaurant-menu-comments-')),
        findsNothing,
      );
      expect(invoked, 0);
    });

    testWidgets('category chips come from real data and default to Semua',
        (tester) async {
      await pump(
        tester,
        CanonicalRestaurantDetailScreen(
          vm: vm(menu: [
            menuItem(id: 'm-1', name: 'Nasi Lemak', category: 'Nasi'),
            menuItem(id: 'm-2', name: 'Mee Goreng', category: 'Mee'),
          ]),
        ),
      );
      await tester.tap(find.text(ms('menuTab')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('restaurant-menu-categories')), findsOneWidget);
      expect(find.text(ms('menuCategoryAll')), findsOneWidget);
      expect(find.text('Nasi'), findsWidgets);
      // Default shows everything.
      expect(find.text('Nasi Lemak'), findsOneWidget);
      expect(find.text('Mee Goreng'), findsOneWidget);
      // Filtering to one category hides the other item.
      await tester.tap(find.byKey(const ValueKey('menu-category-Mee')));
      await tester.pumpAndSettle();
      expect(find.text('Mee Goreng'), findsOneWidget);
      expect(find.text('Nasi Lemak'), findsNothing);
    });
  });

  group('header, follow and reviews', () {
    testWidgets('9. Follow renders in the header when engagement is supplied',
        (tester) async {
      await pump(
        tester,
        CanonicalRestaurantDetailScreen(
          vm: vm(),
          engagement: const Text('IKUT-SLOT'),
        ),
      );
      expect(find.byKey(const Key('restaurant-engagement-strip')), findsOneWidget);
      expect(find.text('IKUT-SLOT'), findsOneWidget);
    });

    testWidgets('10. Follow is hidden safely when no canonical id resolved',
        (tester) async {
      await pump(tester, CanonicalRestaurantDetailScreen(vm: vm()));
      expect(find.byKey(const Key('restaurant-engagement-strip')), findsNothing);
    });

    testWidgets('11. general rating is NOT labelled as MakanMana community reviews',
        (tester) async {
      await pump(
        tester,
        CanonicalRestaurantDetailScreen(
          vm: vm(rating: const CardRatingModel(rating: 4.1), reviewCount: 2300),
        ),
      );
      // The count sits under the GENERAL rating heading with a source note...
      await scrollProfileTo(tester, find.text(ms('generalRatingTitle')));
      expect(find.text(ms('generalRatingTitle')), findsOneWidget);
      expect(find.text('2300 ${ms('generalRatingCountSuffix')}'), findsOneWidget);
      expect(find.text(ms('generalRatingSourceNote')), findsOneWidget);
      // ...and the community section is separate and honestly empty.
      await scrollProfileTo(tester, find.text(ms('communityReviewsTitle')));
      expect(find.text(ms('communityReviewsTitle')), findsOneWidget);
      expect(find.byKey(const Key('restaurant-community-reviews-empty')), findsOneWidget);
      expect(find.text(ms('noCommunityReviews')), findsOneWidget);
    });

    testWidgets('community reviews render when the route supplies them',
        (tester) async {
      await pump(
        tester,
        CanonicalRestaurantDetailScreen(
          vm: vm(reviewCount: 2300),
          communityReviews: const Text('ULASAN-SEBENAR'),
        ),
      );
      await scrollProfileTo(tester, find.text('ULASAN-SEBENAR'));
      expect(find.byKey(const Key('restaurant-community-reviews')), findsOneWidget);
      expect(find.text('ULASAN-SEBENAR'), findsOneWidget);
      expect(find.byKey(const Key('restaurant-community-reviews-empty')), findsNothing);
    });

    testWidgets('12. "Log makan" appears at most once', (tester) async {
      await pump(
        tester,
        CanonicalRestaurantDetailScreen(
          vm: vm(
            actions: const DetailActionConfig(
              canRate: true,
              canLogMeal: true,
              canOpenMaps: true,
            ),
          ),
          callbacks: RestaurantDetailCallbacks(
            onRate: () {},
            onLogMeal: () {},
            onOpenMaps: () {},
          ),
        ),
      );
      await scrollProfileTo(tester, find.text(ms('logMealAction')));
      expect(find.text(ms('logMealAction')), findsNWidgets(1));
      // The rating action is its own label, not a second "Log makan".
      final source = read(
          'lib/features/restaurant/canonical/canonical_restaurant_detail_screen.dart');
      final actions = source.substring(source.indexOf('Widget _actions('));
      // Count real USAGES, not prose: the explanatory comment in _actions also
      // mentions the key, which would otherwise fail this very assertion.
      expect("t.t('logMealAction')".allMatches(actions).length, 1,
          reason: 'exactly one logMealAction button may exist');
      expect(actions, contains("t.t('rateAction')"));
    });
  });

  group('safety invariants', () {
    tearDown(RestaurantDetailFlags.resetToSafeDefault);

    test('14. production canonical flag default remains OFF', () {
      RestaurantDetailFlags.resetToSafeDefault();
      expect(RestaurantDetailFlags.canonicalRestaurantDetailEnabled, isFalse);
      final flags = read(
          'lib/features/restaurant/canonical/restaurant_detail_flags.dart');
      expect(flags, contains('canonicalRestaurantDetailEnabled = false'));
      // QA activation condition is unchanged by this UX corrective.
      final qa = read('lib/features/place_migration/qa_canonical_activation.dart');
      expect(qa, contains('isDebugBuild'));
      expect(qa, contains('appFlavor'));
    });

    test('15. QA/prod flavor package invariants remain intact', () {
      final gradle = read('android/app/build.gradle.kts');
      expect(gradle, contains('applicationId = "com.makanmana.apps"'));
      final qaBlock = gradle.substring(gradle.indexOf('create("qa")'));
      expect(qaBlock, contains('applicationIdSuffix = ".qa"'));
      final prodBlock = gradle.substring(
          gradle.indexOf('create("prod")'), gradle.indexOf('create("qa")'));
      expect(prodBlock.contains('applicationIdSuffix'), isFalse);
    });

    test('menu comments stay server-mediated and keep the Wave 3 contract', () {
      final screen = read(
          'lib/features/restaurant/canonical/canonical_restaurant_detail_screen.dart');
      // The screen only surfaces the affordance; it never writes anything.
      expect(screen.contains('menu_comments'), isFalse);
      expect(screen.contains('FirebaseFirestore'), isFalse);
      // The comment key must interpolate the real item id.
      expect(screen, contains(r"ValueKey('restaurant-menu-comments-${item.id}')"));
    });

    test('branding stays MakanMana, never "AI"', () {
      expect(ms('aiPickTitle'), contains('MakanMana'));
      expect(ms('aiPickTitle').contains('AI '), isFalse);
    });
  });
}
