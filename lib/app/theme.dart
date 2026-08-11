import 'package:flutter/material.dart';

import '../core/constants/app_colors.dart';

/// Tipografi rasmi MakanMana: Inter untuk skrip Latin (BM/EN/nombor/harga).
/// Cina Ringkas & Tamil jatuh ke font sistem Android (Noto Sans SC /
/// Noto Sans Tamil) melalui fallback enjin — Inter TIDAK dipaksa pada glyph
/// yang tidak disokongnya. Tiada muat turun font runtime.
const kFontFamily = 'Inter';
const kFontFamilyFallback = <String>['Roboto', 'sans-serif'];

/// SP10.2: TOKEN TEMA JELAS — satu sumber kebenaran warna ikut mod.
/// PERATURAN KAD: background = [card], tajuk = [onCard], sari kata =
/// [onCardMuted]. JANGAN campur (kad putih + teks tema = putih-atas-putih).
/// Kelas tulen (tanpa BuildContext) supaya boleh diuji unit.
class MMColors {
  const MMColors({
    required this.appBackground,
    required this.card,
    required this.elevatedCard,
    required this.onCard,
    required this.onCardMuted,
    required this.onCardFaint,
    required this.border,
    required this.chipBackground,
    required this.chipSelectedBackground,
    required this.chipText,
    required this.iconMuted,
    required this.softFill,
  });

  final Color appBackground;
  final Color card;
  final Color elevatedCard;

  /// Teks utama atas kad.
  final Color onCard;

  /// Teks sekunder atas kad — JANGAN lebih pudar dari ini untuk info penting.
  final Color onCardMuted;

  /// Teks paling pudar (disabled/hint) — masih boleh dibaca.
  final Color onCardFaint;
  final Color border;
  final Color chipBackground;
  final Color chipSelectedBackground;
  final Color chipText;
  final Color iconMuted;

  /// Isian lembut aksen (dulu softYellow).
  final Color softFill;

  // Aksen identiti — SAMA dua-dua mod (kekalkan jenama).
  static const danger = AppColors.primaryRed;
  static const accentYellow = AppColors.warmYellow;
  static const successGreen = AppColors.healthyGreen;

  static const light = MMColors(
    appBackground: AppColors.creamBackground,
    card: AppColors.cardWhite,
    elevatedCard: AppColors.cardWhite,
    onCard: AppColors.darkText,
    onCardMuted: AppColors.mutedText,
    onCardFaint: AppColors.fadedText,
    border: AppColors.softBorder,
    chipBackground: AppColors.cardWhite,
    chipSelectedBackground: AppColors.selectedYellow,
    chipText: AppColors.darkText,
    iconMuted: AppColors.iconNeutral,
    softFill: AppColors.softYellow,
  );

  /// DARK MODE RASMI (ZIP "MakanMana Dark Mode Redesign"): charcoal
  /// berlapis (BUKAN hitam tulen), merah aksi kekal, kuning dipilih
  /// #F6D778 WAJIB teks gelap (#17191D) — sama seperti Bright.
  static const dark = MMColors(
    appBackground: Color(0xFF0F1115),
    card: Color(0xFF171A20),
    elevatedCard: Color(0xFF1E2229),
    onCard: Color(0xFFF5F7FA),
    onCardMuted: Color(0xFFC8CDD5),
    onCardFaint: Color(0xFF8C939F),
    border: Color(0xFF2C313A),
    chipBackground: Color(0xFF1A1D22),
    chipSelectedBackground: AppColors.selectedYellow,
    chipText: Color(0xFFF5F7FA),
    iconMuted: Color(0xFF8C939F),
    softFill: Color(0xFF262214),
  );

  /// Teks gelap atas permukaan kuning dipilih (ZIP #17191D) — dua-dua mod.
  static const selectedDarkText = Color(0xFF17191D);

  /// Permukaan bersalut merah (banner promo gelap, blok akaun — ZIP).
  static const redTintSurfaceDark = Color(0xFF211719);

  static MMColors forBrightness({required bool isDark}) =>
      isDark ? dark : light;
}

/// Akses token dari widget: `context.mm.card`, `context.mm.onCard`, ...
/// Getter lama (tCard/tText/...) dikekalkan sebagai delegat — pemanggil
/// SP10 sedia ada tidak perlu diubah.
extension ThemeColorsX on BuildContext {
  bool get isDarkMode => Theme.of(this).brightness == Brightness.dark;

  MMColors get mm => MMColors.forBrightness(isDark: isDarkMode);

  Color get tCard => mm.card;
  Color get tText => mm.onCard;
  Color get tMuted => mm.onCardMuted;
  Color get tBorder => mm.border;
  Color get tSoftFill => mm.softFill;
}

/// Tema "Sambal Yellow Food AI" - cerah, warm, premium, phone-first.
class AppTheme {
  AppTheme._();

