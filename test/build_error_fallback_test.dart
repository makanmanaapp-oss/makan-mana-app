// Jaring keselamatan untuk pengecualian build yang BELUM diketahui.
//
// Dalam binaan keluaran Flutter melukis pengecualian build sebagai
// RenderErrorBox - segi empat kelabu Color(0xF0C0C0C0) tanpa mesej
// (packages/flutter/lib/src/rendering/error.dart:115). Itu dibuktikan pada
// app produksi 0.1.8 (13): tab Grup menjadi RGB(196,196,196) kosong.
//
// Pengendalian ralat KHUSUS DOMAIN kekal penyelesaian utama (lihat
// riverpod_class_d_test.dart). Fallback ini hanya memastikan pengecualian
// yang terlepas tidak lagi menjadi kotak kelabu tanpa penjelasan, sambil:
//   * tidak mendedahkan butiran pengecualian,
//   * mengekalkan pelaporan (FlutterError.onError -> Crashlytics),
//   * tidak menawarkan butang Cuba Lagi global yang tidak berkesan,
//   * tidak menimbulkan ralat KEDUA dalam mana-mana kekangan susun atur.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/widgets/build_error_fallback.dart';

const _secret = 'rahsia-dalaman-xyz permission-denied uid=abc123';

class _Boom extends StatelessWidget {
  const _Boom();
  @override
  Widget build(BuildContext context) => throw StateError(_secret);
}

Widget _app(Widget child, {String lang = 'ms', bool dark = false}) =>
    MaterialApp(
      theme: dark ? AppTheme.dark() : AppTheme.light(),
      locale: Locale(lang),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Scaffold(body: child),
    );

/// Pasang builder keluaran untuk satu ujian, rekod setiap ralat yang
/// DILAPORKAN (laluan Crashlytics), dan pulihkan kedua-duanya selepas itu.
Future<List<FlutterErrorDetails>> _withReleaseBuilder(
    WidgetTester tester, Widget tree) async {
  final reported = <FlutterErrorDetails>[];
  final prevBuilder = ErrorWidget.builder;
  final prevOnError = FlutterError.onError;
  ErrorWidget.builder = releaseErrorWidgetBuilder;
  FlutterError.onError = reported.add;
  try {
    await tester.pumpWidget(tree);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  } finally {
    ErrorWidget.builder = prevBuilder;
    FlutterError.onError = prevOnError;
  }
  return reported;
}

/// Hanya pengecualian ASAL dilaporkan - tiada ralat kedua daripada
/// fallback itu sendiri (susun atur, Directionality, lokalisasi...).
void _onlyTheOriginal(List<FlutterErrorDetails> reported) {
  expect(reported, isNotEmpty,
      reason: 'ralat build MESTI masih dilaporkan (Crashlytics)');
  for (final d in reported) {
    expect(d.exception, isA<StateError>(),
        reason: 'fallback menimbulkan ralat kedua: ${d.exceptionAsString()}');
  }
}

/// Mesej yang DILUKIS (objek render daun - tiada widget Text).
String _painted(WidgetTester tester) => tester
    .renderObject<RenderBuildErrorFallback>(find.byType(BuildErrorFallback))
    .message;

/// Pembaca skrin mesti mendengar mesej yang sama.
void _announced(WidgetTester tester, String message) {
  final handle = tester.ensureSemantics();
  expect(find.bySemanticsLabel(message), findsOneWidget,
      reason: 'mesej mesti boleh dibaca oleh pembaca skrin');
  handle.dispose();
}

