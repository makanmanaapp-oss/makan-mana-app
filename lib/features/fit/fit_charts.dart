import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';

/// Carta ringan custom-paint untuk MakanMana Monitor.
/// Tiada dependency luar - penuh kawalan gaya, ringan pada peranti low-end.

// ---------- Cincin skor (Daily Fit Score) ----------

class FitScoreRing extends StatelessWidget {
  const FitScoreRing({
    super.key,
    required this.score,
    this.size = 132,
    this.label,
  });

  final int score;
  final double size;
  final String? label;

  Color get _color => score >= 75
      ? AppColors.healthyGreen
      : score >= 45
          ? AppColors.warmYellow
          : AppColors.warningOrange;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _RingPainter(
          progress: (score / 100).clamp(0.0, 1.0),
          color: _color,
          trackColor: AppColors.softBorder,
          strokeWidth: size * 0.085,
        ),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '$score',
                style: TextStyle(
                  fontSize: size * 0.27,
                  fontWeight: FontWeight.w800,
                  color: AppColors.darkText,
                  height: 1.05,
                ),
              ),
              Text(
                label ?? '/100',
                style: TextStyle(
                  fontSize: size * 0.095,
                  fontWeight: FontWeight.w600,
                  color: AppColors.mutedText,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter({
    required this.progress,
    required this.color,
    required this.trackColor,
    required this.strokeWidth,
  });

  final double progress;
  final Color color;
  final Color trackColor;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = (size.shortestSide - strokeWidth) / 2;
    final track = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..color = trackColor;
    final arc = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..color = color;
    canvas.drawCircle(center, radius, track);
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -math.pi / 2,
      2 * math.pi * progress,
      false,
      arc,
    );
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.progress != progress || old.color != color;
}

// ---------- Bar mendatar kecil (sasaran vs capaian) ----------

class TargetBar extends StatelessWidget {
  const TargetBar({
    super.key,
    required this.label,
    required this.value,
    required this.target,
    required this.unit,
    this.color = AppColors.primaryRed,
  });

  final String label;
  final num value;
  final num target;
  final String unit;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final pct = target <= 0 ? 0.0 : (value / target).clamp(0.0, 1.0);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label,
                  style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: AppColors.mutedText)),
              Text('${_fmt(value)} / ${_fmt(target)} $unit',
                  style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                      color: AppColors.darkText)),
            ],
          ),
          const SizedBox(height: 5),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: pct,
              minHeight: 8,
              backgroundColor: AppColors.softBorder.withValues(alpha: 0.6),
              valueColor: AlwaysStoppedAnimation(color),
            ),
          ),
        ],
      ),
    );
  }

  static String _fmt(num v) => v >= 1000
      ? v
          .round()
          .toString()
          .replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]},')
      : (v == v.roundToDouble() ? v.round().toString() : v.toStringAsFixed(1));
}

// ---------- Carta bar mingguan ----------

class WeeklyBarChart extends StatelessWidget {
  const WeeklyBarChart({
    super.key,
    required this.values,
    required this.dayLabels,
    this.target,
    this.color = AppColors.primaryRed,
    this.height = 130,
  });

  final List<double> values;
  final List<String> dayLabels;
  final double? target;
  final Color color;
  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: CustomPaint(
        size: Size.infinite,
        painter: _BarPainter(
          values: values,
          labels: dayLabels,
          target: target,
          color: color,
          todayIndex: DateTime.now().weekday - 1,
        ),
      ),
    );
  }
}

class _BarPainter extends CustomPainter {
  _BarPainter({
    required this.values,
    required this.labels,
    required this.color,
    required this.todayIndex,
    this.target,
  });

  final List<double> values;
  final List<String> labels;
  final double? target;
  final Color color;
  final int todayIndex;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty) return;
    const labelH = 20.0;
    final chartH = size.height - labelH;
    final maxV =
        math.max(values.fold<double>(0, math.max), (target ?? 0) * 1.05);
    final safeMax = maxV <= 0 ? 1.0 : maxV;
    final slot = size.width / values.length;
    final barW = slot * 0.46;

    for (var i = 0; i < values.length; i++) {
      final h = (values[i] / safeMax) * (chartH - 8);
      final x = slot * i + (slot - barW) / 2;
      final isToday = i == todayIndex;
      final paint = Paint()
        ..color = values[i] <= 0
            ? AppColors.softBorder.withValues(alpha: 0.7)
            : (isToday ? color : color.withValues(alpha: 0.45));
      final barH = math.max(h, 4.0);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(x, chartH - barH, barW, barH),
          const Radius.circular(5),
        ),
        paint,
      );
      // Label hari
      final tp = TextPainter(
        text: TextSpan(
          text: labels.length > i ? labels[i] : '',
          style: TextStyle(
            fontSize: 10.5,
            fontWeight: isToday ? FontWeight.w800 : FontWeight.w600,
            color: isToday ? AppColors.darkText : AppColors.mutedText,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, Offset(slot * i + (slot - tp.width) / 2, chartH + 4));
    }

    // Garis sasaran putus-putus
    if (target != null && target! > 0) {
      final y = chartH - (target! / safeMax) * (chartH - 8);
      final dash = Paint()
        ..color = AppColors.mutedText.withValues(alpha: 0.55)
        ..strokeWidth = 1.2;
      var x = 0.0;
      while (x < size.width) {
        canvas.drawLine(Offset(x, y), Offset(x + 5, y), dash);
        x += 9;
      }
    }
  }

  @override
  bool shouldRepaint(_BarPainter old) => old.values != values;
}

// ---------- Carta garis (trend) ----------

