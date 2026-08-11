import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../constants/app_colors.dart';

/// MAKANMANA ICON SYSTEM (spec "Icon & Button System").
/// Keluarga vector proprietary: grid master 24x24, stroke 2.0, round caps
/// dan round joins. Default outline; `filled: true` untuk keadaan aktif.
/// Warna dipandu tema melalui parameter [color]; [accent] = aksen mikro
/// kuning terkawal (duotone). TIADA emoji sistem.
enum MmIconType {
  // Navigasi & signature.
  spin,
  home,
  explore,
  history,
  profile,
  // Cadangan & citarasa.
  foodMatch,
  pick,
  foodMemory,
  tasteProfile,
  mealHistory,
  // Mood.
  pedas,
  bajet,
  lapar,
  berhampiran,
  healthy,
  surprise,
  cafe,
  hujan,
  supper,
  highRating,
  // Ciri.
  fitCoach,
  dietAllergy,
  cuisine,
  mealLog,
  mealWallet,
  budgetCoach,
  groupDecision,
  tongtongBill,
  proSeal,
}

/// Penrender ikon tunggal (MmIcon spec). Sentiasa beri [semanticLabel]
/// apabila ikon berdiri sendiri tanpa teks.
class MmIcon extends StatelessWidget {
  const MmIcon(
    this.type, {
    super.key,
    this.size = 24,
    this.color,
    this.accent,
    this.filled = false,
    this.semanticLabel,
  });

  final MmIconType type;
  final double size;
  final Color? color;

  /// Aksen mikro (lalai warmYellow apabila ikon perlukannya).
  final Color? accent;
  final bool filled;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final c = color ?? IconTheme.of(context).color ?? AppColors.iconNeutral;
    return Semantics(
      label: semanticLabel,
      child: SizedBox(
        width: size,
        height: size,
        child: CustomPaint(
          painter: _MmIconPainter(
            type: type,
            color: c,
            accent: accent ?? AppColors.warmYellow,
            filled: filled,
          ),
        ),
      ),
    );
  }
}

class _MmIconPainter extends CustomPainter {
  const _MmIconPainter({
    required this.type,
    required this.color,
    required this.accent,
    required this.filled,
  });

  final MmIconType type;
  final Color color;
  final Color accent;
  final bool filled;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 24;
    canvas.scale(s, s);

