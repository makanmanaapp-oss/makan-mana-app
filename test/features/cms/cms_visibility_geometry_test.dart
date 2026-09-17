// B5 — pure geometry used by the impression tracker.
//
// The widget tests prove the tracker end to end; these pin the arithmetic
// underneath so an off-by-one in rectangle handling cannot hide behind layout.
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/features/cms/cms_visibility_geometry.dart';

void main() {
  group('cmsUnoccludedArea', () {
    const box = Rect.fromLTWH(0, 0, 100, 100);

    test('no occluders: the whole area', () {
      expect(cmsUnoccludedArea(box, const []), 10000);
    });

    test('overlapping occluders are not subtracted twice', () {
      // Left half + top half = 5000 + 5000 - 2500 overlap = 7500 covered.
      expect(
        cmsUnoccludedArea(box, const [
          Rect.fromLTWH(0, 0, 50, 100),
          Rect.fromLTWH(0, 0, 100, 50),
        ]),
        2500,
      );
    });

    test('occluders outside the area and duplicate occluders change nothing',
        () {
      expect(
        cmsUnoccludedArea(box, const [
          Rect.fromLTWH(200, 200, 50, 50),
          Rect.fromLTWH(0, 0, 10, 10),
          Rect.fromLTWH(0, 0, 10, 10),
        ]),
        9900,
      );
    });

    test('an occluder larger than the area covers it entirely', () {
      expect(
          cmsUnoccludedArea(box, const [Rect.fromLTWH(-10, -10, 500, 500)]), 0);
    });

    test('touching edges are not overlap', () {
      expect(cmsUnoccludedArea(box, const [Rect.fromLTWH(100, 0, 50, 100)]),
          10000);
    });

    test('fail closed: empty or non-finite input is 0, never NaN', () {
      expect(cmsUnoccludedArea(Rect.zero, const []), 0);
      expect(
          cmsUnoccludedArea(
              const Rect.fromLTWH(0, 0, double.nan, 10), const []),
          0);
      expect(
          cmsUnoccludedArea(
              const Rect.fromLTWH(0, 0, double.infinity, 10), const []),
          0);
      expect(
          cmsUnoccludedArea(box, const [Rect.fromLTWH(0, 0, double.nan, 10)]),
          0);
    });
  });

  group('cmsViewableScreenRect', () {
    testWidgets('excludes status bar, system nav, keyboard and side insets',
        (t) async {
      t.view.devicePixelRatio = 2;
      t.view.physicalSize = const Size(720, 1600);
      t.view.viewPadding = const FakeViewPadding(top: 48, bottom: 96, left: 10);
      t.view.padding = const FakeViewPadding(top: 48, left: 10);
      t.view.viewInsets = const FakeViewPadding(bottom: 600, right: 20);
      addTearDown(t.view.reset);

      final ui.FlutterView view = t.view;
      // top 48/2, left 10/2, right 20/2, bottom max(96, 600)/2.
      expect(cmsViewableScreenRect(view),
          const Rect.fromLTRB(5, 24, 360 - 10, 800 - 300));
    });

    testWidgets('a keyboard shorter than the gesture bar leaves the bar',
        (t) async {
      t.view.devicePixelRatio = 2;
      t.view.physicalSize = const Size(720, 1600);
      t.view.viewPadding = const FakeViewPadding(bottom: 96);
      t.view.viewInsets = const FakeViewPadding(bottom: 40);
      addTearDown(t.view.reset);
      expect(cmsViewableScreenRect(t.view).bottom, 800 - 48);
    });

    testWidgets('insets that swallow the screen give an empty rect', (t) async {
      t.view.devicePixelRatio = 2;
      t.view.physicalSize = const Size(720, 1600);
      t.view.viewInsets = const FakeViewPadding(bottom: 1700);
      addTearDown(t.view.reset);
      expect(cmsViewableScreenRect(t.view), Rect.zero);
    });
  });
}
