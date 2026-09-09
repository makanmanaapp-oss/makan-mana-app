import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/features/restaurant/canonical/canonical_restaurant_detail_screen.dart';
import 'package:makan_mana/features/restaurant/canonical/restaurant_detail_view_model.dart';

void main() {
  DetailMenuItem item(int index, {String? category}) => DetailMenuItem(
        id: 'menu-$index',
        section: 'makanan',
        name: 'Menu item $index',
        category: category ?? 'Makanan',
        price: 8 + index.toDouble(),
        available: true,
      );

  RestaurantDetailViewModel vm({
    int menuCount = 28,
    bool multipleCategories = false,
  }) =>
      RestaurantDetailViewModel(
        placeId: 'scroll-regression-place',
        title: 'Scroll Regression Restaurant',
        subtitle: 'Mamak',
        sourceMode: CardSourceMode.live,
        gallery: const DetailGallery(images: []),
        businessState: CardBusinessState.active,
        hours: const DetailHours(model: CardHoursModel.unknown),
        rating: const CardRatingModel(rating: 4.2),
        price: CardPriceModel.unknown,
        location: const LocationInfo(address: 'Jalan Ampang'),
        menuItems: List.generate(
          menuCount,
          (index) => item(
            index,
            category: multipleCategories
                ? const ['Nasi', 'Mee', 'Ayam', 'Minuman'][index % 4]
                : null,
          ),
        ),
      );

  void usePhoneSize(WidgetTester tester) {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  }

  Widget localizedApp(Widget home) => MaterialApp(
        locale: const Locale('ms'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        theme: AppTheme.light(),
        home: home,
      );

  Future<void> pump(
    WidgetTester tester, {
    int menuCount = 28,
    bool multipleCategories = false,
    void Function(DetailMenuItem item)? onOpenMenuItemComments,
  }) async {
    usePhoneSize(tester);
    await tester.pumpWidget(localizedApp(
      CanonicalRestaurantDetailScreen(
        vm: vm(
          menuCount: menuCount,
          multipleCategories: multipleCategories,
        ),
        onOpenMenuItemComments: onOpenMenuItemComments,
      ),
    ));
    await tester.pumpAndSettle();
  }

  ScrollableState menuScrollableState(WidgetTester tester) {
    final menu = find.byKey(const Key('restaurant-menu-tab'));
    final scrollable = find.descendant(
      of: menu,
      matching: find.byType(Scrollable),
    ).first;
    return tester.state<ScrollableState>(scrollable);
  }

  testWidgets('Menu remains vertically scrollable after opening the third tab',
      (tester) async {
    await pump(tester);

    await tester.tap(find.byKey(const Key('tab-menu')));
    await tester.pumpAndSettle();

    final menu = find.byKey(const Key('restaurant-menu-tab'));
    expect(menu, findsOneWidget);
    final state = menuScrollableState(tester);

    await tester.drag(menu, const Offset(0, -420));
    await tester.pumpAndSettle();
    final before = state.position.pixels;

    await tester.drag(menu, const Offset(0, -320));
    await tester.pumpAndSettle();
    final after = state.position.pixels;

    expect(after, greaterThan(before),
        reason:
            'The Menu inner scroll position must advance after the shared header is collapsed.');
  });

  testWidgets('short Menu can still collapse the shared Restaurant Detail header',
      (tester) async {
    await pump(tester, menuCount: 2);

    await tester.tap(find.byKey(const Key('tab-menu')));
    await tester.pumpAndSettle();

    final menu = find.byKey(const Key('restaurant-menu-tab'));
    final tabs = find.byKey(const Key('restaurant-detail-tabs'));
    final before = tester.getTopLeft(tabs).dy;

    await tester.drag(menu, const Offset(0, -220));
    await tester.pumpAndSettle();

    final after = tester.getTopLeft(tabs).dy;
    expect(after, lessThan(before - 20),
        reason:
            'Even an under-filled Menu must accept vertical drag so the shared header can collapse.');
  });

  testWidgets('Menu can scroll back toward top after scrolling down the list',
      (tester) async {
    await pump(tester);

    await tester.tap(find.byKey(const Key('tab-menu')));
    await tester.pumpAndSettle();

    final menu = find.byKey(const Key('restaurant-menu-tab'));
    final state = menuScrollableState(tester);

    await tester.drag(menu, const Offset(0, -520));
    await tester.pumpAndSettle();
    await tester.drag(menu, const Offset(0, -360));
    await tester.pumpAndSettle();
    final scrolled = state.position.pixels;
    expect(scrolled, greaterThan(0));

    await tester.drag(menu, const Offset(0, 320));
    await tester.pumpAndSettle();
    final returned = state.position.pixels;

    expect(returned, lessThan(scrolled),
        reason:
            'The Menu must remain bidirectionally scrollable after the NestedScrollView header has collapsed.');
  });

  testWidgets('vertical drag starting on category rail reaches shared header',
      (tester) async {
    await pump(tester, multipleCategories: true);

    await tester.tap(find.byKey(const Key('tab-menu')));
    await tester.pumpAndSettle();

    final categories = find.byKey(const Key('restaurant-menu-categories'));
    final tabs = find.byKey(const Key('restaurant-detail-tabs'));
    expect(categories, findsOneWidget);

    final before = tester.getTopLeft(tabs).dy;
    await tester.drag(categories, const Offset(0, -180));
    await tester.pumpAndSettle();
    final after = tester.getTopLeft(tabs).dy;

    expect(after, lessThan(before - 20),
        reason:
            'The horizontal category rail must not swallow a vertical drag intended for Restaurant Detail scrolling.');
  });

  testWidgets('vertical drag starting on comment affordance still scrolls Menu',
      (tester) async {
    var commentOpens = 0;
    await pump(
      tester,
      onOpenMenuItemComments: (_) => commentOpens++,
    );

    await tester.tap(find.byKey(const Key('tab-menu')));
    await tester.pumpAndSettle();

    final menu = find.byKey(const Key('restaurant-menu-tab'));
    final state = menuScrollableState(tester);

    // Collapse the shared identity header first, while keeping menu rows active.
    await tester.drag(menu, const Offset(0, -420));
    await tester.pumpAndSettle();

    final comment = find.byKey(const ValueKey('restaurant-menu-comments-menu-4'));
    await tester.ensureVisible(comment);
    await tester.pumpAndSettle();
    expect(comment, findsOneWidget);

    final before = state.position.pixels;
    await tester.drag(comment, const Offset(0, -120));
    await tester.pumpAndSettle();
    final after = state.position.pixels;

    expect(after, greaterThan(before),
        reason:
            'The tappable Komen affordance must yield to a vertical drag so the Menu list keeps scrolling.');
    expect(commentOpens, 0,
        reason: 'A drag gesture must not be mistaken for a comment tap.');
  });
}
