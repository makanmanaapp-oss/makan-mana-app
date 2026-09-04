import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/services/merchant_service.dart';
import 'package:makan_mana/core/services/restaurant_profile_v2_service.dart';
import 'package:makan_mana/features/merchant/restaurant_profile_editor_card.dart';
import 'package:makan_mana/features/merchant/restaurant_profile_proposal.dart';
import 'package:makan_mana/features/restaurant/canonical/canonical_restaurant_detail_screen.dart';
import 'package:makan_mana/features/restaurant/canonical/restaurant_detail_view_model.dart';
import 'package:makan_mana/features/restaurant/canonical/restaurant_profile_v2_adapter.dart';

Widget _detailHost(RestaurantDetailViewModel vm, {String lang = 'ms'}) {
  return MaterialApp(
    theme: AppTheme.light(),
    locale: Locale(lang),
    supportedLocales: AppLocalizations.supportedLocales,
    localizationsDelegates: const [
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    home: CanonicalRestaurantDetailScreen(vm: vm),
  );
}

const _merchantState = MerchantState(
  account: {'id': 'merchant-1'},
  claims: [],
  memberships: [
    {
      'registry_id': '11111111-1111-4111-8111-111111111111',
      'status': 'active',
      'role': 'owner',
    },
  ],
  submissions: [],
);

Future<void> _chooseSection(
  WidgetTester tester,
  String visibleLabel,
) async {
  await tester.tap(find.byKey(const Key('restaurant-profile-section')));
  await tester.pumpAndSettle();
  await tester.tap(find.text(visibleLabel).last);
  await tester.pumpAndSettle();
}

void main() {
  group('Restaurant Profile V2 completeness contract', () {
    test('mobile defensive allow-list accepts itemized menu but blocks safety fields', () {
      final result = RestaurantProfileProposal.validate(
        RestaurantProfileProposal.menuUpdate,
        {
          'menu_items': [
            {
              'id': 'food-1',
              'section': 'makanan',
              'name': 'Nasi Lemak',
              'price': 8.5,
              'currency': 'MYR',
              'available': true,
              'sortOrder': 0,
            },
          ],
        },
      );
      expect((result['menu_items'] as List).length, 1);

      expect(
        () => RestaurantProfileProposal.validate(
          RestaurantProfileProposal.menuUpdate,
          {'halal_status': 'verified_halal'},
        ),
        throwsArgumentError,
      );
    });

    test('public DTO and adapter preserve real menu prices without inventing missing price', () {
      final profile = PublicRestaurantProfileV2.fromMap({
        'canonicalPlaceId': 'canonical-menu-1',
        'publicationVersion': 12,
        'name': 'Kedai Menu Lengkap',
        'menuItems': [
          {
            'id': 'food-1',
            'section': 'makanan',
            'category': 'Nasi',
            'name': 'Nasi Lemak',
            'description': 'Sambal dan telur',
            'price': 8.5,
            'currency': 'MYR',
            'available': true,
            'sortOrder': 10,
          },
          {
            'id': 'drink-1',
            'section': 'minuman',
            'name': 'Teh O Ais',
            'price': null,
            'currency': 'MYR',
            'available': false,
            'sortOrder': 20,
          },
        ],
        'openingHours': {
          'monday': {
            'closed': false,
            'all_day': false,
            'sessions': [
              {'open': '09:00', 'close': '14:00'},
              {'open': '17:00', 'close': '22:00'},
            ],
          },
          'tuesday': {'closed': true, 'all_day': false, 'sessions': []},
          'wednesday': {'closed': false, 'all_day': true, 'sessions': []},
        },
        'cuisineTags': <String>[],
        'foodTags': <String>[],
        'signatureDishes': <String>[],
        'serviceModes': <String>[],
        'amenities': <String>[],
        'tags': <Map<String, dynamic>>[],
        'priceState': 'price_unknown',
        'businessState': 'active',
        'hoursState': 'hours_known',
        'ratingState': 'rating_hidden',
        'halalState': 'halal_unknown',
        'halalEvidenceLevel': 'unknown',
        'dietaryReported': <String>[],
        'allergenReported': <String>[],
        'allergenEvidenceLevel': 'unknown',
        'media': <Map<String, dynamic>>[],
        'verificationStatus': 'unverified',
        'freshnessState': 'fresh',
        'warnings': <String>[],
      });

      final vm = restaurantDetailFromPublicProfile(profile);
      expect(vm.menuItems.length, 2);
      expect(vm.menuItems.first.name, 'Nasi Lemak');
      expect(vm.menuItems.first.priceLabel, 'RM 8.50');
      expect(vm.menuItems.last.name, 'Teh O Ais');
      expect(vm.menuItems.last.priceLabel, isNull,
          reason: 'unknown item price must never be fabricated');
      expect(vm.menuItems.last.available, isFalse);

      expect(vm.hours.weeklySchedule.length, 3);
      expect(vm.hours.weeklySchedule[0].hoursLabel, '09:00 – 14:00||17:00 – 22:00');
      expect(vm.hours.weeklySchedule[1].hoursLabel, '__closed__');
      expect(vm.hours.weeklySchedule[2].hoursLabel, '__24h__');
      expect(vm.hours.model.state, CardHoursState.hoursUnknown,
          reason: 'known schedule must not become an unverified open-now claim');
    });

    testWidgets('canonical detail renders Makanan, Minuman, price, unavailable and localized break',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 1500));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      final profile = PublicRestaurantProfileV2.fromMap({
        'canonicalPlaceId': 'canonical-ui-1',
        'name': 'Kedai UI',
        'menuItems': [
          {'id': 'f1', 'section': 'makanan', 'name': 'Mee Kolok', 'price': 7.5, 'currency': 'MYR', 'available': true, 'sortOrder': 0},
          {'id': 'd1', 'section': 'minuman', 'name': 'Kopi O', 'price': null, 'currency': 'MYR', 'available': false, 'sortOrder': 10},
        ],
        'openingHours': {
          'monday': {
            'closed': false,
            'all_day': false,
            'sessions': [
              {'open': '08:00', 'close': '14:00'},
              {'open': '17:00', 'close': '21:00'},
            ],
          },
        },
        'cuisineTags': <String>[],
        'foodTags': <String>[],
        'signatureDishes': <String>[],
        'serviceModes': <String>[],
        'amenities': <String>[],
        'tags': <Map<String, dynamic>>[],
        'priceState': 'price_unknown',
        'businessState': 'active',
        'hoursState': 'hours_known',
        'ratingState': 'rating_hidden',
        'halalState': 'halal_unknown',
        'halalEvidenceLevel': 'unknown',
        'dietaryReported': <String>[],
        'allergenReported': <String>[],
        'allergenEvidenceLevel': 'unknown',
        'media': <Map<String, dynamic>>[],
        'verificationStatus': 'unverified',
        'freshnessState': 'fresh',
        'warnings': <String>[],
      });
      final vm = restaurantDetailFromPublicProfile(profile);
      await tester.pumpWidget(_detailHost(vm));
      await tester.pump();

      expect(find.text('Menu'), findsOneWidget);
      expect(find.text('Makanan'), findsOneWidget);
      expect(find.text('Minuman'), findsOneWidget);
      expect(find.text('Mee Kolok'), findsOneWidget);
      expect(find.text('RM 7.50'), findsOneWidget);
      expect(find.text('Kopi O'), findsOneWidget);
      expect(find.text('Tidak tersedia'), findsOneWidget);

      final weekly = find.text('Jadual mingguan');
      await tester.ensureVisible(weekly);
      await tester.tap(weekly);
      await tester.pump();
      expect(find.textContaining('Rehat'), findsOneWidget);
      expect(find.textContaining('08:00'), findsOneWidget);
      expect(find.textContaining('17:00'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('Merchant editor completeness', () {
    testWidgets('merchant can submit structured food item proposal only for review',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1900));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      String? capturedType;
      Map<String, dynamic>? capturedData;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: RestaurantProfileEditorCard(
              state: _merchantState,
              submitting: false,
              onSubmit: ({required registryId, required submissionType, required data}) async {
                capturedType = submissionType;
                capturedData = data;
              },
            ),
          ),
        ),
      ));

      await _chooseSection(tester, 'Menu & kategori makanan');
      await tester.tap(find.byKey(const Key('merchant-add-food-item')));
      await tester.pump();
      await tester.enterText(find.byKey(const ValueKey('merchant-menu-name-0')), 'Nasi Ayam');

      final priceField = find.widgetWithText(TextField, 'Harga (RM)');
      await tester.enterText(priceField, '9.90');

      final submit = find.byKey(const Key('restaurant-profile-submit'));
      await tester.ensureVisible(submit);
      await tester.tap(submit);
      await tester.pumpAndSettle();

      expect(capturedType, RestaurantProfileProposal.menuUpdate);
      final items = capturedData?['menu_items'] as List<dynamic>?;
      expect(items, isNotNull);
      expect(items, hasLength(1));
      expect((items!.first as Map<String, dynamic>)['section'], 'makanan');
      expect((items.first as Map<String, dynamic>)['name'], 'Nasi Ayam');
      expect((items.first as Map<String, dynamic>)['price'], 9.9);
      expect(find.widgetWithText(FilledButton, 'Approve'), findsNothing);
      expect(find.widgetWithText(FilledButton, 'Apply'), findsNothing);
      expect(find.widgetWithText(FilledButton, 'Publish'), findsNothing);
    });

    testWidgets('merchant can submit explicit two-session Monday hours',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 2200));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      String? capturedType;
      Map<String, dynamic>? capturedData;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: RestaurantProfileEditorCard(
              state: _merchantState,
              submitting: false,
              onSubmit: ({required registryId, required submissionType, required data}) async {
                capturedType = submissionType;
                capturedData = data;
              },
            ),
          ),
        ),
      ));

      await _chooseSection(tester, 'Waktu operasi');
      await tester.enterText(find.widgetWithText(TextField, 'Isnin buka sesi 1'), '09:00');
      await tester.enterText(find.widgetWithText(TextField, 'Isnin tutup / rehat'), '14:00');
      await tester.enterText(find.widgetWithText(TextField, 'Isnin buka semula'), '17:00');
      await tester.enterText(find.widgetWithText(TextField, 'Isnin tutup akhir'), '22:00');

      final submit = find.byKey(const Key('restaurant-profile-submit'));
      await tester.ensureVisible(submit);
      await tester.tap(submit);
      await tester.pumpAndSettle();

      expect(capturedType, RestaurantProfileProposal.hoursUpdate);
      final opening = capturedData?['opening_hours'] as Map<String, dynamic>?;
      expect(opening, isNotNull);
      expect(opening!['monday'], {
        'closed': false,
        'all_day': false,
        'sessions': [
          {'open': '09:00', 'close': '14:00'},
          {'open': '17:00', 'close': '22:00'},
        ],
      });
    });
  });
}
