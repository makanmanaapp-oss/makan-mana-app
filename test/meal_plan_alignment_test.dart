import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/core/models/makanmana_user_context.dart';
import 'package:makan_mana/features/pro/meal_plan_service.dart';
import 'package:makan_mana/models/place_summary.dart';

/// Phase 2.3A — Meal Plan mesti guna RANKING backend (matchScore unified) dan
/// sebab/amaran backend; TIDAK kira semula skor secara tempatan.

PlaceSummary place({
  required String id,
  required int matchScore,
  String cuisine = 'malay',
  int priceLevel = 2,
  double distanceKm = 1.5,
  List<String> reasons = const [],
  List<String> negatives = const [],
}) =>
    PlaceSummary(
      placeId: id, name: id, cuisine: cuisine, emoji: '🍽️',
      rating: 4.2, userRatingCount: 200, priceLevel: priceLevel,
      distanceKm: distanceKm, isOpen: true, address: 'x',
      matchScore: matchScore, matchReasonKeys: reasons,
      negativeSignals: negatives, priceEstimate: 'RM10 - RM20',
    );

MakanManaUserContext ctx({
  List<String> favourite = const [],
  bool halal = false,
  List<String> allergies = const [],
}) =>
    const MakanManaUserContext().copyWith(
      favoriteCuisines: favourite,
      halalPreference: halal,
      allergies: allergies,
    );

void main() {
  test('meal plan ranking follows backend matchScore (not local re-score)', () {
    // B ialah cuisine kegemaran tetapi matchScore backend rendah. Selepas 2.3A,
    // Meal Plan TIDAK boost kegemaran tempatan → B (skor rendah) TIDAK naik ke atas.
    final a = place(id: 'A', matchScore: 92, cuisine: 'thai');
    final c = place(id: 'C', matchScore: 90, cuisine: 'japanese');
    final b = place(id: 'B', matchScore: 45, cuisine: 'malay');
    final plan = buildMealPlan(ctx(favourite: ['malay']), [a, c, b], days: 1);
    final breakfast = plan.days.first.first;
    // Top-2 backend = {A, C}; kegemaran skor-rendah B tidak dipilih.
    expect(breakfast.place?.placeId, isNot('B'));
    expect(<String>['A', 'C'], contains(breakfast.place?.placeId));
  });

  test('meal plan reasons come from backend matchReasonKeys', () {
    final p = place(id: 'P', matchScore: 88, reasons: ['highRating', 'nearLocation']);
    final plan = buildMealPlan(ctx(), [p], days: 1);
    final item = plan.days.first.first;
    expect(item.reasonKeys, containsAll(<String>['highRating', 'nearLocation']));
  });

  test('meal plan maps new 2.3 negative signals to honest cautions', () {
    final p = place(
      id: 'P', matchScore: 80,
      negatives: ['beyond_preferred_distance', 'nutrition_not_verified'],
    );
    final plan = buildMealPlan(ctx(), [p], days: 1);
    final item = plan.days.first.first;
    // Sekurang-kurangnya satu amaran 2.3 dipetakan (take 2).
    expect(
      item.cautionKeys.any((k) =>
          k == 'beyondPreferredDistance' || k == 'nutritionNotVerified'),
      isTrue,
    );
  });

  test('avoided cuisine is deprioritized (guard), safety upstream preserved', () {
    final good1 = place(id: 'GOOD1', matchScore: 70, cuisine: 'thai');
    final good2 = place(id: 'GOOD2', matchScore: 68, cuisine: 'japanese');
    final avoided = place(id: 'AVOID', matchScore: 72, cuisine: 'seafood');
    // seafood dielak → guard -25 (72→47) → jatuh di bawah GOOD1/GOOD2 (top-2).
    final plan = buildMealPlan(
      const MakanManaUserContext().copyWith(avoidedCuisines: ['seafood']),
      [good1, good2, avoided],
      days: 1,
    );
    expect(plan.days.first.first.place?.placeId, isNot('AVOID'));
  });
}