    // W2 §7: berat visual sepadan ikon Material — 2.2 pada grid 24 supaya
    // kekal terbaca pada 20px; keadaan dipilih (filled) sedikit lebih berat.
    final w = filled ? 2.4 : 2.2;
    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = w
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final fill = Paint()
      ..color = color
      ..style = PaintingStyle.fill;
    final accentStroke = Paint()
      ..color = accent
      ..style = PaintingStyle.stroke
      ..strokeWidth = w
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    switch (type) {
      case MmIconType.spin:
        _spin(canvas, stroke, fill, accentStroke);
      case MmIconType.home:
        _home(canvas, stroke, fill);
      case MmIconType.explore:
        _explore(canvas, stroke, fill);
      case MmIconType.history:
        _history(canvas, stroke, fill);
      case MmIconType.profile:
        _profile(canvas, stroke, fill);
      case MmIconType.foodMatch:
        _foodMatch(canvas, stroke, fill);
      case MmIconType.pick:
        _pick(canvas, stroke, fill);
      case MmIconType.foodMemory:
        _foodMemory(canvas, stroke, fill);
      case MmIconType.tasteProfile:
        _tasteProfile(canvas, stroke, fill);
      case MmIconType.mealHistory:
        _mealHistory(canvas, stroke, accentStroke);
      case MmIconType.pedas:
        _pedas(canvas, stroke);
      case MmIconType.bajet:
        _bajet(canvas, stroke);
      case MmIconType.lapar:
        _lapar(canvas, stroke);
      case MmIconType.berhampiran:
        _berhampiran(canvas, stroke, fill);
      case MmIconType.healthy:
        _healthy(canvas, stroke);
      case MmIconType.surprise:
        _surprise(canvas, stroke);
      case MmIconType.cafe:
        _cafe(canvas, stroke);
      case MmIconType.hujan:
        _hujan(canvas, stroke);
      case MmIconType.supper:
        _supper(canvas, stroke);
      case MmIconType.highRating:
        _star(canvas, stroke, fill);
      case MmIconType.fitCoach:
        _fitCoach(canvas, stroke);
      case MmIconType.dietAllergy:
        _dietAllergy(canvas, stroke);
      case MmIconType.cuisine:
        _cuisine(canvas, stroke);
      case MmIconType.mealLog:
        _mealLog(canvas, stroke);
      case MmIconType.mealWallet:
        _mealWallet(canvas, stroke);
      case MmIconType.budgetCoach:
        _budgetCoach(canvas, stroke);
      case MmIconType.groupDecision:
        _groupDecision(canvas, stroke, fill);
      case MmIconType.tongtongBill:
        _tongtongBill(canvas, stroke);
      case MmIconType.proSeal:
        _proSeal(canvas, stroke, fill);
    }
  }

  // ---- Signature & navigasi ----

  /// Spin: pinggan + kutleri + isyarat gerakan halus. BUKAN roda game.
  void _spin(Canvas c, Paint p, Paint f, Paint a) {
    // Pinggan.
    c.drawCircle(const Offset(12, 12), 6.5, filled ? f : p);
    if (!filled) c.drawCircle(const Offset(12, 12), 3, p);
    // Garpu kiri (pemegang + 2 tine ringkas).
    c.drawLine(const Offset(3, 7), const Offset(3, 17), p);
    // Pisau/sudu kanan.
    c.drawLine(const Offset(21, 7), const Offset(21, 17), p);
    // Isyarat gerakan (arka pendek atas — aksen terkawal).
    final rect = Rect.fromCircle(center: const Offset(12, 12), radius: 9.4);
    c.drawArc(rect, -math.pi / 2.6, math.pi / 3.2, false, a);
  }

  /// Home: rumah + motif pinggan kecil.
  void _home(Canvas c, Paint p, Paint f) {
    final path = Path()
      ..moveTo(4.5, 11)
      ..lineTo(12, 4.5)
      ..lineTo(19.5, 11)
      ..lineTo(19.5, 19.5)
      ..lineTo(4.5, 19.5)
      ..close();
    c.drawPath(path, filled ? f : p);
    c.drawCircle(
        const Offset(12, 14.5),
        2.4,
        filled
            ? (Paint()
              ..color = Colors.white
              ..style = PaintingStyle.stroke
              ..strokeWidth = 2)
            : p);
  }

  /// Explore: kompas dengan jarum berlian.
  void _explore(Canvas c, Paint p, Paint f) {
    c.drawCircle(const Offset(12, 12), 8.5, filled ? f : p);
    final needle = Path()
      ..moveTo(12, 6.8)
      ..lineTo(14.6, 12)
      ..lineTo(12, 17.2)
      ..lineTo(9.4, 12)
      ..close();
    if (filled) {
      c.drawPath(
          needle,
          Paint()
            ..color = Colors.white
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2
            ..strokeJoin = StrokeJoin.round);
    } else {
      c.drawPath(needle, p);
    }
  }

  /// History: jam dengan jarum + petunjuk pinggan.
  void _history(Canvas c, Paint p, Paint f) {
    c.drawCircle(const Offset(12, 12), 8.5, filled ? f : p);
    final hand = filled
        ? (Paint()
          ..color = Colors.white
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..strokeCap = StrokeCap.round)
        : p;
    c.drawLine(const Offset(12, 8), const Offset(12, 12.5), hand);
    c.drawLine(const Offset(12, 12.5), const Offset(15.2, 14.5), hand);
  }

  /// Profile: siluet pengguna + detail titik pinggan kecil.
  void _profile(Canvas c, Paint p, Paint f) {
    c.drawCircle(const Offset(12, 8), 3.6, filled ? f : p);
    final shoulders = Path()
      ..moveTo(5, 19.5)
      ..quadraticBezierTo(12, 12.6, 19, 19.5);
    c.drawPath(shoulders, p);
    if (!filled) c.drawCircle(const Offset(12, 17.4), 1, p);
  }

  // ---- Cadangan & citarasa ----

  /// Food Match: tolok berbentuk pinggan + jarum.
  void _foodMatch(Canvas c, Paint p, Paint f) {
    final rect = Rect.fromCircle(center: const Offset(12, 14.5), radius: 8);
    c.drawArc(rect, math.pi, math.pi, false, p);
    c.drawLine(const Offset(12, 14.5), const Offset(16.2, 9.8), p);
    c.drawCircle(const Offset(12, 14.5), 1.2, f);
  }

  /// MakanMana Pick: kubah hidangan + penanda pilihan.
  void _pick(Canvas c, Paint p, Paint f) {
    final rect = Rect.fromCircle(center: const Offset(12, 15), radius: 7.5);
    c.drawArc(rect, math.pi, math.pi, false, p);
    c.drawLine(const Offset(3.5, 15.5), const Offset(20.5, 15.5), p);
    c.drawCircle(const Offset(12, 6), 1.3, f);
  }

  /// Food Memory: pinggan + nod data (garis memori).
  void _foodMemory(Canvas c, Paint p, Paint f) {
    c.drawCircle(const Offset(12, 13), 7.5, p);
    c.drawLine(const Offset(9, 9.5), const Offset(9, 16.5), p);
    c.drawLine(const Offset(12, 8.5), const Offset(12, 17.5), p);
    c.drawLine(const Offset(15, 9.5), const Offset(15, 16.5), p);
    c.drawCircle(const Offset(9, 7), 1, f);
    c.drawCircle(const Offset(15, 7), 1, f);
  }

  /// Taste Profile: wajah rasa atas pinggan (personal, bukan medikal).
  void _tasteProfile(Canvas c, Paint p, Paint f) {
    c.drawCircle(const Offset(12, 13), 7.5, p);
    c.drawCircle(const Offset(9.4, 11.4), 0.9, f);
    c.drawCircle(const Offset(14.6, 11.4), 0.9, f);
    final smile = Path()
      ..moveTo(9, 15)
      ..quadraticBezierTo(12, 17.4, 15, 15);
    c.drawPath(smile, p);
  }

  /// Meal History: pinggan + garis dasar tarikh.
  void _mealHistory(Canvas c, Paint p, Paint a) {
    c.drawCircle(const Offset(10, 11), 5.5, p);
    c.drawLine(const Offset(18.5, 6.5), const Offset(18.5, 13), p);
    c.drawLine(const Offset(4.5, 19.5), const Offset(19.5, 19.5), a);
  }

  // ---- Mood ----

  /// Pedas: siluet cili minimal + tangkai. W2 §7: badan cili dua lengkung
  /// (bukan garis tunggal nipis) supaya jelas pada 20px.
  void _pedas(Canvas c, Paint p) {
    final body = Path()
      ..moveTo(15, 6.5)
      ..quadraticBezierTo(18.8, 10.5, 15.8, 15.3)
      ..quadraticBezierTo(12.8, 19.6, 6.5, 18.6)
      ..quadraticBezierTo(11.5, 16.8, 13, 13.5)
      ..quadraticBezierTo(14.4, 10.5, 15, 6.5)
      ..close();
    c.drawPath(body, p);
    c.drawLine(const Offset(15.2, 6.8), const Offset(18, 4.5), p);
  }

  /// Bajet: mangkuk + syiling.
  void _bajet(Canvas c, Paint p) {
    final bowl = Rect.fromCircle(center: const Offset(11, 12.5), radius: 7);
    c.drawArc(bowl, 0, math.pi, false, p);
    c.drawLine(const Offset(4, 12.5), const Offset(18, 12.5), p);
    c.drawCircle(const Offset(17, 8), 3.2, p);
  }

  /// Lapar: pinggan kosong + kubah hidangan (bukan wajah).
  void _lapar(Canvas c, Paint p) {
    c.drawCircle(const Offset(12, 14), 6.5, p);
    final dome = Rect.fromCircle(center: const Offset(12, 7.5), radius: 4.5);
    c.drawArc(dome, math.pi, math.pi, false, p);
  }

  /// Berhampiran: pin lokasi berpusat pinggan.
  void _berhampiran(Canvas c, Paint p, Paint f) {
    c.drawCircle(const Offset(12, 10), 5.5, p);
    c.drawCircle(const Offset(12, 10), 2, f);
    final tail = Path()
      ..moveTo(9.5, 15)
      ..lineTo(12, 19.5)
      ..lineTo(14.5, 15);
    c.drawPath(tail, p);
  }

  /// Healthy: daun bersepadu dengan mangkuk (tiada palang medikal).
  void _healthy(Canvas c, Paint p) {
    final bowl = Rect.fromCircle(center: const Offset(12, 12), radius: 7);
    c.drawArc(bowl, -math.pi / 2, math.pi, false, p);
    c.drawLine(const Offset(12, 7), const Offset(12, 17), p);
    final leaf = Path()
      ..moveTo(12, 9)
      ..quadraticBezierTo(8, 8, 7.5, 4.8)
      ..quadraticBezierTo(11.5, 5.2, 12, 9);
    c.drawPath(leaf, p);
  }

  /// Surprise: kubah hidangan + percikan terkawal (bukan magic wand).
  void _surprise(Canvas c, Paint p) {
    final dome = Rect.fromCircle(center: const Offset(12, 16), radius: 7.5);
    c.drawArc(dome, math.pi, math.pi, false, p);
    c.drawLine(const Offset(3.5, 16.5), const Offset(20.5, 16.5), p);
    c.drawLine(const Offset(12, 4), const Offset(12, 6.4), p);
    c.drawLine(const Offset(6.8, 5.8), const Offset(8, 7.8), p);
    c.drawLine(const Offset(17.2, 5.8), const Offset(16, 7.8), p);
  }

  /// Cafe: cawan minimal + pemegang + piring.
  void _cafe(Canvas c, Paint p) {
    final cup = Path()
      ..moveTo(5, 7.5)
      ..lineTo(5, 12.5)
      ..quadraticBezierTo(5, 16.5, 10, 16.5)
      ..quadraticBezierTo(15, 16.5, 15, 12.5)
      ..lineTo(15, 7.5)
      ..close();
    c.drawPath(cup, p);
    final handle = Rect.fromCircle(center: const Offset(16.5, 10.5), radius: 2.6);
    c.drawArc(handle, -math.pi / 2, math.pi, false, p);
    c.drawLine(const Offset(4.5, 19.5), const Offset(16.5, 19.5), p);
  }

  /// Hujan: awan + titisan.
  void _hujan(Canvas c, Paint p) {
    final cloud = Path()
      ..moveTo(5.5, 13)
      ..quadraticBezierTo(3.5, 13, 3.8, 10.6)
      ..quadraticBezierTo(4, 8.4, 6.6, 8.4)
      ..quadraticBezierTo(7.4, 5, 11.4, 5.2)
      ..quadraticBezierTo(15, 5.4, 15.6, 8.4)
      ..quadraticBezierTo(18.6, 8.4, 18.6, 10.8)
      ..quadraticBezierTo(18.6, 13, 16.4, 13)
      ..close();
    c.drawPath(cloud, p);
    c.drawLine(const Offset(8.5, 16), const Offset(7.5, 19), p);
    c.drawLine(const Offset(13.5, 16), const Offset(12.5, 19), p);
  }

  /// Supper: bulan sabit.
  void _supper(Canvas c, Paint p) {
    final moon = Path()
      ..moveTo(14, 4.5)
      ..arcToPoint(const Offset(14, 19.5),
          radius: const Radius.circular(8.2), clockwise: false)
      ..arcToPoint(const Offset(14, 4.5),
          radius: const Radius.circular(10.4));
    c.drawPath(moon, p);
  }

  /// High rating: bintang outline (universal, keluarga stroke sama).
  void _star(Canvas c, Paint p, Paint f) {
    final path = Path();
    const cx = 12.0, cy = 12.6, ro = 8.0, ri = 3.6;
    for (var i = 0; i < 5; i++) {
      final ao = -math.pi / 2 + i * 2 * math.pi / 5;
      final ai = ao + math.pi / 5;
      final po = Offset(cx + ro * math.cos(ao), cy + ro * math.sin(ao));
      final pi = Offset(cx + ri * math.cos(ai), cy + ri * math.sin(ai));
      if (i == 0) path.moveTo(po.dx, po.dy);
      path.lineTo(po.dx, po.dy);
      path.lineTo(pi.dx, pi.dy);
    }
    path.close();
    c.drawPath(path, filled ? f : p);
  }

  // ---- Ciri ----

  /// Fit Coach: bingkai pinggan + garis degupan (warna jenama sahaja).
  void _fitCoach(Canvas c, Paint p) {
    c.drawRRect(
        RRect.fromRectAndRadius(
            const Rect.fromLTWH(3.5, 5, 17, 14), const Radius.circular(4)),
        p);
    final pulse = Path()
      ..moveTo(6, 12)
      ..lineTo(9, 12)
      ..lineTo(11, 8.6)
      ..lineTo(13.4, 15.4)
      ..lineTo(15, 12)
      ..lineTo(18, 12);
    c.drawPath(pulse, p);
  }

  /// Diet & Allergy: pinggan + perisai pelindung (bahasa neutral).
  void _dietAllergy(Canvas c, Paint p) {
    c.drawCircle(const Offset(9.5, 12.5), 6, p);
    final shield = Path()
      ..moveTo(17.5, 6)
      ..lineTo(21, 7.5)
      ..lineTo(21, 11.5)
      ..quadraticBezierTo(21, 14.6, 17.5, 16)
      ..quadraticBezierTo(14, 14.6, 14, 11.5)
      ..lineTo(14, 7.5)
      ..close();
    c.drawPath(shield, p);
  }

  /// Cuisine: kluster mangkuk (dua gelang bertindih).
  void _cuisine(Canvas c, Paint p) {
    c.drawCircle(const Offset(9, 11), 5.5, p);
    c.drawCircle(const Offset(15.5, 14), 4.5, p);
  }

  /// Meal Log: resit/senarai dalam bingkai pinggan bulat.
  void _mealLog(Canvas c, Paint p) {
    c.drawRRect(
        RRect.fromRectAndRadius(
            const Rect.fromLTWH(5.5, 4, 13, 16), const Radius.circular(4)),
        p);
    c.drawLine(const Offset(9, 9), const Offset(15, 9), p);
    c.drawLine(const Offset(9, 12.5), const Offset(15, 12.5), p);
    c.drawLine(const Offset(9, 16), const Offset(13, 16), p);
  }

  /// Meal Wallet: dompet dengan sisi pinggan kelihatan.
  void _mealWallet(Canvas c, Paint p) {
    c.drawRRect(
        RRect.fromRectAndRadius(
            const Rect.fromLTWH(3.5, 7, 17, 12), const Radius.circular(3.5)),
        p);
    c.drawCircle(const Offset(16.5, 13), 1.9, p);
    final lid = Rect.fromCircle(center: const Offset(12, 7), radius: 4);
    c.drawArc(lid, math.pi, math.pi, false, p);
  }

  /// Budget Coach: tolok + penanda syiling (bukan carta saham).
  void _budgetCoach(Canvas c, Paint p) {
    final rect = Rect.fromCircle(center: const Offset(12, 15), radius: 8);
    c.drawArc(rect, math.pi, math.pi, false, p);
    c.drawLine(const Offset(12, 15), const Offset(16.6, 10), p);
    c.drawCircle(const Offset(12, 6.5), 2.4, p);
  }

  /// Group Decision: tiga orang menumpu ke pinggan.
  void _groupDecision(Canvas c, Paint p, Paint f) {
    c.drawCircle(const Offset(12, 7), 2.6, f);
    c.drawCircle(const Offset(6, 9.5), 2.2, p);
    c.drawCircle(const Offset(18, 9.5), 2.2, p);
    final body1 = Path()
      ..moveTo(8.4, 19)
      ..quadraticBezierTo(12, 12.2, 15.6, 19);
    c.drawPath(body1, p);
    final body2 = Path()
      ..moveTo(3, 17.5)
      ..quadraticBezierTo(6, 13.4, 8.6, 15.6);
    c.drawPath(body2, p);
    final body3 = Path()
      ..moveTo(21, 17.5)
      ..quadraticBezierTo(18, 13.4, 15.4, 15.6);
    c.drawPath(body3, p);
  }

  /// Tong-Tong Bill: resit dibahagi kepada bahagian sama.
  void _tongtongBill(Canvas c, Paint p) {
    c.drawRRect(
        RRect.fromRectAndRadius(
            const Rect.fromLTWH(5.5, 4, 13, 16), const Radius.circular(4)),
        p);
    c.drawLine(const Offset(9, 8.5), const Offset(15, 8.5), p);
    c.drawLine(const Offset(5.5, 12.5), const Offset(18.5, 12.5), p);
    c.drawLine(const Offset(12, 12.5), const Offset(12, 20), p);
  }

  /// Pro: meterai MakanMana + pinggan (identiti pelan).
  void _proSeal(Canvas c, Paint p, Paint f) {
    c.drawCircle(const Offset(12, 12), 8, p);
    _miniStar(c, f, const Offset(12, 12), 4.2);
  }

  void _miniStar(Canvas c, Paint f, Offset center, double r) {
    final path = Path();
    for (var i = 0; i < 5; i++) {
      final ao = -math.pi / 2 + i * 2 * math.pi / 5;
      final ai = ao + math.pi / 5;
      final po =
          Offset(center.dx + r * math.cos(ao), center.dy + r * math.sin(ao));
      final pi = Offset(center.dx + r * 0.45 * math.cos(ai),
          center.dy + r * 0.45 * math.sin(ai));
      if (i == 0) path.moveTo(po.dx, po.dy);
      path.lineTo(po.dx, po.dy);
      path.lineTo(pi.dx, pi.dy);
    }
    path.close();
    c.drawPath(path, f);
  }

  @override
  bool shouldRepaint(_MmIconPainter old) =>
      old.type != type ||
      old.color != color ||
      old.accent != accent ||
      old.filled != filled;
}

/// Pemetaan mood id -> ikon proprietary (ganti emoji sistem).
MmIconType mmIconForMood(String moodId) => switch (moodId) {
      'moodPedas' => MmIconType.pedas,
      'moodJimat' => MmIconType.bajet,
      'moodLapar' => MmIconType.lapar,
      'moodSurprise' => MmIconType.surprise,
      'moodCafe' => MmIconType.cafe,
      'moodHujan' => MmIconType.hujan,
      'moodSupper' => MmIconType.supper,
      'moodHighRating' => MmIconType.highRating,
      'moodNearby' => MmIconType.berhampiran,
      'moodHealthy' => MmIconType.healthy,
      _ => MmIconType.pick,
    };
