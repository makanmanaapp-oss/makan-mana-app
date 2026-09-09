import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/features/restaurant/canonical/canonical_restaurant_detail_screen.dart';
import 'package:makan_mana/features/restaurant/canonical/restaurant_detail_view_model.dart';

void main() {
  DetailMenuItem item(int index) => DetailMenuItem(
        id: 'menu-$index',
        section: 'makanan',
        name: 'Menu item $index',
        category: 'Makanan',
        price: 8 + index.toDouble(),
        available: true,
      );

  RestaurantDetailViewModel vm() => RestaurantDetailViewModel(
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
        menuItems: List.generate(28, item),
      );

  Future<void> pump(WidgetTester tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

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
      home: CanonicalRestaurantDetailScreen(vm: vm()),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('Menu remains vertically scrollable after opening the third tab',
      (tester) async {
    await pump(tester);

    await tester.tap(find.byKey(const Key('tab-menu')));
    await tester.pumpAndSettle();

    final menu = find.byKey(const Key('restaurant-menu-tab'));
    expect(menu, findsOneWidget);

    final scrollable = find.descendant(
      of: menu,
      matching: find.byType(Scrollable),
    ).first;
    final state = tester.state<ScrollableState>(scrollable);

    // Collapse any remaining shared Restaurant Detail header first. A second
    // vertical gesture must then advance the Menu list itself. This mirrors the
    // physical-device failure where horizontal tab switching worked but the
    // Menu content would not move down the list.
    await tester.drag(menu, const Offset(0, -420));
    await tester.pumpAndSettle();
    final before = state.position.pixels;

    await tester.drag(menu, const Offset(0, -320));
    await tester.pumpAndSettle();
    final after = state.position.pixels;

    expect(after, greaterThan(before),
        reason: 'The Menu inner scroll position must advance after the shared header is collapsed.');
  });

  testWidgets('vertical Menu scrolling does not break horizontal tab swipe',
      (tester) async {
    await pump(tester);

    final views = find.byKey(const Key('restaurant-detail-tabviews'));
    final tabs = find.byKey(const Key('restaurant-detail-tabs'));
    final controller = DefaultTabController.of(tester.element(tabs));

    await tester.fling(views, const Offset(-400, 0), 1200);
    await tester.pumpAndSettle();
    await tester.fling(views, const Offset(-400, 0), 1200);
    await tester.pumpAndSettle();
    expect(controller.index, 2);

    final menu = find.byKey(const Key('restaurant-menu-tab'));
    await tester.drag(menu, const Offset(0, -420));
    await tester.pumpAndSettle();
    await tester.drag(menu, const Offset(0, -320));
    await tester.pumpAndSettle();

    await tester.fling(views, const Offset(400, 0), 1200);
    await tester.pumpAndSettle();
    expect(controller.index, 1, reason: 'Menu -> Ulasan horizontal swipe must remain enabled.');
  });
}
