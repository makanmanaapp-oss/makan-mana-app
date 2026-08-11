import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/features/pro/calorie_scan_result.dart';

/// Phase 2.15A — Calorie Scan result model + edit/validation (pure).
void main() {
  Map<String, dynamic> api({
    Object? protein = 30,
    Object? carbs = 70,
    Object? fat = 20,
    int calories = 600,
  }) =>
      {
        'foods': [
          {'name': 'Nasi Ayam', 'calories': 600},
        ],
        'totalCalories': calories,
        'totalProtein': protein,
        'totalCarbs': carbs,
        'totalFat': fat,
        'isHealthy': true,
        'note': 'Seimbang.',
      };

  test('fromApi parses calories + macros with model provenance', () {
    final r = CalorieScanResult.fromApi(api(), scanId: 's1');
    expect(r.calories, 600);
    expect(r.protein.grams, 30);
    expect(r.protein.source, EstimateSource.model);
    expect(r.mealName, 'Nasi Ayam');
    expect(r.hasFood, isTrue);
  });

  test('missing macro is not estimated (null, NOT zero)', () {
    final r = CalorieScanResult.fromApi(api(protein: null), scanId: 's1');
    expect(r.protein.grams, isNull);
    expect(r.protein.estimated, isFalse);
    expect(r.protein.source, EstimateSource.notEstimated);
    // carbs/fat still model
    expect(r.carbs.grams, 70);
  });

  test('negative/NaN-ish macro from model treated as not estimated', () {
    final r = CalorieScanResult.fromApi(api(fat: -5), scanId: 's1');
    expect(r.fat.estimated, isFalse);
  });

  test('validate rejects empty name', () {
    final r = CalorieScanResult.fromApi(api(), scanId: 's1');
    final d = ScanEditDraft.fromResult(r)..mealName = '   ';
    expect(d.validate(), ScanEditError.nameRequired);
  });

  test('validate rejects negative calories', () {
    final d = ScanEditDraft.fromResult(CalorieScanResult.fromApi(api(), scanId: 's1'))
      ..calories = '-10';
    expect(d.validate(), ScanEditError.caloriesInvalid);
  });

  test('validate rejects calories overflow and zero', () {
    final r = CalorieScanResult.fromApi(api(), scanId: 's1');
    expect((ScanEditDraft.fromResult(r)..calories = '20001').validate(),
        ScanEditError.caloriesInvalid);
    expect((ScanEditDraft.fromResult(r)..calories = '0').validate(),
        ScanEditError.caloriesInvalid);
  });

  test('validate rejects malformed + overflow macro; empty macro allowed', () {
    final r = CalorieScanResult.fromApi(api(), scanId: 's1');
    expect((ScanEditDraft.fromResult(r)..protein = 'abc').validate(),
        ScanEditError.macroInvalid);
    expect((ScanEditDraft.fromResult(r)..carbs = '2001').validate(),
        ScanEditError.macroInvalid);
    expect((ScanEditDraft.fromResult(r)..fat = '').validate(),
        ScanEditError.none); // empty = not estimated, allowed
  });

  test('toSavePayload uses corrected values + marks user provenance', () {
    final r = CalorieScanResult.fromApi(api(), scanId: 's1');
    final d = ScanEditDraft.fromResult(r)
      ..mealName = 'Nasi Ayam (besar)'
      ..calories = '750'
      ..protein = '40';
    final p = d.toSavePayload();
    expect(p['actionId'], 's1');
    expect(p['menuName'], 'Nasi Ayam (besar)');
    expect(p['calories'], 750);
    expect(p['protein'], 40);
    expect(p['macroSource'], 'user'); // protein edited
    expect(p['calorieSource'], 'user'); // calories edited
  });

  test('empty macro saved as null (not zero) and marked not_estimated', () {
    final r = CalorieScanResult.fromApi(api(protein: null, carbs: null, fat: null),
        scanId: 's1');
    final d = ScanEditDraft.fromResult(r); // leaves macros empty
    final p = d.toSavePayload();
    expect(p['protein'], isNull);
    expect(p['macroSource'], 'not_estimated');
  });

  test('unedited result keeps model provenance + same actionId across retries', () {
    final r = CalorieScanResult.fromApi(api(), scanId: 'stable-1');
    final p1 = ScanEditDraft.fromResult(r).toSavePayload();
    final p2 = ScanEditDraft.fromResult(r).toSavePayload();
    expect(p1['actionId'], 'stable-1');
    expect(p2['actionId'], 'stable-1'); // same id => server idempotent
    expect(p1['macroSource'], 'model');
  });
}
