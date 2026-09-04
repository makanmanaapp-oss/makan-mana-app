import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/core/services/merchant_service.dart';
import 'package:makan_mana/features/merchant/restaurant_profile_editor_card.dart';
import 'package:makan_mana/features/merchant/restaurant_profile_proposal.dart';

void main() {
  group('RestaurantProfileProposal', () {
    test('allows only fields for the selected proposal domain', () {
      final profile = RestaurantProfileProposal.validate(
        RestaurantProfileProposal.profileUpdate,
        {'display_name': 'Kedai A', 'city': 'Kuching'},
      );
      expect(profile['display_name'], 'Kedai A');

      expect(
        () => RestaurantProfileProposal.validate(
          RestaurantProfileProposal.contactUpdate,
          {'display_name': 'Tidak dibenarkan'},
        ),
        throwsArgumentError,
      );
    });

    test('rejects safety, admin, apply and publication fields', () {
      for (final key in [
        'halal_status',
        'allergens',
        'apply_status',
        'reviewed_by',
        'publish_status',
        'published_at',
      ]) {
        expect(
          () => RestaurantProfileProposal.validate(
            RestaurantProfileProposal.profileUpdate,
            {key: 'forbidden'},
          ),
          throwsArgumentError,
          reason: key,
        );
      }
    });

    test('separates review and registry-apply lifecycle labels', () {
      expect(
        RestaurantProfileProposal.reviewLabel('approved'),
        'Diluluskan untuk apply',
      );
      expect(
        RestaurantProfileProposal.applyLabel('not_applied'),
        'Belum apply ke Master Registry',
      );
      expect(
        RestaurantProfileProposal.applyLabel('applied'),
        'Sudah apply ke Master Registry',
      );
      expect(
        RestaurantProfileProposal.applyLabel('conflict'),
        'Perlu semakan semula',
      );
    });
  });

  test('MerchantState exposes only active memberships and profile proposals', () {
    const state = MerchantState(
      account: {'id': 'merchant-1'},
      claims: [],
      memberships: [
        {'registry_id': 'active', 'status': 'active'},
        {'registry_id': 'revoked', 'status': 'revoked'},
      ],
      submissions: [
        {'submission_type': 'profile_update'},
        {'submission_type': 'hours_update'},
        {'submission_type': 'new_place'},
      ],
    );

    expect(state.activeMemberships.length, 1);
    expect(state.activeMemberships.single['registry_id'], 'active');
    expect(state.restaurantProfileSubmissions.length, 2);
  });

  testWidgets('editor submits a review-gated profile proposal', (tester) async {
    const registryId = '11111111-1111-4111-8111-111111111111';
    const state = MerchantState(
      account: {'id': 'merchant-1'},
      claims: [],
      memberships: [
        {
          'registry_id': registryId,
          'status': 'active',
          'role': 'owner',
        },
      ],
      submissions: [],
    );

    String? capturedRegistryId;
    String? capturedType;
    Map<String, dynamic>? capturedData;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: RestaurantProfileEditorCard(
              state: state,
              submitting: false,
              onSubmit: ({
                required registryId,
                required submissionType,
                required data,
              }) async {
                capturedRegistryId = registryId;
                capturedType = submissionType;
                capturedData = data;
              },
            ),
          ),
        ),
      ),
    );

    expect(find.text('Restaurant Profile V2'), findsOneWidget);
    expect(find.textContaining('Status halal'), findsOneWidget);

    await tester.enterText(find.byType(TextField).first, 'Kedai Baru');
    final submit = find.byKey(const Key('restaurant-profile-submit'));
    await tester.ensureVisible(submit);
    await tester.pumpAndSettle();
    await tester.tap(submit);
    await tester.pumpAndSettle();

    expect(capturedRegistryId, registryId);
    expect(capturedType, RestaurantProfileProposal.profileUpdate);
    expect(capturedData, {'display_name': 'Kedai Baru'});

    expect(find.widgetWithText(FilledButton, 'Approve'), findsNothing);
    expect(find.widgetWithText(FilledButton, 'Apply'), findsNothing);
    expect(find.widgetWithText(FilledButton, 'Publish'), findsNothing);
  });

  testWidgets('approved is not presented as live and conflict is explicit',
      (tester) async {
    const state = MerchantState(
      account: {'id': 'merchant-1'},
      claims: [],
      memberships: [],
      submissions: [
        {
          'id': 'submission-approved',
          'submission_type': 'contact_update',
          'status': 'approved',
          'apply_status': 'not_applied',
        },
        {
          'id': 'submission-conflict',
          'submission_type': 'hours_update',
          'status': 'approved',
          'apply_status': 'conflict',
        },
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: RestaurantProfileEditorCard(
              state: state,
              submitting: false,
              onSubmit: ({
                required registryId,
                required submissionType,
                required data,
              }) async {},
            ),
          ),
        ),
      ),
    );

    expect(find.textContaining('belum live'), findsOneWidget);
    expect(find.textContaining('Perlu semakan semula'), findsOneWidget);
    expect(find.textContaining('reconcile'), findsOneWidget);
  });

  test('mobile merchant source has no admin mutation callable', () async {
    final service = await File('lib/core/services/merchant_service.dart').readAsString();
    final screen = await File('lib/features/merchant/merchant_center_screen.dart').readAsString();
    final editor = await File('lib/features/merchant/restaurant_profile_editor_card.dart').readAsString();
    final source = '$service\n$screen\n$editor';

    expect(service, contains("httpsCallable('submitMerchantProfileUpdate')"));
    expect(source, isNot(contains("httpsCallable('approve")));
    expect(source, isNot(contains("httpsCallable('apply")));
    expect(source, isNot(contains("httpsCallable('publish")));
  });
}
