import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/events/event_types.dart';
import '../../core/providers.dart';
import 'cms_impression_policy.dart';
import 'cms_visibility_geometry.dart';

/// B5 — the session's impression bookkeeping.
///
/// One policy for the whole app run, so a banner scrolled off and back on, or
/// rebuilt by a provider refresh, is recognised as the SAME banner. Holding it
/// per widget would make every rebuild a fresh impression.
final cmsImpressionPolicyProvider = Provider<CmsImpressionPolicy>((ref) {
  return CmsImpressionPolicy();
});

/// Wall-clock milliseconds used to measure dwell.
///
/// A seam, not a feature: production always reads the device clock. Widget
/// tests replace it with the test binding's fake clock, so a one-second dwell
/// can be driven deterministically through real scrolling and real geometry.
final cmsImpressionClockProvider = Provider<int Function()>((ref) {
  return () => DateTime.now().millisecondsSinceEpoch;
});

/// Wraps one banner and reports it as seen once it genuinely has been.
///
/// The rule itself lives in [CmsImpressionPolicy]; this widget's only job is to
/// measure real geometry and real lifecycle and hand them over. It renders
/// [child] unchanged and adds no layout of its own, so the approved banner
/// appearance is untouched.
class CmsImpressionTracker extends ConsumerStatefulWidget {
  const CmsImpressionTracker({
    super.key,
    required this.contentId,
    required this.placement,
    required this.child,
    this.sourceScreen,
  });

  final String contentId;
  final String placement;
  final String? sourceScreen;
  final Widget child;

  @override
  ConsumerState<CmsImpressionTracker> createState() =>
      _CmsImpressionTrackerState();
}

class _CmsImpressionTrackerState extends ConsumerState<CmsImpressionTracker>
    with WidgetsBindingObserver {
  /// Sampling interval. Fast enough that a one-second dwell is measured to
  /// within a quarter second, slow enough to be invisible on battery. The timer
  /// stops the moment this banner is counted, so it is not a permanent cost.
  static const _sampleInterval = Duration(milliseconds: 250);

  Timer? _timer;
  bool _foregrounded = true;

  /// False while this subtree is offstage (an opaque route covers it).
  bool _tickersEnabled = true;

  /// Every route this banner sits inside, nearest first: its own page, then
  /// the route hosting that page's navigator, and so on to the root.
  List<Route<dynamic>> _enclosingRoutes = const [];

  /// Whether nothing covers the page this banner is on. Checked at EVERY
  /// level: a dialog on the root navigator covers a page inside a nested
  /// (shell branch) navigator without making that page's own route
  /// non-current, and a bottom sheet on the nested navigator does the reverse.
  bool get _routesInFront =>
      _tickersEnabled && _enclosingRoutes.every((route) => route.isCurrent);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _tickersEnabled = TickerMode.valuesOf(context).enabled;
    _enclosingRoutes = _routeChain(context);
  }

  static List<Route<dynamic>> _routeChain(BuildContext context) {
    final routes = <Route<dynamic>>[];
    var route = ModalRoute.of(context);
    while (route != null && !routes.contains(route)) {
      routes.add(route);
      // The route that hosts this route's navigator is looked up from that
      // navigator's Overlay rather than the Navigator itself: an Overlay
      // rebuild is trivial (its entries are cached widgets), whereas a
      // Navigator dependency change rebuilds every page it holds.
      final overlayContext = route.navigator?.overlay?.context;
      if (overlayContext == null) break;
      route = ModalRoute.of(overlayContext);
    }
    return routes;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _foregrounded =
        WidgetsBinding.instance.lifecycleState != AppLifecycleState.paused;
    _startSampling();
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant CmsImpressionTracker oldWidget) {
    super.didUpdateWidget(oldWidget);
    // The slot now shows a DIFFERENT banner in the same position. The old
    // banner's part-finished dwell must not be credited to the new one.
    if (oldWidget.contentId != widget.contentId ||
        oldWidget.placement != widget.placement) {
      _startSampling();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final foreground = state == AppLifecycleState.resumed;
    if (foreground == _foregrounded) return;
    _foregrounded = foreground;
    if (!foreground) {
      // Time behind another app is not time spent looking at a banner.
      ref.read(cmsImpressionPolicyProvider).onBackgrounded();
    }
  }

  void _startSampling() {
    _timer?.cancel();
    final policy = ref.read(cmsImpressionPolicyProvider);
    if (policy.hasCounted(widget.placement, widget.contentId)) return;
    _timer = Timer.periodic(_sampleInterval, (_) => _sample());
  }

  void _sample() {
    if (!mounted) {
      _timer?.cancel();
      return;
    }
    final policy = ref.read(cmsImpressionPolicyProvider);
    if (policy.hasCounted(widget.placement, widget.contentId)) {
      _timer?.cancel();
      return;
    }

    final fraction = _visibleFraction();
    final counted = policy.observe(
      placement: widget.placement,
      contentId: widget.contentId,
      visibleFraction: fraction,
      foregrounded: _foregrounded,
      nowMs: ref.read(cmsImpressionClockProvider)(),
    );
    if (!counted) return;

    _timer?.cancel();
    _logImpression();
  }

  /// How much of this card a person can actually see right now.
  ///
  /// Not "inside the window": a banner scrolled under a fixed header or a
  /// pinned header, behind the keyboard or a system bar, beside a page view, or
  /// inside an Offstage subtree is inside the window and still unseen. See
  /// [cmsUnobstructedVisibleFraction] for how the render tree is read.
  double _visibleFraction() {
    // A page covered by another route is either not painted at all (an opaque
    // route above it takes it offstage, which disables its tickers) or sits
    // under a barrier, dialog or sheet (some enclosing route is no longer
    // current). The render tree still reports geometry in both cases, so these
    // are checked first. `isCurrent` is read live on every sample.
    if (!_routesInFront) return 0;
    final box = context.findRenderObject();
    if (box is! RenderBox) return 0;
    final view = View.maybeOf(context);
    if (view == null) return 0;
    return cmsUnobstructedVisibleFraction(
      box,
      viewable: cmsViewableScreenRect(view),
    );
  }

  void _logImpression() {
    // Fire-and-forget through the one existing client contract. EventLogger
    // swallows its own failures, so a logging problem can never disturb the
    // screen the customer is looking at.
    ref.read(eventLoggerProvider).logEvent(
          EventType.cmsImpression,
          sourceScreen: widget.sourceScreen,
          metadata: {
            'contentId': widget.contentId,
            'placement': widget.placement,
            // The server refuses anything that does not assert this, so a
            // backend read or an offscreen build can never arrive as one.
            'visible': true,
          },
        );
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
