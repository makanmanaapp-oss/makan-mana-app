import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/features/restaurant/canonical/canonical_restaurant_detail_screen.dart';
import 'package:makan_mana/features/restaurant/canonical/restaurant_detail_flags.dart';
import 'package:makan_mana/features/restaurant/canonical/restaurant_detail_view_model.dart';

/// WAVE 3 GATE 3F — three-tab Restaurant Detail (Profil | Ulasan | Menu).
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

  group('three-tab structure', () {
    testWidgets('1. exactly three tabs exist: Profil, Ulasan, Menu',
        (tester) async {
      await pump(tester, CanonicalRestaurantDetailScreen(vm: vm()));
      expect(find.byKey(const Key('restaurant-detail-tabs')), findsOneWidget);
      expect(find.byType(Tab), findsNWidgets(3));
      expect(find.text(ms('profileTab')), findsOneWidget);
      expect(find.text(ms('reviewsTab')), findsOneWidget);
      expect(find.text(ms('menuTab')), findsOneWidget);
    });

    testWidgets('2. default selected tab is Profil', (tester) async {
      await pump(tester, CanonicalRestaurantDetailScreen(vm: vm()));
      final controller = DefaultTabController.of(
          tester.element(find.byKey(const Key('restaurant-detail-tabs'))));
      expect(controller.index, 0);
      expect(find.byKey(const Key('restaurant-profile-tab')), findsOneWidget);
    });

    testWidgets('3. tapping Ulasan opens the reviews tab', (tester) async {
      await pump(tester, CanonicalRestaurantDetailScreen(vm: vm()));
      await tester.tap(find.text(ms('reviewsTab')));
      await tester.pumpAndSettle();
      final controller = DefaultTabController.of(
          tester.element(find.byKey(const Key('restaurant-detail-tabs'))));
      expect(controller.index, 1);
      expect(find.byKey(const Key('restaurant-reviews-tab')), findsOneWidget);
    });

    testWidgets('4. tapping Menu opens the menu tab', (tester) async {
      await pump(tester, CanonicalRestaurantDetailScreen(vm: vm()));
      await tester.tap(find.text(ms('menuTab')));
      await tester.pumpAndSettle();
      final controller = DefaultTabController.of(
          tester.element(find.byKey(const Key('restaurant-detail-tabs'))));
      expect(controller.index, 2);
      expect(find.byKey(const Key('restaurant-menu-tab')), findsOneWidget);
    });

    testWidgets('5. swipe walks Profil -> Ulasan -> Menu and back in sync',
        (tester) async {
      await pump(tester, CanonicalRestaurantDetailScreen(vm: vm()));
      final views = find.byKey(const Key('restaurant-detail-tabviews'));
      final controller = DefaultTabController.of(
          tester.element(find.byKey(const Key('restaurant-detail-tabs'))));

      await tester.fling(views, const Offset(-400, 0), 1200);
      await tester.pumpAndSettle();
      expect(controller.index, 1, reason: 'Profil -> Ulasan');
      expect(find.byKey(const Key('restaurant-reviews-tab')), findsOneWidget);

      await tester.fling(views, const Offset(-400, 0), 1200);
      await tester.pumpAndSettle();
      expect(controller.index, 2, reason: 'Ulasan -> Menu');
      expect(find.byKey(const Key('restaurant-menu-tab')), findsOneWidget);

      await tester.fling(views, const Offset(400, 0), 1200);
      await tester.pumpAndSettle();
      expect(controller.index, 1, reason: 'Menu -> Ulasan');

      await tester.fling(views, const Offset(400, 0), 1200);
      await tester.pumpAndSettle();
      expect(controller.index, 0, reason: 'Ulasan -> Profil');
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

  group('header, follow and reviews tab', () {
    Future<void> openReviews(WidgetTester tester) async {
      await tester.tap(find.text(ms('reviewsTab')));
      await tester.pumpAndSettle();
    }

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

    testWidgets('6. Profile tab holds NO community review list', (tester) async {
      await pump(
        tester,
        CanonicalRestaurantDetailScreen(
          vm: vm(reviewCount: 2300),
          communityReviews: const CommunityReviewsData(
            count: 2,
            average: 4.5,
            list: Text('ULASAN-SEBENAR'),
          ),
        ),
      );
      // Default tab is Profil: the review list and its summary must not be here.
      expect(find.byKey(const Key('restaurant-profile-tab')), findsOneWidget);
      expect(find.text('ULASAN-SEBENAR'), findsNothing);
      expect(find.byKey(const Key('restaurant-community-summary')), findsNothing);
      expect(find.text(ms('communityReviewsTitle')), findsNothing);
    });

    testWidgets('8 + 10b. external rating is separate from MakanMana reviews',
        (tester) async {
      await pump(
        tester,
        CanonicalRestaurantDetailScreen(
          vm: vm(rating: const CardRatingModel(rating: 4.1), reviewCount: 2300),
          communityReviews: const CommunityReviewsData(
            count: 2,
            average: 4.5,
            list: Text('ULASAN-SEBENAR'),
          ),
        ),
      );
      await openReviews(tester);
      // External metadata: labelled and counted as EXTERNAL.
      expect(find.text(ms('generalRatingTitle')), findsOneWidget);
      expect(find.text('2300 ${ms('generalRatingCountSuffix')}'), findsOneWidget);
      expect(find.text(ms('generalRatingSourceNote')), findsOneWidget);
      // MakanMana community block uses its OWN count and average.
      expect(find.text(ms('communityReviewsTitle')), findsOneWidget);
      expect(find.text('2 ${ms('communityReviewsCountSuffix')}'), findsOneWidget);
      expect(find.text('4.5'), findsOneWidget);
      // The external 2300 is never presented as a community review count.
      expect(find.text('2300 ${ms('communityReviewsCountSuffix')}'), findsNothing);
      expect(find.byKey(const Key('restaurant-community-reviews')), findsOneWidget);
      expect(find.text('ULASAN-SEBENAR'), findsOneWidget);
    });

    testWidgets('9b. empty MakanMana reviews show the honest empty state',
        (tester) async {
      await pump(
        tester,
        CanonicalRestaurantDetailScreen(
          vm: vm(reviewCount: 2300),
          communityReviews: const CommunityReviewsData(count: 0),
        ),
      );
      await openReviews(tester);
      expect(find.byKey(const Key('restaurant-community-reviews-empty')), findsOneWidget);
      expect(find.text(ms('noMakanManaReviews')), findsOneWidget);
      expect(find.text(ms('beFirstReviewer')), findsOneWidget);
      expect(find.byKey(const Key('restaurant-community-reviews')), findsNothing);
    });

    testWidgets('7. write-review CTA lives in the Ulasan tab and reuses onRate',
        (tester) async {
      var rated = 0;
      await pump(
        tester,
        CanonicalRestaurantDetailScreen(
          vm: vm(actions: const DetailActionConfig(canRate: true)),
          callbacks: RestaurantDetailCallbacks(onRate: () => rated++),
        ),
      );
      // Not in Profile...
      expect(find.byKey(const Key('restaurant-write-review')), findsNothing);
      await openReviews(tester);
      // ...but present in Ulasan, wired to the EXISTING rating callback.
      expect(find.byKey(const Key('restaurant-write-review')), findsOneWidget);
      expect(find.text(ms('writeReview')), findsOneWidget);
      await tester.tap(find.byKey(const Key('restaurant-write-review')));
      await tester.pumpAndSettle();
      expect(rated, 1);
    });

    testWidgets('11 + 12. profile actions keep one Log makan and no rating',
        (tester) async {
      await pump(
        tester,
        CanonicalRestaurantDetailScreen(
          vm: vm(
            actions: const DetailActionConfig(
              canRate: true,
              canLogMeal: true,
              canOpenMaps: true,
              canSave: true,
              canShare: true,
            ),
          ),
          callbacks: RestaurantDetailCallbacks(
            onRate: () {},
            onLogMeal: () {},
            onOpenMaps: () {},
            onSave: () {},
            onShare: () {},
          ),
        ),
      );
      await scrollProfileTo(tester, find.text(ms('logMealAction')));
      expect(find.text(ms('logMealAction')), findsNWidgets(1));
      // "Bagi rating" no longer belongs to the Profile tab.
      expect(find.text(ms('rateAction')), findsNothing);

      final source = read(
          'lib/features/restaurant/canonical/canonical_restaurant_detail_screen.dart');
      final actions = source.substring(source.indexOf('Widget _actions('));
      expect("t.t('logMealAction')".allMatches(actions).length, 1);
      expect(actions.contains("t.t('rateAction')"), isFalse,
          reason: 'the rating action moved to the Ulasan tab');
    });
  });

  group('menu comment sheet', () {
    late String sheet;
    setUp(() => sheet =
        read('lib/features/restaurant/engagement/menu_comment_sheet.dart'));

    String code(String src) => src
        .replaceAll(RegExp(r'/\*[\s\S]*?\*/'), ' ')
        .replaceAll(RegExp(r'^[ 	]*//.*\$', multiLine: true), ' ');

    test('16. empty state is the two-line honest message, not a giant card', () {
      expect(sheet, contains("Key('menu-comment-empty')"));
      expect(sheet, contains("t.t('menuCommentEmptyTitle')"));
      expect(sheet, contains("t.t('menuCommentEmptySubtitle')"));
      expect(ms('menuCommentEmptyTitle'), 'Belum ada komen untuk menu ini.');
      expect(ms('menuCommentEmptySubtitle'),
          'Jadi orang pertama berkongsi pendapat.');
    });

    test('17. official restaurant reply is identified as "Kedai rasmi"', () {
      expect(sheet, contains("Key('menu-comment-official-badge')"));
      expect(sheet, contains("t.t('restaurantOfficialBadge')"));
      expect(ms('restaurantOfficialBadge'), 'Kedai rasmi');
      // Identity comes from authorType, never from a merchant account.
      expect(sheet, contains('isRestaurantReply'));
    });

    test('18. a blank/whitespace comment cannot be submitted', () {
      expect(sheet, contains('_controller.text.trim().isNotEmpty'));
      expect(sheet, contains('onPressed: _canSend ? _send : null'));
      // Double submit is still prevented while sending.
      expect(sheet, contains('!_sending'));
    });

    test('19. no merchant/Firebase UID is displayed, and no direct writes', () {
      final body = code(sheet);
      expect(RegExp(r'uid', caseSensitive: false).hasMatch(body), isFalse,
          reason: 'the sheet must never surface a UID');
      expect(body.contains('authorUid'), isFalse);
      // Writes stay server-mediated through the existing callable.
      expect(sheet, contains('createMenuComment'));
      expect(body.contains('FirebaseFirestore'), isFalse);
      expect(body.contains("collection('menu_comments')"), isFalse);
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
