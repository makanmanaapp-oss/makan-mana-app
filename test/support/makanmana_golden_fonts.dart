import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void>? _fontsLoaded;

/// Load repository fonts once per test isolate, before either screen renders.
/// Font failures propagate so a missing asset cannot silently use a test font.
Future<void> loadMakanManaGoldenFonts() => _fontsLoaded ??= _loadFonts();

Future<void> _loadFonts() async {
  TestWidgetsFlutterBinding.ensureInitialized();
  final inter = FontLoader('Inter')
    ..addFont(rootBundle.load('assets/fonts/inter/Inter-Regular.ttf'))
    ..addFont(rootBundle.load('assets/fonts/inter/Inter-Medium.ttf'))
    ..addFont(rootBundle.load('assets/fonts/inter/Inter-SemiBold.ttf'))
    ..addFont(rootBundle.load('assets/fonts/inter/Inter-Bold.ttf'));
  await inter.load();

  // Material icons are also production font glyphs, not placeholder boxes.
  final icons = FontLoader('MaterialIcons')
    ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
  await icons.load();
}

/// Keep logical/physical dimensions and raster scale explicit on every host.
Future<void> configureMakanManaGoldenView(
  WidgetTester tester,
  Size size,
) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  await tester.binding.setSurfaceSize(size);
  addTearDown(() => tester.binding.setSurfaceSize(null));
}
