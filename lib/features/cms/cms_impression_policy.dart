/// B5 — when a banner has actually been SEEN.
///
/// Pure and clock-injected on purpose. Everything that decides whether an
/// impression happened lives here, with no Flutter, no timers and no Firestore,
/// so the rule can be tested directly instead of through a widget tree that
/// would make scroll jitter and rebuilds impossible to reproduce.
///
/// WHAT IS NOT AN IMPRESSION. Fetching the content is not. Building the widget
/// is not. Being laid out below the fold is not. Being on screen for a single
/// frame while the user flicks past is not. Counting any of those would report
/// an audience that never looked, which is worse for an operator than reporting
/// nothing — they would price a campaign on it.
///
/// THE RULE: at least [minVisibleFraction] of the card visible, continuously,
/// for at least [minVisibleDwell], while the app is in the foreground.
///
/// THE COUNTING WINDOW: once per (placement, contentId) per app session. A
/// session ends when the app process does. Scrolling a banner off and back on,
/// a provider refresh, an image reload and a widget rebuild all reuse the same
/// key, so none of them can count twice. The server additionally deduplicates
/// per user per Malaysia business day, so even a fresh session cannot inflate a
/// day's total for the same person.
library;

class CmsImpressionPolicy {
  CmsImpressionPolicy({
    this.minVisibleFraction = 0.5,
    this.minVisibleDwell = const Duration(seconds: 1),
  });

  /// How much of the card must be on screen. Half is the point at which a
  /// person can read the headline and recognise the image.
  final double minVisibleFraction;

  /// How long that must hold. One second is long enough to exclude a flick
  /// past and short enough not to lose a genuine glance.
  final Duration minVisibleDwell;

  /// When the current continuous visible stretch began, per key. Cleared the
  /// moment visibility or foreground is lost, so the dwell must be re-earned
  /// rather than accumulated across interruptions.
  final Map<String, int> _visibleSinceMs = {};

  /// Keys already counted this session. This is the dedupe that survives
  /// rebuilds, refetches and scrolling away and back.
  final Set<String> _counted = {};

  static String keyFor(String placement, String contentId) =>
      '$placement|$contentId';

  bool hasCounted(String placement, String contentId) =>
      _counted.contains(keyFor(placement, contentId));

  /// Feed one observation. Returns true EXACTLY ONCE per key — on the
  /// observation that completes the dwell.
  ///
  /// [visibleFraction] is 0..1 of the card's own area that is on screen.
  bool observe({
    required String placement,
    required String contentId,
    required double visibleFraction,
    required bool foregrounded,
    required int nowMs,
  }) {
    if (placement.isEmpty || contentId.isEmpty) return false;
    final key = keyFor(placement, contentId);
    if (_counted.contains(key)) return false;

    final visibleEnough = foregrounded &&
        visibleFraction.isFinite &&
        visibleFraction >= minVisibleFraction;

    if (!visibleEnough) {
      // Not "pause and resume": the stretch is abandoned. A banner half-seen
      // twice for 600ms is not the same as one seen for 1.2 seconds.
      _visibleSinceMs.remove(key);
      return false;
    }

    final since = _visibleSinceMs[key];
    if (since == null) {
      _visibleSinceMs[key] = nowMs;
      return false;
    }

    // A clock that jumped backwards (device time change, NTP correction) must
    // not be read as a completed dwell. Restart the stretch instead.
    if (nowMs < since) {
      _visibleSinceMs[key] = nowMs;
      return false;
    }

    if (nowMs - since < minVisibleDwell.inMilliseconds) return false;

    _counted.add(key);
    _visibleSinceMs.remove(key);
    return true;
  }

  /// The app left the foreground. Every in-flight stretch is abandoned —
  /// time spent behind another app is not time spent looking at a banner.
  void onBackgrounded() => _visibleSinceMs.clear();

  /// Test and teardown seam. Does NOT clear [_counted] on its own; use
  /// [resetForNewSession] for that.
  void clearPending() => _visibleSinceMs.clear();

  void resetForNewSession() {
    _visibleSinceMs.clear();
    _counted.clear();
  }
}

/// How much of [child] lies inside [viewport], as a fraction of the child's own
/// area.
///
/// Returns 0 for a degenerate box rather than dividing by zero: a card with no
/// height has not been seen, and NaN would sail past a `>= 0.5` comparison in
/// neither direction predictably.
double visibleFractionOf({
  required double childTop,
  required double childHeight,
  required double viewportTop,
  required double viewportHeight,
}) {
  if (!childHeight.isFinite || childHeight <= 0) return 0;
  if (!viewportHeight.isFinite || viewportHeight <= 0) return 0;
  if (!childTop.isFinite || !viewportTop.isFinite) return 0;

  final childBottom = childTop + childHeight;
  final viewportBottom = viewportTop + viewportHeight;
  final top = childTop > viewportTop ? childTop : viewportTop;
  final bottom = childBottom < viewportBottom ? childBottom : viewportBottom;
  final overlap = bottom - top;
  if (overlap <= 0) return 0;
  final fraction = overlap / childHeight;
  return fraction > 1 ? 1 : fraction;
}