  static ThemeData light() {
    const scheme = ColorScheme(
      brightness: Brightness.light,
      primary: AppColors.primaryRed,
      onPrimary: Colors.white,
      secondary: AppColors.warmYellow,
      onSecondary: AppColors.darkText,
      error: AppColors.deepSambalRed,
      onError: Colors.white,
      surface: AppColors.cardWhite,
      onSurface: AppColors.darkText,
      surfaceContainerHighest: AppColors.softYellow,
      outline: AppColors.softBorder,
    );

    final base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      fontFamily: kFontFamily,
      fontFamilyFallback: kFontFamilyFallback,
    );

    return base.copyWith(
      scaffoldBackgroundColor: AppColors.creamBackground,
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.creamBackground,
        foregroundColor: AppColors.darkText,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontFamily: kFontFamily,
          fontFamilyFallback: kFontFamilyFallback,
          color: AppColors.darkText,
          fontSize: 20,
          fontWeight: FontWeight.w700,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.cardWhite,
        elevation: 2,
        shadowColor: Colors.black.withValues(alpha: 0.08),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: AppColors.softBorder),
        ),
        margin: EdgeInsets.zero,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primaryRed,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          textStyle: const TextStyle(
              fontFamily: kFontFamily,
              fontSize: 16,
              fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primaryRed,
          minimumSize: const Size.fromHeight(52),
          side: const BorderSide(color: AppColors.primaryRed, width: 1.5),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          textStyle: const TextStyle(
              fontFamily: kFontFamily,
              fontSize: 16,
              fontWeight: FontWeight.w700),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: AppColors.primaryRed),
      ),
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: AppColors.cardWhite,
        selectedColor: AppColors.selectedYellow,
        side: const BorderSide(color: AppColors.softBorder),
        labelStyle: const TextStyle(
          fontFamily: kFontFamily,
          color: AppColors.darkText,
          fontWeight: FontWeight.w600,
        ),
        secondaryLabelStyle: const TextStyle(
          fontFamily: kFontFamily,
          color: MMColors.selectedDarkText,
          fontWeight: FontWeight.w600,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.cardWhite,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.softBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.softBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.primaryRed, width: 2),
        ),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.cardWhite,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.darkText,
        contentTextStyle:
            const TextStyle(fontFamily: kFontFamily, color: Colors.white),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
        ),
      ),
    );
  }

  /// SP10: mod gelap — guna palet Threads yang SAMA dengan bahagian
  /// sosial supaya seluruh app konsisten. Aksen merah/kuning kekal
  /// (identiti MakanMana tidak berubah).
  static ThemeData dark() {
    const mm = MMColors.dark;
    const scheme = ColorScheme(
      brightness: Brightness.dark,
      primary: AppColors.primaryRed,
      onPrimary: Colors.white,
      secondary: AppColors.warmYellow,
      onSecondary: AppColors.darkText,
      error: AppColors.deepSambalRed,
      onError: Colors.white,
      surface: Color(0xFF171A20),
      onSurface: Color(0xFFF5F7FA),
      surfaceContainerHighest: Color(0xFF1E2229),
      outline: Color(0xFF2C313A),
    );

    final base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      fontFamily: kFontFamily,
      fontFamilyFallback: kFontFamilyFallback,
    );

    return base.copyWith(
      scaffoldBackgroundColor: mm.appBackground,
      appBarTheme: AppBarTheme(
        backgroundColor: mm.appBackground,
        foregroundColor: mm.onCard,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontFamily: kFontFamily,
          fontFamilyFallback: kFontFamilyFallback,
          color: mm.onCard,
          fontSize: 20,
          fontWeight: FontWeight.w700,
        ),
      ),
      cardTheme: CardThemeData(
        color: mm.card,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: mm.border),
        ),
        margin: EdgeInsets.zero,
      ),
      listTileTheme: ListTileThemeData(
        textColor: mm.onCard,
        iconColor: mm.iconMuted,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primaryRed,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          textStyle: const TextStyle(
              fontFamily: kFontFamily,
              fontSize: 16,
              fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primaryRed,
          minimumSize: const Size.fromHeight(52),
          side: const BorderSide(color: AppColors.primaryRed, width: 1.5),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          textStyle: const TextStyle(
              fontFamily: kFontFamily,
              fontSize: 16,
              fontWeight: FontWeight.w700),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: AppColors.primaryRed),
      ),
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: mm.chipBackground,
        selectedColor: mm.chipSelectedBackground,
        side: BorderSide(color: mm.border),
        labelStyle: TextStyle(
          fontFamily: kFontFamily,
          color: mm.chipText,
          fontWeight: FontWeight.w600,
        ),
        // ZIP: chip DIPILIH = kuning #F6D778 + teks GELAP (kedua-dua mod)
        // — jangan sesekali putih-atas-kuning.
        secondaryLabelStyle: const TextStyle(
          fontFamily: kFontFamily,
          color: MMColors.selectedDarkText,
          fontWeight: FontWeight.w600,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: mm.card,
        hintStyle: TextStyle(fontFamily: kFontFamily, color: mm.onCardMuted),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: mm.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: mm.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.primaryRed, width: 2),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: mm.card,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        // ZIP: permukaan elevated charcoal, bukan kelabu rawak.
        backgroundColor: mm.elevatedCard,
        contentTextStyle:
            TextStyle(fontFamily: kFontFamily, color: mm.onCard),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: mm.border),
        ),
      ),
    );
  }
}
