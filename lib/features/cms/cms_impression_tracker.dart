import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/events/event_types.dart';
import '../../core/providers.dart';
import 'cms_impression_policy.dart';

/// B5 — the session's impression bookkeeping.
///
/// One policy for the whole app run, so a banner scrolled off and back on, or
/// rebuilt by a provider refresh, is recognised as the SAME banner. Holding it
/// per widget would make every rebuild a fresh impression.
final cmsImpressionPolicyProvider = Provider<CmsImpressionPolicy>((ref) {
  return CmsImpressionPolicy();
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
      nowMs: DateTime.now().millisecondsSinceEpoch,
    );
    if (!counted) return;

    _timer?.cancel();
    _logImpression();
  }

  /// How much of this card is on screen right now.
  ///
  /// Measured against the window, not the enclosing scrollable: a banner can be
  /// inside a viewport that is itself pushed off screen by a sheet or a
  /// keyboard, and only the window tells the truth about what the person can
  /// actually see.
  double _visibleFraction() {
    final box = context.findRenderObject();
    if (box is! RenderBox || !box.hasSize || !box.attached) return 0;
    final size = box.size;
    if (size.height <= 0) return 0;

    final topLeft = box.localToGlobal(Offset.zero);
    final view = View.maybeOf(context);
    if (view == null) return 0;
    final viewportHeight = view.physicalSize.height / view.devicePixelRatio;

    return visibleFractionOf(
      childTop: topLeft.dy,
      childHeight: size.height,
      viewportTop: 0,
      viewportHeight: viewportHeight,
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
