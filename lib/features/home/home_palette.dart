import 'package:flutter/material.dart';

import '../../app/theme.dart';

/// Front Page Redesign 1A — palet SKOP-HOME rasmi (imej rujukan).
///
/// Nilai hex TEPAT dari spesifikasi redesign digunakan dalam **Bright Mode**
/// sahaja. Token global `AppColors`/`context.mm` TIDAK diubah (kekalkan
/// keselarasan seluruh app + token merah terkunci). Dalam **Dark Mode**,
/// permukaan/sempadan/teks diambil dari `context.mm` (token tema) supaya palet
/// bright tidak dipaksa masuk gelap; jenama merah kekal di mana kontras cukup.
class HomePalette {
  const HomePalette({
    required this.primary,
    required this.primaryDark,
    required this.softRed,
    required this.yellow,
    required this.background,
    required this.offWhite,
    required this.card,
    required this.border,
    required this.text,
    required this.subtext,
    required this.onPrimary,
    required this.isDark,
  });

  final Color primary; // #DD1F22 aksi utama / aktif
  final Color primaryDark; // #D63F32
  final Color softRed; // #DA6364 sorotan lembut
  final Color yellow; // #F59E14 logo / PRO
  final Color background; // #FDF8F4 warm white
  final Color offWhite; // #F6E9E3 permukaan off-white
  final Color card; // #FFFFFF (bright) / mm.card (dark)
  final Color border; // #E8DAD3 (bright) / mm.border (dark)
  final Color text; // #1F1F1F (bright) / mm.onCard (dark)
  final Color subtext; // #6B6B6B (bright) / mm.onCardMuted (dark)
  final Color onPrimary; // teks atas merah
  final bool isDark;

  // Jenama — konsisten dua-dua mod.
  static const _primary = Color(0xFFDD1F22);
  static const _primaryDark = Color(0xFFD63F32);
  static const _softRed = Color(0xFFDA6364);
  static const _yellow = Color(0xFFF59E14);

  static const _bright = HomePalette(
    primary: _primary,
    primaryDark: _primaryDark,
    softRed: _softRed,
    yellow: _yellow,
    background: Color(0xFFFDF8F4),
    offWhite: Color(0xFFF6E9E3),
    card: Color(0xFFFFFFFF),
    border: Color(0xFFE8DAD3),
    text: Color(0xFF1F1F1F),
    subtext: Color(0xFF6B6B6B),
    onPrimary: Colors.white,
    isDark: false,
  );

  /// Bright guna hex tepat spesifikasi; Dark ambil token tema (`context.mm`).
  static HomePalette of(BuildContext context) {
    if (!context.isDarkMode) return _bright;
    final mm = context.mm;
    return HomePalette(
      primary: _primary,
      primaryDark: _primaryDark,
      softRed: _softRed,
      yellow: _yellow,
      background: mm.appBackground,
      offWhite: mm.softFill,
      card: mm.card,
      border: mm.border,
      text: mm.onCard,
      subtext: mm.onCardMuted,
      onPrimary: Colors.white,
      isDark: true,
    );
  }
}
