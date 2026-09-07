/// WAVE 6 — bentuk data analitik peniaga di sisi klien.
///
/// Setiap metrik membawa KEADAANNYA sendiri, bukan hanya nombor. Sebabnya
/// mudah: "0" dan "kami tidak tahu" adalah dua kenyataan berbeza tentang
/// perniagaan seseorang, dan menggabungkan keduanya ialah cara terpantas untuk
/// hilang kepercayaan tuan kedai terhadap semua nombor lain di skrin.
library;

enum MetricState { recorded, notTracked, insufficient, unavailable }

MetricState _stateFrom(String? raw) {
  switch (raw) {
    case 'recorded':
      return MetricState.recorded;
    case 'insufficient':
      return MetricState.insufficient;
    case 'unavailable':
      return MetricState.unavailable;
    case 'not_tracked':
    default:
      return MetricState.notTracked;
  }
}

class MetricCell {
  const MetricCell({required this.value, required this.state, this.note});

  final num? value;
  final MetricState state;
  final String? note;

  bool get isMeasured => state == MetricState.recorded && value != null;

  factory MetricCell.fromMap(Map<String, dynamic>? map) {
    if (map == null) return const MetricCell(value: null, state: MetricState.unavailable);
    final rawValue = map['value'];
    return MetricCell(
      value: rawValue is num ? rawValue : null,
      state: _stateFrom(map['state'] as String?),
      note: map['note'] as String?,
    );
  }
}

class MerchantAnalytics {
  const MerchantAnalytics({
    required this.restaurantName,
    required this.fromDay,
    required this.toDay,
    required this.timezone,
    required this.metrics,
    required this.comparisonAvailable,
    required this.comparisonNote,
    required this.changes,
    required this.notTracked,
    required this.series,
  });

  final String restaurantName;
  final String fromDay;
  final String toDay;
  final String timezone;
  final Map<String, MetricCell> metrics;
  final bool comparisonAvailable;
  final String? comparisonNote;
  final Map<String, double?> changes;
  final Map<String, String> notTracked;
  final List<Map<String, dynamic>> series;

  MetricCell metric(String key) =>
      metrics[key] ?? const MetricCell(value: null, state: MetricState.unavailable);

  double? change(String key) => changes[key];

  /// Adakah ada apa-apa yang benar-benar diukur dalam tempoh ini?
  bool get hasAnyMeasurement => metrics.values.any((m) => m.isMeasured);

  factory MerchantAnalytics.fromMap(Map<String, dynamic> map) {
    final rawMetrics = (map['metrics'] as Map?)?.cast<String, dynamic>() ?? const {};
    final metrics = <String, MetricCell>{};
    rawMetrics.forEach((key, value) {
      metrics[key] = MetricCell.fromMap((value as Map?)?.cast<String, dynamic>());
    });

    final comparison = (map['comparison'] as Map?)?.cast<String, dynamic>() ?? const {};
    final rawChanges = (comparison['changes'] as Map?)?.cast<String, dynamic>() ?? const {};
    final changes = <String, double?>{};
    rawChanges.forEach((key, value) {
      changes[key] = value is num ? value.toDouble() : null;
    });

    final rawNotTracked = (map['notTracked'] as Map?)?.cast<String, dynamic>() ?? const {};
    final notTracked = <String, String>{};
    rawNotTracked.forEach((key, value) {
      if (value is String) notTracked[key] = value;
    });

    final rawSeries = (map['series'] as List?) ?? const [];

    return MerchantAnalytics(
      restaurantName: (map['restaurantName'] as String?) ?? '',
      fromDay: (map['fromDay'] as String?) ?? '',
      toDay: (map['toDay'] as String?) ?? '',
      timezone: (map['timezone'] as String?) ?? 'Asia/Kuala_Lumpur',
      metrics: metrics,
      comparisonAvailable: comparison['available'] == true,
      comparisonNote: comparison['note'] as String?,
      changes: changes,
      notTracked: notTracked,
      series: rawSeries
          .whereType<Map>()
          .map((e) => e.cast<String, dynamic>())
          .toList(growable: false),
    );
  }
}

/// Julat tarikh yang ditawarkan kepada peniaga. Sengaja pendek dan berpagar —
/// julat tanpa had akan ditolak oleh pelayan, jadi jangan tawarkan pun.
enum AnalyticsRange { last7, last30, last90 }

extension AnalyticsRangeX on AnalyticsRange {
  int get days => switch (this) {
        AnalyticsRange.last7 => 7,
        AnalyticsRange.last30 => 30,
        AnalyticsRange.last90 => 90,
      };

  String get label => switch (this) {
        AnalyticsRange.last7 => '7 hari',
        AnalyticsRange.last30 => '30 hari',
        AnalyticsRange.last90 => '90 hari',
      };
}
