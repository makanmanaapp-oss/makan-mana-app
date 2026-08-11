import 'package:flutter/material.dart';

/// Palet rasmi MakanMana — BRIGHT MODE DEFAULT (spec "Bright Mode Main UI").
/// Merah = aksi utama/aktif. Kuning = selected state & aksen mikro terkawal
/// (WAJIB teks/ikon gelap atas kuning). Tiada identiti hijau/biru/ungu asing.
class AppColors {
  AppColors._();

  // Aksi & identiti.
  static const primaryRed = Color(0xFFE83A32);
  static const pressedRed = Color(0xFFCF302A);
  static const deepSambalRed = Color(0xFFB91C1C); // destructive sahaja
  static const warmYellow = Color(0xFFF4C542);
  static const selectedYellow = Color(0xFFF6D778); // surface dipilih
  static const softYellow = Color(0xFFFBEDC9); // isian lembut kuning pucat

  // Permukaan & teks Bright Mode.
  static const creamBackground = Color(0xFFFFF9F2);
  static const cardWhite = Color(0xFFFFFFFF);
  static const secondarySurface = Color(0xFFF7F4EF);
  static const darkText = Color(0xFF1C1D20);
  static const mutedText = Color(0xFF62666D);
  static const fadedText = Color(0xFF8A8F96);
  static const softBorder = Color(0xFFE4E1DC);
  static const divider = Color(0xFFECE9E4);
  static const iconNeutral = Color(0xFF5C6168);

  // Status (terkawal — bukan identiti ciri).
  static const openGreen = Color(0xFF28B76B);
  static const healthyGreen = Color(0xFF28B76B);
  static const warningOrange = Color(0xFFD97706);

  // Mod gelap ala-Threads: KHUSUS bahagian sosial (Feed/komen/compose).
  // THREADS REDESIGN — theme-aware Threads/social palette. Previously hardcoded
  // dark; now resolves Bright OR Dark from [threadsDark], set centrally by the
  // app root (MaterialApp.builder) from the resolved app theme. Values MIRROR
  // the authoritative MMColors (theme.dart) so Threads matches the rest of the
  // app in both modes. Dark uses layered charcoal (NOT pure black) to preserve
  // border/divider/card depth.
  static bool threadsDark = true;
  static Color get threadsBg =>
      threadsDark ? const Color(0xFF0F1115) : creamBackground;
  static Color get threadsSurface =>
      threadsDark ? const Color(0xFF171A20) : cardWhite;
  static Color get threadsBorder =>
      threadsDark ? const Color(0xFF2C313A) : softBorder;
  static Color get threadsText =>
      threadsDark ? const Color(0xFFF5F7FA) : darkText;
  static Color get threadsMuted =>
      threadsDark ? const Color(0xFFC8CDD5) : mutedText;
}
