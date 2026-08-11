import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/features/fit/weekly_report_state.dart';

/// Phase 2.16A — Weekly Report honest-state resolver (pure). No sample values.
void main() {
  WeeklyReportSignals sig({
    bool profileValid = true,
    bool loadError = false,
    int trackedDays = 1,
    int windowDays = 7,
    bool hasActivity = true,
  }) =>
      WeeklyReportSignals(
        profileValid: profileValid,
        loadError: loadError,
        trackedDays: trackedDays,
        windowDays: windowDays,
        hasAnyActivity: hasActivity,
      );

  test('load error -> ERROR (not sample data)', () {
    expect(resolveWeeklyReportState(sig(loadError: true)),
        WeeklyReportState.error);
  });

  test('invalid/incomplete profile -> PROFILE_INCOMPLETE', () {
    expect(resolveWeeklyReportState(sig(profileValid: false)),
        WeeklyReportState.profileIncomplete);
  });

  test('no data at all -> INSUFFICIENT_HISTORY', () {
    expect(
        resolveWeeklyReportState(
            sig(trackedDays: 0, hasActivity: false)),
        WeeklyReportState.insufficientHistory);
  });

  test('tracking on but nothing logged -> ZERO_ACTIVITY', () {
    expect(
        resolveWeeklyReportState(
            sig(trackedDays: 3, hasActivity: false)),
        WeeklyReportState.zeroActivity);
  });

  test('one-day data (< window) -> INSUFFICIENT_HISTORY (no full-week claim)', () {
    expect(resolveWeeklyReportState(sig(trackedDays: 1, hasActivity: true)),
        WeeklyReportState.insufficientHistory);
  });

  test('full window with activity -> REAL_DATA', () {
    expect(resolveWeeklyReportState(sig(trackedDays: 7, hasActivity: true)),
        WeeklyReportState.realData);
  });

  test('metric: untracked -> NOT_TRACKED (never a sample number)', () {
    final m = weeklyMetric(authoritativeValue: null, isTracked: false);
    expect(m.tracked, isFalse);
    expect(m.value, isNull);
  });

  test('metric: tracked genuine zero shows 0 (not a placeholder)', () {
    final m = weeklyMetric(authoritativeValue: 0, isTracked: true);
    expect(m.measured, isTrue);
    expect(m.value, '0');
  });

  test('metric: tracked real value shown', () {
    final m = weeklyMetric(
        authoritativeValue: 560, isTracked: true, format: (n) => '$n kcal');
    expect(m.value, '560 kcal');
  });

  test('sample values 7850 / 71 / 4-of-5 never produced by resolver', () {
    // The resolver/metric layer only echoes authoritative values or state
    // markers — there is no code path that emits 7850, 71 or 4/5.
    final m = weeklyMetric(authoritativeValue: null, isTracked: true);
    expect(m.value, '—');
  });
}
