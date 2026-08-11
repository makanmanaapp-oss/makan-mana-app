import 'package:cloud_firestore/cloud_firestore.dart';

import '../../app/localization/app_localizations.dart';

/// Threads Fix 1 — INTEGRITI CAP MASA POST.
///
/// SUMBER KEBENARAN tunggal untuk mentafsir `createdAt` post/komen dan
/// memformat masa relatif. Sebelum ini setiap surface mengulang:
///
///     if (ts is! Timestamp) return l.t('justNow');   // ← PEPIJAT
///
/// yang menjadikan MANA-MANA nilai bukan-`Timestamp` (null pending, legasi
/// String/int, atau hilang) dipapar sebagai "baru tadi"/hari ini — jadi post
/// LAMA kelihatan seperti dicipta hari ini. Ganti dengan penghurai teguh +
/// keadaan JUJUR "masa tidak diketahui" (bukan masa semasa palsu).

/// Tafsir nilai `createdAt` Firestore kepada instan sebenar (atau null).
///
/// Menyokong: `Timestamp`, `DateTime`, epoch `int` (saat atau milisaat), dan
/// rentetan ISO-8601 legasi. Nilai lain / null / tak boleh dihurai → null
/// (JANGAN ganti dengan DateTime.now()).
DateTime? parsePostCreatedAt(dynamic ts) {
  if (ts is Timestamp) return ts.toDate();
  if (ts is DateTime) return ts;
  if (ts is int) {
    // Heuristik saat vs milisaat: epoch saat 2020 ≈ 1.6e9 (10 digit);
    // milisaat ≈ 1.6e12 (13 digit). Ambang 1e11 memisah keduanya bersih.
    final ms = ts > 100000000000 ? ts : ts * 1000;
    return DateTime.fromMillisecondsSinceEpoch(ms);
  }
  if (ts is String) {
    final s = ts.trim();
    if (s.isEmpty) return null;
    return DateTime.tryParse(s);
  }
  return null;
}

/// Masa relatif JUJUR untuk `createdAt`.
///
/// - `pending == true` (tulisan optimistik pengguna, serverTimestamp belum
///   diselesaikan) DAN masa masih null → "baru tadi" (post memang baru dicipta).
/// - Masa sah → dikira dari instan ASAL (post lama kekal lama; UTC/lokal tidak
///   boleh menukar post lama menjadi "hari ini").
/// - Masa TIDAK diketahui (bukan pending) → "masa tidak diketahui" — BUKAN
///   masa semasa palsu.
///
/// [now] disuntik untuk ujian deterministik.
String relativePostTime(
  AppLocalizations l,
  dynamic ts, {
  bool pending = false,
  DateTime? now,
}) {
  final dt = parsePostCreatedAt(ts);
  if (dt == null) {
    return pending ? l.t('justNow') : l.t('timeUnavailable');
  }
  // Banding pada zon yang sama supaya sisihan UTC↔lokal (Malaysia +8) tidak
  // boleh menukar post lama menjadi "hari ini" berhampiran tengah malam.
  final local = dt.isUtc ? dt.toLocal() : dt;
  final ref = now ?? DateTime.now();
  final diff = ref.difference(local);

  // Masa hadapan (jam peranti terkebelakang) / < 1 minit → baru tadi.
  if (diff.isNegative || diff.inMinutes < 1) return l.t('justNow');
  if (diff.inMinutes < 60) return '${diff.inMinutes}m';
  if (diff.inHours < 24) return '${diff.inHours}j';
  return '${diff.inDays}h';
}

/// Threads Fix 1.1 — pembanding kekisar (TERBARU dahulu) berasaskan instan
/// KANONIKAL, JENIS-AGNOSTIK (Timestamp / DateTime / int / ISO String).
///
/// Untuk `List.sort` sisi-klien (cth. tab balasan profil). Nilai tidak
/// diketahui (null / tak boleh dihurai) diletak DI HUJUNG — TIDAK dianggap
/// "sekarang". Susunan bergantung pada instan sebenar, bukan jenis medan
/// runtime, supaya rekod createdAt legasi (jika wujud) tidak boleh memecahkan
/// kronologi secara senyap.
int comparePostRecencyDesc(dynamic a, dynamic b) {
  final da = parsePostCreatedAt(a);
  final db = parsePostCreatedAt(b);
  if (da == null && db == null) return 0;
  if (da == null) return 1; // tidak diketahui → hujung
  if (db == null) return -1;
  return db.compareTo(da); // terbaru dahulu
}