void main() {
  testWidgets(
      'kotak kelabu digantikan dengan mesej yang boleh dibaca, dalam '
      'bahasa pengguna', (tester) async {
    final reported = await _withReleaseBuilder(tester, _app(const _Boom()));
    _onlyTheOriginal(reported);
    expect(find.byType(BuildErrorFallback), findsOneWidget);
    expect(_painted(tester), 'Bahagian ini tidak dapat dimuatkan sekarang.');
    _announced(tester, 'Bahagian ini tidak dapat dimuatkan sekarang.');
  });

  testWidgets('English', (tester) async {
    final reported =
        await _withReleaseBuilder(tester, _app(const _Boom(), lang: 'en'));
    _onlyTheOriginal(reported);
    expect(_painted(tester), "This section couldn't be loaded right now.");
    _announced(tester, "This section couldn't be loaded right now.");
  });

  testWidgets('butiran pengecualian TIDAK didedahkan kepada pengguna',
      (tester) async {
    await _withReleaseBuilder(tester, _app(const _Boom()));
    expect(_painted(tester), isNot(contains('rahsia')));
    expect(_painted(tester), isNot(contains('permission-denied')));
    expect(find.textContaining('rahsia-dalaman'), findsNothing);
    expect(find.textContaining('permission-denied'), findsNothing);
    expect(find.textContaining('StateError'), findsNothing);
  });

  testWidgets('pelaporan dikekalkan: FlutterError.onError menerima ralat asal',
      (tester) async {
    final reported = await _withReleaseBuilder(tester, _app(const _Boom()));
    expect(reported.single.exception.toString(), contains('rahsia-dalaman'),
        reason: 'Crashlytics mesti masih menerima pengecualian penuh');
  });

  testWidgets('tiada butang Cuba Lagi global', (tester) async {
    await _withReleaseBuilder(tester, _app(const _Boom()));
    expect(find.byType(ButtonStyleButton), findsNothing);
    expect(find.byType(InkWell), findsNothing);
  });

  testWidgets('mod gelap', (tester) async {
    final reported =
        await _withReleaseBuilder(tester, _app(const _Boom(), dark: true));
    _onlyTheOriginal(reported);
    expect(find.byType(BuildErrorFallback), findsOneWidget);
  });

  testWidgets(
      'ralat DI ATAS MaterialApp (tiada Directionality/Localizations) -> '
      'tiada ralat kedua', (tester) async {
    final reported = await _withReleaseBuilder(tester, const _Boom());
    _onlyTheOriginal(reported);
    expect(find.byType(BuildErrorFallback), findsOneWidget);
    expect(_painted(tester), BuildErrorFallback.fallbackMessage);
  });

  group('selamat dalam setiap kekangan susun atur', () {
    final contexts = <String, Widget>{
      'dalam Column (tinggi tak terbatas)':
          const Column(children: [_Boom()]),
      'dalam Row (lebar tak terbatas)': const Row(children: [_Boom()]),
      'dalam ListView': ListView(children: const [_Boom()]),
      'dalam IntrinsicHeight': const IntrinsicHeight(child: _Boom()),
      'slot kecil 24x24 (cth. ikon AppBar)':
          const Center(child: SizedBox(width: 24, height: 24, child: _Boom())),
    };
    testWidgets('slot kecil: ikon sahaja, mesej penuh kekal untuk pembaca skrin',
        (tester) async {
      final reported = await _withReleaseBuilder(
          tester,
          _app(const Center(
              child: SizedBox(width: 48, height: 48, child: _Boom()))));
      _onlyTheOriginal(reported);
      final box = tester.renderObject<RenderBuildErrorFallback>(
          find.byType(BuildErrorFallback));
      expect(box.isCompact, isTrue);
      _announced(tester, 'Bahagian ini tidak dapat dimuatkan sekarang.');
    });

    testWidgets('kawasan besar: bukan padat', (tester) async {
      await _withReleaseBuilder(
          tester, _app(const SizedBox(height: 300, child: _Boom())));
      expect(
          tester
              .renderObject<RenderBuildErrorFallback>(
                  find.byType(BuildErrorFallback))
              .isCompact,
          isFalse);
    });

    contexts.forEach((name, tree) {
      testWidgets(name, (tester) async {
        final reported = await _withReleaseBuilder(tester, _app(tree));
        _onlyTheOriginal(reported);
        expect(find.byType(BuildErrorFallback), findsOneWidget);
        final box = tester.renderObject<RenderBox>(
            find.byType(BuildErrorFallback));
        expect(box.size.isFinite, isTrue,
            reason: 'saiz tak terhingga dalam kekangan tak terbatas');
      });
    });
  });

  group('pendawaian main.dart', () {
    final main = File('lib/main.dart').readAsStringSync();
    final install = main.indexOf('ErrorWidget.builder = releaseErrorWidgetBuilder');

    test('dipasang, dan hanya dalam binaan bukan-debug', () {
      expect(install, greaterThan(0));
      final guard = main.lastIndexOf('if (!kDebugMode) {', install);
      expect(guard, greaterThan(0));
      expect(main.substring(guard, install).contains('}'), isFalse,
          reason: 'mesti berada DI DALAM blok if (!kDebugMode)');
    });

    test('dipasang SEBELUM get QA, jadi binaan QA juga diliputi', () {
      expect(install, lessThan(main.indexOf('if (appFlavor == kQaFlavorName)')));
    });

    test('pelaporan Crashlytics tidak diganti', () {
      final onError = main.indexOf('FlutterError.onError =');
      expect(onError, greaterThan(0));
      expect(
          main
              .substring(onError, onError + 90)
              .contains('FirebaseCrashlytics.instance.recordFlutterFatalError'),
          isTrue);
    });
  });
}
