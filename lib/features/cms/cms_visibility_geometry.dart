/// B5 — how much of a banner a person can ACTUALLY see.
///
/// The impression rule asks for 50% of the banner to be visible. "Visible" used
/// to mean "inside the window", which counted pixels the user could not see: a
/// banner scrolled under Explore's fixed search header, under a pinned header,
/// behind the keyboard or a system bar, off to the side of a page view, inside
/// an Offstage subtree, or on a page covered by another route.
///
/// This measures the banner's UNOBSTRUCTED area instead, from the same render
/// tree that paints it:
///
///  1. the banner's rect in global logical pixels;
///  2. intersected with the part of the screen not covered by system bars or
///     the keyboard;
///  3. intersected with every ancestor's paint clip — scroll viewports (which
///     already exclude the area under PINNED headers before them), page views,
///     clip widgets;
///  4. zero if any ancestor does not paint it (Offstage, zero opacity, a
///     kept-alive list item off screen, the hidden child of an IndexedStack);
///  5. minus anything a Stack or Scaffold paints on top of it.
///
/// Whenever the geometry cannot be established, the answer is 0. Under-counting
/// a real glance is recoverable; reporting an audience that never looked is not.
library;

import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';

/// The rectangle of the screen that is not under a system bar or the keyboard,
/// in logical pixels.
Rect cmsViewableScreenRect(ui.FlutterView view) {
  final ratio = view.devicePixelRatio;
  if (!ratio.isFinite || ratio <= 0) return Rect.zero;
  final size = view.physicalSize / ratio;
  if (!size.width.isFinite || !size.height.isFinite) return Rect.zero;

  double edge(double a, double b, double c) =>
      math.max(a, math.max(b, c)) / ratio;
  final padding = view.padding;
  final viewPadding = view.viewPadding;
  final insets = view.viewInsets;
  final rect = Rect.fromLTRB(
    edge(padding.left, viewPadding.left, insets.left),
    edge(padding.top, viewPadding.top, insets.top),
    size.width - edge(padding.right, viewPadding.right, insets.right),
    size.height - edge(padding.bottom, viewPadding.bottom, insets.bottom),
  );
  return rect.isEmpty ? Rect.zero : rect;
}

/// Fraction (0..1) of [box]'s own area that is unobstructed on screen.
///
/// [viewable] is normally [cmsViewableScreenRect] for the view the box is in.
double cmsUnobstructedVisibleFraction(RenderBox box, {required Rect viewable}) {
  if (!box.attached || !box.hasSize) return 0;
  final local = Offset.zero & box.size;
  if (!_finiteNonEmpty(local)) return 0;

  final Rect full;
  try {
    full = MatrixUtils.transformRect(box.getTransformTo(null), local);
  } catch (_) {
    return 0;
  }
  final fullArea = _area(full);
  if (!fullArea.isFinite || fullArea <= 0) return 0;

  var visible = full.intersect(viewable);
  if (!_finiteNonEmpty(visible)) return 0;

  final occluders = <Rect>[];
  RenderObject child = box;
  var parent = box.parent;
  while (parent != null) {
    if (!parent.paintsChild(child)) return 0;
    if (parent is RenderIndexedStack && !_isDisplayed(parent, child)) return 0;

    final clip = parent.describeApproximatePaintClip(child);
    if (clip != null) {
      try {
        visible = visible.intersect(
            MatrixUtils.transformRect(parent.getTransformTo(null), clip));
      } catch (_) {
        return 0;
      }
      if (!_finiteNonEmpty(visible)) return 0;
    }

    // Children of a Stack or a Scaffold paint in list order, so every later
    // sibling is drawn on top of this one. An IndexedStack paints one child
    // only, and a Flex lays siblings out side by side, so neither occludes.
    if ((parent is RenderStack && parent is! RenderIndexedStack) ||
        parent is RenderCustomMultiChildLayoutBox) {
      final data = child.parentData;
      var sibling =
          data is ContainerBoxParentData<RenderBox> ? data.nextSibling : null;
      while (sibling != null) {
        if (sibling.hasSize && !sibling.size.isEmpty) {
          try {
            occluders.add(MatrixUtils.transformRect(
                sibling.getTransformTo(null), Offset.zero & sibling.size));
          } catch (_) {
            return 0;
          }
        }
        final siblingData = sibling.parentData;
        sibling = siblingData is ContainerBoxParentData<RenderBox>
            ? siblingData.nextSibling
            : null;
      }
    }

    child = parent;
    parent = parent.parent;
  }

  final fraction = cmsUnoccludedArea(visible, occluders) / fullArea;
  if (!fraction.isFinite) return 0;
  return fraction.clamp(0.0, 1.0).toDouble();
}

/// Area of [area] not covered by any of [occluders].
///
/// Exact for axis-aligned rectangles: the plane is cut along every occluder edge
/// and each resulting cell is either fully covered or fully clear. Overlapping
/// occluders are therefore never subtracted twice. Any non-finite input yields
/// 0, never NaN.
double cmsUnoccludedArea(Rect area, Iterable<Rect> occluders) {
  if (!_finiteNonEmpty(area)) return 0;
  final covering = <Rect>[];
  for (final o in occluders) {
    if (!_finite(o)) return 0;
    final c = o.intersect(area);
    if (!c.isEmpty) covering.add(c);
  }
  if (covering.isEmpty) return _area(area);

  final xs = <double>{area.left, area.right};
  final ys = <double>{area.top, area.bottom};
  for (final c in covering) {
    xs
      ..add(c.left)
      ..add(c.right);
    ys
      ..add(c.top)
      ..add(c.bottom);
  }
  final sx = xs.toList()..sort();
  final sy = ys.toList()..sort();

  var clear = 0.0;
  for (var i = 0; i + 1 < sx.length; i++) {
    for (var j = 0; j + 1 < sy.length; j++) {
      final cell = Rect.fromLTRB(sx[i], sy[j], sx[i + 1], sy[j + 1]);
      if (cell.isEmpty) continue;
      final centre = cell.center;
      if (!covering.any((c) => c.contains(centre))) clear += _area(cell);
    }
  }
  return clear;
}

bool _isDisplayed(RenderIndexedStack stack, RenderObject child) {
  final index = stack.index;
  if (index == null) return false;
  var i = 0;
  var current = stack.firstChild;
  while (current != null) {
    if (identical(current, child)) return i == index;
    current = stack.childAfter(current);
    i++;
  }
  return false;
}

bool _finite(Rect r) =>
    r.left.isFinite && r.top.isFinite && r.right.isFinite && r.bottom.isFinite;

bool _finiteNonEmpty(Rect r) => _finite(r) && !r.isEmpty;

double _area(Rect r) => r.width * r.height;
