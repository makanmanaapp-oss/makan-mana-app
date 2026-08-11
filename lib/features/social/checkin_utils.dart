/// Social Prompt 4: helper tulen untuk borang & kad check-in.
library;

/// Parse input belanja pengguna → nilai RM (null jika tidak sah).
/// Terima: "12", "12.50", "12,50", "RM12.50", "rm 8". Tolak: teks
/// makanan, nombor negatif, kosong, lebih RM99,999.
double? parseSpendInput(String raw) {
  var t = raw.trim().toLowerCase();
  if (t.isEmpty) return null;
  t = t.replaceAll('rm', '').replaceAll(' ', '').replaceAll(',', '.');
  // Mesti nombor tulen sahaja selepas buang RM (elak "nasi 12" dsb).
  if (!RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(t)) return null;
  final v = double.tryParse(t);
  if (v == null || v < 0 || v > 99999) return null;
  return (v * 100).roundToDouble() / 100;
}

/// Format nilai RM kemas: RM12 / RM12.50 (tiada .00 berlebihan).
String formatSpend(num value) {
  final v = (value * 100).round() / 100;
  if (v == v.roundToDouble()) return 'RM${v.toInt()}';
  return 'RM${v.toStringAsFixed(2)}';
}

/// Baris ringkasan kad check-in: "🍛 Nasi lemak · RM12.50 · ⭐ 4/5".
/// Bahagian kosong dilangkau; '' jika tiada langsung.
String checkinSummaryLine(Map<String, dynamic> data) {
  final parts = <String>[];
  final menu = (data['menuName'] as String?)?.trim() ?? '';
  if (menu.isNotEmpty) parts.add('🍛 $menu');
  final spend = data['totalSpend'];
  if (spend is num && spend >= 0) parts.add(formatSpend(spend));
  final rating = (data['userRating'] as num?)?.toInt();
  if (rating != null && rating >= 1 && rating <= 5) {
    parts.add('⭐ $rating/5');
  }
  return parts.join(' · ');
}

/// Tag mood pratetap composer check-in (BM santai, pendek untuk chip).
const checkinMoodPresets = <String>[
  '🌶️ Pedas',
  '😋 Sedap gila',
  '💸 Berbaloi',
  '☕ Chill',
  '🥘 Puas',
  '👨‍👩‍👧 Family',
];
