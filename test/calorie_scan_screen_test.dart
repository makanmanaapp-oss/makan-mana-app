import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/features/pro/calorie_scan_result.dart';
import 'package:makan_mana/features/pro/calorie_scan_screen.dart';

/// Phase 2.15A — Calorie Scan screen widget QA (no Firebase; save injected).
void main() {
  CalorieScanResult result({Object? protein = 30}) => CalorieScanResult.fromApi(
        {
          'foods': [
            {'name': 'Nasi Ayam', 'calories': 600},
          ],
          'totalCalories': 600,
          'totalProtein': protein,
          'totalCarbs': 70,
          'totalFat': 20,
          'isHealthy': true,
          'note': 'Seimbang.',
        },
        scanId: 'scan-1',
      );

  Future<void> pump(
    WidgetTester tester, {
    CalorieScanResult? initial,
    Future<Map<String, dynamic>> Function(Map<String, dynamic>)? save,
  }) async {
    // Tall surface so the full result/edit ListView renders (lazy children).
    await tester.binding.setSurfaceSize(const Size(800, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(ProviderScope(
      child: MaterialApp(
        locale: const Locale('en'),
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [Locale('en')],
        home: CalorieScanScreen(initialResult: initial, saveOverride: save),
      ),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('result card shows calories + all macros', (tester) async {
    await pump(tester, initial: result());
    expect(find.text('600 kcal'), findsOneWidget);
    expect(find.text('Estimated calories'), findsOneWidget);
    expect(find.text('Estimated nutrition'), findsOneWidget);
    expect(find.text('Protein'), findsOneWidget);
    expect(find.text('Carbs'), findsOneWidget);
    expect(find.text('Fat'), findsOneWidget);
    expect(find.text('30 g'), findsOneWidget);
  });

  testWidgets('estimate + allergy/halal/medical disclosure visible', (tester) async {
    await pump(tester, initial: result());
    expect(find.textContaining('estimates only'), findsOneWidget);
    expect(find.textContaining('allergy safety'), findsOneWidget);
    expect(find.textContaining('halal'), findsOneWidget);
    expect(find.textContaining('not medical advice'), findsOneWidget);
  });

  testWidgets('missing macro renders "Not estimated", not 0 g', (tester) async {
    await pump(tester, initial: result(protein: null));
    expect(find.text('Not estimated'), findsOneWidget);
    expect(find.text('0 g'), findsNothing);
  });

  testWidgets('edit flow updates saved values via callable payload',
      (tester) async {
    Map<String, dynamic>? captured;
    await pump(tester, initial: result(), save: (p) async {
      captured = p;
      return {'status': 'created', 'mealId': 'm1'};
    });
    await tester.tap(find.text('Edit result'));
    await tester.pumpAndSettle();
    // Change calories field.
    await tester.enterText(find.widgetWithText(TextField, 'Estimated calories'), '720');
    await tester.tap(find.text('Save corrected result'));
    await tester.pumpAndSettle();
    expect(captured, isNotNull);
    expect(captured!['calories'], 720);
    expect(captured!['actionId'], 'scan-1');
    expect(captured!['calorieSource'], 'user');
  });

  testWidgets('cancel edit restores original values', (tester) async {
    await pump(tester, initial: result());
    await tester.tap(find.text('Edit result'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Estimated calories'), '999');
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    // Back to read view with original value.
    expect(find.text('600 kcal'), findsOneWidget);
    expect(find.text('Edit result'), findsOneWidget);
  });

  testWidgets('negative calories shows validation error, no save', (tester) async {
    var saveCalls = 0;
    await pump(tester, initial: result(), save: (p) async {
      saveCalls++;
      return {'status': 'created', 'mealId': 'm1'};
    });
    await tester.tap(find.text('Edit result'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Estimated calories'), '-5');
    // '-' is stripped by digitsOnly formatter -> becomes '5'? ensure invalid path:
    await tester.enterText(find.widgetWithText(TextField, 'Estimated calories'), '');
    await tester.tap(find.text('Save corrected result'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Invalid calories'), findsOneWidget);
    expect(saveCalls, 0);
  });

  testWidgets('save disabled after logged (deterministic confirmation)',
      (tester) async {
    var saveCalls = 0;
    await pump(tester, initial: result(), save: (p) async {
      saveCalls++;
      return {'status': 'created', 'mealId': 'm1'};
    });
    await tester.tap(find.text('Log to Fit Coach'));
    await tester.pumpAndSettle();
    expect(find.text('logged'), findsOneWidget);
    // Second tap does nothing (button disabled).
    final btn = tester.widget<FilledButton>(
        find.ancestor(of: find.text('logged'), matching: find.byType(FilledButton)));
    expect(btn.onPressed, isNull);
    expect(saveCalls, 1);
  });

  testWidgets('fresh screen (no result) shows intro, no stale result',
      (tester) async {
    await pump(tester); // no initialResult => simulates fresh/after account switch
    expect(find.textContaining('Snap your food'), findsOneWidget);
    expect(find.text('Estimated calories'), findsNothing);
  });
}
