// Home Food Hero Carousel — targeted tests (presentation-only component).
//
// Covers the PDF's required checks: 9 assets registered, valid image renders,
// controlled time advances, no blank frame, provider/parent rebuild does not
// reset, Timer disposes safely, invalid-asset fallback, and no overflow across
// 360/412 × text-scale 1.0/1.3 × Bright/Dark.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/widgets/mm_icons.dart';
import 'package:makan_mana/features/home/home_palette.dart';
import 'package:makan_mana/features/home/home_screen.dart';

const _assets = HomeFoodHeroCarousel.assets;

Widget _harness(
  Widget Function(BuildContext) build, {
  Size size = const Size(412, 900),
  double scale = 1.0,
  bool dark = false,
}) {
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: dark ? AppTheme.dark() : AppTheme.light(),
    home: MediaQuery(
      data: MediaQueryData(size: size, textScaler: TextScaler.linear(scale)),
      child: Scaffold(
        backgroundColor: const Color(0xFFFDF8F4),
        body: Center(child: Builder(builder: build)),
      ),
    ),
  );
}

void main() {
  group('assets', () {
    test('exactly 9 normalized assets, all present on disk', () {
      expect(_assets, hasLength(9));
      for (final path in _assets) {
        expect(File(path).existsSync(), isTrue, reason: 'missing $path');
        expect(path, startsWith('assets/images/home_food_carousel/'));
        expect(path, endsWith('.png'));
      }
    });

    test('expected dish filenames present', () {
      for (final name in const [
        'nasi_lemak.png',
        'ayam_gepuk.png',
        'nasi_kandar.png',
        'char_kuey_teow.png',
        'sukiya_bowl.png',
        'chicken_tenders.png',
        'mee_bandung_muar.png',
        'roti_canai.png',
        'chicken_grill.png',
      ]) {
        expect(_assets.any((a) => a.endsWith(name)), isTrue, reason: name);
      }
    });

    test('folder registered in pubspec.yaml', () {
      final pubspec = File('pubspec.yaml').readAsStringSync();
      expect(pubspec.contains('assets/images/home_food_carousel/'), isTrue);
    });
  });

  testWidgets('renders one valid image immediately (no placeholder)',
      (tester) async {
    await tester.pumpWidget(_harness((c) => HomeFoodHeroCarousel(
        palette: HomePalette.of(c), initialIndex: 0, autoPlay: false)));
    await tester.pump();
    expect(find.byKey(ValueKey<String>(_assets[0])), findsOneWidget);
    // BoxFit.contain (jangan potong/herot).
    final img = tester.widget<Image>(find.byKey(ValueKey<String>(_assets[0])));
    expect(img.fit, BoxFit.contain);
  });

  testWidgets('controlled time advances to another image', (tester) async {
    await tester.pumpWidget(_harness((c) => HomeFoodHeroCarousel(
        palette: HomePalette.of(c), initialIndex: 0, autoPlay: true)));
    await tester.pump();
    expect(find.byKey(ValueKey<String>(_assets[0])), findsOneWidget);
    // Maju selepas ~5s + selesai peralihan.
    await tester.pump(const Duration(seconds: 5));
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.byKey(ValueKey<String>(_assets[1])), findsOneWidget);
    expect(find.byKey(ValueKey<String>(_assets[0])), findsNothing);
    await tester.pumpWidget(const SizedBox()); // buang → dispose batalkan Timer
  });

  testWidgets('no blank frame during transition (image always present)',
      (tester) async {
    await tester.pumpWidget(_harness((c) => HomeFoodHeroCarousel(
        palette: HomePalette.of(c), initialIndex: 0, autoPlay: true)));
    await tester.pump();
    await tester.pump(const Duration(seconds: 5)); // cetus peralihan
    await tester.pump(const Duration(milliseconds: 200)); // tengah peralihan
    expect(find.byType(Image), findsWidgets); // sekurang-kurangnya satu imej
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('parent rebuild does not reset/flicker the carousel',
      (tester) async {
    final key = GlobalKey<State<StatefulWidget>>();
    late void Function(void Function()) rebuildParent;
    await tester.pumpWidget(_harness((c) => StatefulBuilder(
          builder: (ctx, setState) {
            rebuildParent = setState;
            return HomeFoodHeroCarousel(
                key: key,
                palette: HomePalette.of(ctx),
                initialIndex: 0,
                autoPlay: true);
          },
        )));
    await tester.pump();
    await tester.pump(const Duration(seconds: 5));
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.byKey(ValueKey<String>(_assets[1])), findsOneWidget);
    // Paksa rebuild induk (simulasi provider rebuild) — indeks TIDAK reset.
    rebuildParent(() {});
    await tester.pump();
    expect(find.byKey(ValueKey<String>(_assets[1])), findsOneWidget);
    expect(find.byKey(ValueKey<String>(_assets[0])), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('Timer disposes safely (no pending timer / no throw)',
      (tester) async {
    await tester.pumpWidget(_harness((c) => HomeFoodHeroCarousel(
        palette: HomePalette.of(c), initialIndex: 0, autoPlay: true)));
    await tester.pump();
    await tester.pumpWidget(const SizedBox()); // unmount → cancel Timer
    await tester.pump(const Duration(seconds: 10)); // masa berlalu, tiada fire
    expect(tester.takeException(), isNull);
  });

  testWidgets('all-invalid assets → safe branded fallback (no crash)',
      (tester) async {
    await tester.pumpWidget(_harness((c) => HomeFoodHeroCarousel(
          palette: HomePalette.of(c),
          initialIndex: 0,
          autoPlay: false,
          assetsOverride: const ['assets/__does_not_exist__.png'],
        )));
    // Ralat muat-aset SENGAJA (aset tak wujud) — perlu dikeringkan, bukan
    // dianggap crash. Cascade dua lapis: imej carousel gagal → fallback
    // _HeroFoodVisual → imejnya gagal → glif MmIcon. Beberapa frame diperlukan.
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      while (tester.takeException() != null) {}
    }
    // Home tak tumbang & fallback jenama (glif MmIcon) dipaparkan.
    expect(find.byType(MmIcon), findsWidgets);
  });

  testWidgets('invalid asset is skipped → next valid asset renders',
      (tester) async {
    await tester.pumpWidget(_harness((c) => HomeFoodHeroCarousel(
          palette: HomePalette.of(c),
          initialIndex: 0,
          autoPlay: false,
          assetsOverride: ['assets/__nope__.png', _assets[0]],
        )));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    while (tester.takeException() != null) {} // ralat aset tak-sah dijangka
    expect(find.byKey(ValueKey<String>(_assets[0])), findsOneWidget);
  });

  for (final size in const [Size(360, 780), Size(412, 900)]) {
    for (final scale in const [1.0, 1.3]) {
      for (final dark in const [false, true]) {
        final tag =
            '${size.width.toInt()}dp s$scale ${dark ? 'Dark' : 'Bright'}';
        testWidgets('no overflow: $tag', (tester) async {
          await tester.binding.setSurfaceSize(size);
          addTearDown(() => tester.binding.setSurfaceSize(null));
          await tester.pumpWidget(_harness(
            (c) => HomeFoodHeroCarousel(
                palette: HomePalette.of(c), initialIndex: 2, autoPlay: false),
            size: size,
            scale: scale,
            dark: dark,
          ));
          await tester.pump();
          expect(tester.takeException(), isNull, reason: 'overflow $tag');
          expect(find.byType(HomeFoodHeroCarousel), findsOneWidget);
        });
      }
    }
  }
}
