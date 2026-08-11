import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/features/taste/taste_pickers.dart';

/// ISSUE 003 closeout — ujian sheet keterukan alahan + pemetik masakan.
/// NOTA: butang bertema MakanMana guna minimumSize lebar-infiniti, jadi
/// butang ujian WAJIB dibataskan (SizedBox) — pitfall projek yang diketahui.
Widget _host(
  Future<void> Function(BuildContext ctx) onPressed, {
  bool dark = false,
  String lang = 'en',
}) =>
    MaterialApp(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: dark ? ThemeMode.dark : ThemeMode.light,
      locale: Locale(lang),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Scaffold(
        body: Builder(
          builder: (ctx) => Center(
            child: SizedBox(
              width: 220,
              child: ElevatedButton(
                onPressed: () => onPressed(ctx),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    );

void main() {
  // ---- Sheet keterukan alahan ----
  testWidgets('severity sheet: pilih Severe + nota → hasil betul',
      (tester) async {
    AllergyResult? result;
    await tester.pumpWidget(_host((ctx) async {
      result = await showAllergySeveritySheet(ctx, allergyLabel: 'Peanuts');
    }));
    await tester.pumpAndSettle();
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(find.text('Peanuts'), findsOneWidget);
    expect(find.text('Severe'), findsOneWidget);
    await tester.tap(find.text('Severe'));
    await tester.pump();
    await tester.enterText(find.byType(TextField), 'avoid completely');
    await tester.tap(find.text('Save taste'));
    await tester.pumpAndSettle();

    expect(result, isNotNull);
    expect(result!.remove, isFalse);
    expect(result!.severity, 'severe');
    expect(result!.note, 'avoid completely');
  });

  testWidgets('severity sheet: Mild & Moderate kekal + prapilih',
      (tester) async {
    AllergyResult? result;
    await tester.pumpWidget(_host((ctx) async {
      result = await showAllergySeveritySheet(ctx,
          allergyLabel: 'Lactose', currentSeverity: 'mild');
    }));
    await tester.pumpAndSettle();
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    // Prapilih mild hadir; tukar ke Moderate.
    expect(find.text('Mild'), findsOneWidget);
    await tester.tap(find.text('Moderate'));
    await tester.pump();
    await tester.tap(find.text('Save taste'));
    await tester.pumpAndSettle();
    expect(result!.severity, 'moderate');
    expect(result!.note, isNull); // nota kosong dibenarkan
  });

  testWidgets('severity sheet: Remove pulangkan remove=true', (tester) async {
    AllergyResult? result;
    await tester.pumpWidget(_host((ctx) async {
      result = await showAllergySeveritySheet(ctx,
          allergyLabel: 'Dairy', currentSeverity: 'mild', allowRemove: true);
    }));
    await tester.pumpAndSettle();
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remove'));
    await tester.pumpAndSettle();
    expect(result, isNotNull);
    expect(result!.remove, isTrue);
  });

  testWidgets('severity sheet render Dark tiada ralat', (tester) async {
    await tester.pumpWidget(_host(dark: true, (ctx) async {
      await showAllergySeveritySheet(ctx, allergyLabel: 'Shrimp');
    }));
    await tester.pumpAndSettle();
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.text('Shrimp'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  // ---- Pemetik masakan ----
  testWidgets('cuisine picker: pindah antara mod cetus pengesahan',
      (tester) async {
    CuisinePickerResult? res;
    await tester.pumpWidget(_host((ctx) async {
      res = await openCuisinePicker(ctx,
          fav: {'thai'}, explore: {}, avoid: {});
    }));
    await tester.pumpAndSettle();
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    // Tapis senarai dahulu (ListView.builder malas), kemudian tukar mod.
    await tester.enterText(find.byType(TextField), 'thai');
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Avoid ('));
    await tester.pump();
    await tester.tap(find.text('Thai').first);
    await tester.pumpAndSettle();
    expect(find.text('Move category'), findsWidgets);

    await tester.tap(find.widgetWithText(ElevatedButton, 'Move category'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ElevatedButton, 'Save taste'));
    await tester.pumpAndSettle();

    expect(res, isNotNull);
    expect(res!.fav.contains('thai'), isFalse);
    expect(res!.avoid.contains('thai'), isTrue);
  });

  testWidgets('cuisine picker: Cancel kekalkan mod asal', (tester) async {
    CuisinePickerResult? res;
    await tester.pumpWidget(_host((ctx) async {
      res = await openCuisinePicker(ctx,
          fav: {'thai'}, explore: {}, avoid: {});
    }));
    await tester.pumpAndSettle();
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'thai');
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Avoid ('));
    await tester.pump();
    await tester.tap(find.text('Thai').first);
    await tester.pumpAndSettle();
    // Batal → kekal Favourite.
    await tester.tap(find.widgetWithText(TextButton, 'Cancel'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ElevatedButton, 'Save taste'));
    await tester.pumpAndSettle();
    expect(res!.fav.contains('thai'), isTrue);
    expect(res!.avoid.contains('thai'), isFalse);
  });

  testWidgets('cuisine picker: carian separa/no-result, Dark 360dp',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(360, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(_host(dark: true, (ctx) async {
      await openCuisinePicker(ctx, fav: {}, explore: {}, avoid: {});
    }));
    await tester.pumpAndSettle();
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'zzzznomatch');
    await tester.pumpAndSettle();
    expect(find.text('No matches'), findsOneWidget);

    // Case-insensitive + separa.
    await tester.enterText(find.byType(TextField), 'MA');
    await tester.pumpAndSettle();
    expect(find.text('Malay'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  // Regresi ISSUE 003 (emulator QA): tambah masakan sendiri semasa carian
  // aktif meranapkan app ('_dependents.isEmpty' framework assertion) kerana
  // TextEditingController dialog di-dispose serta-merta selepas showDialog
  // kembali, semasa TextField masih hidup dalam animasi keluar dialog.
  testWidgets('cuisine picker: tambah custom semasa carian aktif tiada ranap',
      (tester) async {
    CuisinePickerResult? res;
    await tester.pumpWidget(_host((ctx) async {
      res = await openCuisinePicker(ctx, fav: {}, explore: {}, avoid: {});
    }));
    await tester.pumpAndSettle();
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    // Carian aktif (repro sebenar di emulator).
    await tester.enterText(find.byType(TextField), 'melayu');
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.add));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.widgetWithText(TextField, 'Cuisine name'), 'Fusion QA');
    await tester.tap(find.widgetWithText(ElevatedButton, 'Add custom cuisine'));
    // Pam animasi keluar dialog sepenuhnya — di sinilah ranap lama berlaku.
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    // Custom masuk mod aktif (Favourite) + dedup pada penambahan kedua.
    await tester.tap(find.byIcon(Icons.add));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.widgetWithText(TextField, 'Cuisine name'), 'fusion qa');
    await tester.tap(find.widgetWithText(ElevatedButton, 'Add custom cuisine'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    await tester.tap(find.widgetWithText(ElevatedButton, 'Save taste'));
    await tester.pumpAndSettle();
    expect(res, isNotNull);
    expect(res!.customs.where((c) => c['id'] == 'custom:fusion qa').length, 1);
    expect(res!.fav.contains('custom:fusion qa'), isTrue);
  });

  testWidgets('cuisine picker: label Tamil & carian zh render 360@1.30',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(360, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    // Tamil
    await tester.pumpWidget(_host(lang: 'ta', (ctx) async {
      await openCuisinePicker(ctx, fav: {}, explore: {}, avoid: {});
    }));
    await tester.pumpAndSettle();
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pumpAndSettle();

    // Chinese
    await tester.pumpWidget(_host(lang: 'zh', (ctx) async {
      await openCuisinePicker(ctx, fav: {}, explore: {}, avoid: {});
    }));
    await tester.pumpAndSettle();
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '泰');
    await tester.pumpAndSettle();
    expect(find.text('泰国'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
