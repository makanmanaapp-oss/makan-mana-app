/// SP10.1B: validasi & normalisasi nombor telefon Malaysia (tulen,
/// diuji unit). Firebase perlu format E.164 (+60xxxxxxxxx).
///
/// Diterima:
///   0123456789      -> +60123456789
///   60123456789     -> +60123456789
///   +60 12-345 6789 -> +60123456789
///   +14155550100    -> kekal (nombor test luar negara dibenarkan)
/// Tolak: bukan digit, terlalu pendek/panjang.
String? normalizePhoneNumber(String input) {
  final raw = input.trim();
  if (raw.isEmpty) return null;
  final hasPlus = raw.startsWith('+');
  final digits = raw.replaceAll(RegExp(r'[^0-9]'), '');
  if (digits.isEmpty) return null;

  String e164;
  if (hasPlus) {
    e164 = '+$digits';
  } else if (digits.startsWith('60')) {
    e164 = '+$digits';
  } else if (digits.startsWith('0')) {
    // Format tempatan 01x... -> +601x...
    e164 = '+6$digits';
  } else {
    // Tiada prefix — anggap nombor MY tanpa 0 di depan (cth. 123456789).
    e164 = '+60$digits';
  }

  // E.164: max 15 digit selepas '+'; minimum praktikal 10 (MY: +60 + 9-10).
  final len = e164.length - 1;
  if (len < 10 || len > 15) return null;
  return e164;
}
