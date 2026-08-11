/// Phase 2.16A — Weekly Report honest data-state model (pure, testable).
///
/// Fixes the 2.16 defect where the report card showed sample values
/// (4/5, 7,850, 71%) instead of real data. Sample/placeholder values are never
/// produced here — the UI shows an honest state and only measured metrics.
library;

enum WeeklyReportState {
  /// Enough authoritative account data for the report window.
  realData,

  /// Some data, but fewer tracked days than the full report window.
  insufficientHistory,

  /// Tracking active, authoritative count is zero.
  zeroActivity,

  /// A metric/section is not collected or unavailable.
  notTracked,

  /// Dependent Fit profile is missing or invalid.
  profileIncomplete,

  /// Authoritative data could not be loaded.
  error,
}

/// Signals derived from authoritative aggregation (never from placeholders).
class WeeklyReportSignals {
  final bool profileValid;
  final bool loadError;

  /// Days elapsed in the current report window that could be inspected.
  final int trackedDays;

  /// Full report window length (e.g. 7 for a week).
  final int windowDays;

  /// Whether ANY authoritative activity exists (meals/workouts/steps) in window.
  final bool hasAnyActivity;

  const WeeklyReportSignals({
    required this.profileValid,
    required this.loadError,
    required this.trackedDays,
    required this.windowDays,
    required this.hasAnyActivity,
  });
}

WeeklyReportState resolveWeeklyReportState(WeeklyReportSignals s) {
  if (s.loadError) return WeeklyReportState.error;
  if (!s.profileValid) return WeeklyReportState.profileIncomplete;
  if (!s.hasAnyActivity) {
    // No activity at all: distinguish "tracking on, nothing logged" (zero) from
    // "we have not observed any tracked day yet".
    return s.trackedDays <= 0
        ? WeeklyReportState.insufficientHistory
        : WeeklyReportState.zeroActivity;
  }
  if (s.trackedDays < s.windowDays) return WeeklyReportState.insufficientHistory;
  return WeeklyReportState.realData;
}

/// A single metric's honest display: a real measured value, or a state marker.
/// NEVER a sample/placeholder number.
class WeeklyMetricDisplay {
  final String? value; // formatted real value, or null when not shown as number
  final bool tracked;
  final bool measured;
  const WeeklyMetricDisplay._(this.value, this.tracked, this.measured);

  /// A measured real value.
  factory WeeklyMetricDisplay.measured(String value) =>
      WeeklyMetricDisplay._(value, true, true);

  /// Tracked, but no value yet (honest dash, not zero-as-fact unless zero real).
  factory WeeklyMetricDisplay.noValue() =>
      const WeeklyMetricDisplay._('—', true, false);

  /// The metric is not collected at all.
  factory WeeklyMetricDisplay.notTracked() =>
      const WeeklyMetricDisplay._(null, false, false);
}

/// Build a metric display from an authoritative (possibly null) value.
/// [isTracked] says whether the metric is collected at all (e.g. steps require
/// an activity source). A tracked metric with a real number shows it (including
/// a genuine 0); an untracked metric shows NOT_TRACKED — never a sample.
WeeklyMetricDisplay weeklyMetric({
  required num? authoritativeValue,
  required bool isTracked,
  String Function(num)? format,
}) {
  if (!isTracked) return WeeklyMetricDisplay.notTracked();
  final v = authoritativeValue;
  if (v == null) return WeeklyMetricDisplay.noValue();
  final f = format ?? (n) => n.toString();
  return WeeklyMetricDisplay.measured(f(v));
}