class TrendLineChart extends StatelessWidget {
  const TrendLineChart({
    super.key,
    required this.values,
    this.secondValues,
    this.target,
    this.color = AppColors.primaryRed,
    this.secondColor = AppColors.healthyGreen,
    this.height = 120,
    this.labels = const [],
  });

  final List<double> values;
  final List<double>? secondValues;
  final double? target;
  final Color color;
  final Color secondColor;
  final double height;
  final List<String> labels;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: CustomPaint(
        size: Size.infinite,
        painter: _LinePainter(
          values: values,
          secondValues: secondValues,
          target: target,
          color: color,
          secondColor: secondColor,
          labels: labels,
        ),
      ),
    );
  }
}

class _LinePainter extends CustomPainter {
  _LinePainter({
    required this.values,
    required this.color,
    required this.secondColor,
    required this.labels,
    this.secondValues,
    this.target,
  });

  final List<double> values;
  final List<double>? secondValues;
  final double? target;
  final Color color;
  final Color secondColor;
  final List<String> labels;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.length < 2) return;
    const labelH = 18.0;
    final chartH = size.height - labelH;
    final all = [
      ...values,
      ...?secondValues,
      if (target != null) target!,
    ].where((v) => v > 0).toList();
    if (all.isEmpty) return;
    final maxV = all.fold<double>(0, math.max) * 1.1;
    final minV = all.fold<double>(double.infinity, math.min) * 0.92;
    final range = math.max(maxV - minV, 1);

    Offset point(int i, double v) => Offset(
          size.width * i / (values.length - 1),
          chartH - ((v - minV) / range) * (chartH - 10) - 4,
        );

    void drawSeries(List<double> series, Color c, {bool fill = false}) {
      final pts = <Offset>[];
      for (var i = 0; i < series.length; i++) {
        if (series[i] > 0) pts.add(point(i, series[i]));
      }
      if (pts.length < 2) {
        if (pts.length == 1) {
          canvas.drawCircle(pts.first, 3.5, Paint()..color = c);
        }
        return;
      }
      final path = Path()..moveTo(pts.first.dx, pts.first.dy);
      for (final p in pts.skip(1)) {
        path.lineTo(p.dx, p.dy);
      }
      if (fill) {
        final fillPath = Path.from(path)
          ..lineTo(pts.last.dx, chartH)
          ..lineTo(pts.first.dx, chartH)
          ..close();
        canvas.drawPath(fillPath, Paint()..color = c.withValues(alpha: 0.08));
      }
      canvas.drawPath(
        path,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.4
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round
          ..color = c,
      );
      canvas.drawCircle(pts.last, 4, Paint()..color = c);
      canvas.drawCircle(
          pts.last,
          4,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2
            ..color = Colors.white);
    }

    // Garis sasaran
    if (target != null && target! > 0) {
      final y = chartH - ((target! - minV) / range) * (chartH - 10) - 4;
      final dash = Paint()
        ..color = AppColors.mutedText.withValues(alpha: 0.5)
        ..strokeWidth = 1.2;
      var x = 0.0;
      while (x < size.width) {
        canvas.drawLine(Offset(x, y), Offset(x + 5, y), dash);
        x += 9;
      }
    }

    drawSeries(values, color, fill: true);
    if (secondValues != null) drawSeries(secondValues!, secondColor);

    // Label paksi-x
    for (var i = 0; i < labels.length && i < values.length; i++) {
      final tp = TextPainter(
        text: TextSpan(
          text: labels[i],
          style: const TextStyle(
              fontSize: 10,
              color: AppColors.mutedText,
              fontWeight: FontWeight.w600),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      final x = size.width * i / (values.length - 1) - tp.width / 2;
      tp.paint(canvas, Offset(x.clamp(0, size.width - tp.width), chartH + 3));
    }
  }

  @override
  bool shouldRepaint(_LinePainter old) => old.values != values;
}

// ---------- Donut makro ----------

class MacroDonut extends StatelessWidget {
  const MacroDonut({
    super.key,
    required this.proteinG,
    required this.carbsG,
    required this.fatG,
    this.size = 110,
  });

  final int proteinG;
  final int carbsG;
  final int fatG;
  final double size;

  static const proteinColor = Color(0xFFE7352C);
  static const carbsColor = Color(0xFFFFC83D);
  static const fatColor = Color(0xFF3B82F6);

  @override
  Widget build(BuildContext context) {
    final totalKcal = (proteinG * 4 + carbsG * 4 + fatG * 9).toDouble();
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _DonutPainter(
          segments: totalKcal <= 0
              ? const [(1.0, AppColors.softBorder)]
              : [
                  (proteinG * 4 / totalKcal, proteinColor),
                  (carbsG * 4 / totalKcal, carbsColor),
                  (fatG * 9 / totalKcal, fatColor),
                ],
          strokeWidth: size * 0.14,
        ),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                totalKcal <= 0 ? '-' : '${totalKcal.round()}',
                style: TextStyle(
                    fontSize: size * 0.17,
                    fontWeight: FontWeight.w800,
                    color: AppColors.darkText),
              ),
              Text('kcal',
                  style: TextStyle(
                      fontSize: size * 0.1,
                      color: AppColors.mutedText,
                      fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ),
    );
  }
}

class _DonutPainter extends CustomPainter {
  _DonutPainter({required this.segments, required this.strokeWidth});

  final List<(double, Color)> segments;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = (size.shortestSide - strokeWidth) / 2;
    var start = -math.pi / 2;
    for (final (frac, color) in segments) {
      if (frac <= 0) continue;
      final sweep = 2 * math.pi * frac;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        start,
        sweep - 0.04,
        false,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = strokeWidth
          ..strokeCap = StrokeCap.butt
          ..color = color,
      );
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(_DonutPainter old) => old.segments != segments;
}
