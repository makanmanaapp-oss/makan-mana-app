import 'package:flutter/material.dart';

import '../constants/app_colors.dart';

/// SP10: avatar default bertema MakanMana.
///
/// Tiada aset imej luaran — preset = gradient + emoji (ringan, konsisten,
/// selamat-privasi). Disimpan sebagai `avatarPreset` dalam users/{uid}
/// dan dicermin ke public_profiles/{uid} melalui updateProfile.
class MakanAvatarPreset {
  const MakanAvatarPreset({
    required this.id,
    required this.emoji,
    required this.colors,
    required this.labelKey,
  });

  final String id;
  final String emoji;
  final List<Color> colors;

  /// Kunci l10n nama preset.
  final String labelKey;
}

/// 3 preset rasmi (id disimpan dalam Firestore — JANGAN tukar id).
const List<MakanAvatarPreset> kAvatarPresets = [
  MakanAvatarPreset(
    id: 'sambalBowl',
    emoji: '🍜',
    colors: [AppColors.primaryRed, AppColors.deepSambalRed],
    labelKey: 'avatarSambalBowl',
  ),
  MakanAvatarPreset(
    id: 'magicPlate',
    emoji: '✨',
    colors: [AppColors.warmYellow, Color(0xFFF59E0B)],
    labelKey: 'avatarMagicPlate',
  ),
  MakanAvatarPreset(
    id: 'foodieMascot',
    emoji: '😋',
    colors: [Color(0xFF10B981), Color(0xFF047857)],
    labelKey: 'avatarFoodieMascot',
  ),
];

/// SP10.4: SUMBER KEBENARAN avatar (tulen, diuji unit).
/// Keutamaan: photo snapshot > photo profil live > preset snapshot >
/// preset profil live. Snapshot post lama tanpa media → jatuh ke profil
/// awam live supaya identiti SAMA merentas profil/feed/repost/komen.
({String? photoUrl, String? presetId}) resolveAvatarSource({
  String? snapshotPhotoUrl,
  String? snapshotPreset,
  String? profilePhotoUrl,
  String? profilePreset,
}) {
  String? pick(String? a, String? b) {
    if (a != null && a.isNotEmpty) return a;
    if (b != null && b.isNotEmpty) return b;
    return null;
  }

  return (
    photoUrl: pick(snapshotPhotoUrl, profilePhotoUrl),
    presetId: pick(snapshotPreset, profilePreset),
  );
}

/// SP10.4: warna cover jenama — STABIL (merah MakanMana), bukan warna
/// rawak. Digunakan bila pengguna tiada coverUrl (upload cover belum
/// disokong — tiada kawalan cover palsu dipaparkan).
const List<Color> kBrandCoverGradient = [
  AppColors.primaryRed,
  AppColors.deepSambalRed,
];

/// Cari preset ikut id (tulen, diuji unit). null jika tak dikenal.
MakanAvatarPreset? avatarPresetOf(String? id) {
  if (id == null || id.isEmpty) return null;
  for (final p in kAvatarPresets) {
    if (p.id == id) return p;
  }
  return null;
}

/// Fallback deterministik: gradient ikut hash nama + inisial.
/// Digunakan bila TIADA photo & TIADA preset tetapi ada nama sebenar.
const List<List<Color>> _fallbackGradients = [
  [AppColors.primaryRed, Color(0xFFFF6B45)],
  [AppColors.warmYellow, Color(0xFFF59E0B)],
  [Color(0xFF10B981), Color(0xFF047857)],
  [Color(0xFF6366F1), Color(0xFF4338CA)],
];

List<Color> fallbackGradientFor(String name) =>
    _fallbackGradients[name.hashCode.abs() % _fallbackGradients.length];

/// Avatar seragam MakanMana. Keutamaan:
/// 1. [photoUrl] (gambar dimuat naik sendiri)
/// 2. [presetId] (avatar default bertema)
/// 3. Inisial + gradient deterministik (jika ada [displayName])
/// 4. Emoji 😋 atas kuning lembut (kelakuan lama — serasi penuh)
class MakanAvatar extends StatelessWidget {
  const MakanAvatar({
    super.key,
    this.photoUrl,
    this.presetId,
    this.displayName,
    this.emoji,
    this.radius = 19,
    this.onTap,
  });

  final String? photoUrl;
  final String? presetId;
  final String? displayName;

  /// Emoji fallback lama post/dokumen (contoh data['emoji']).
  final String? emoji;
  final double radius;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final avatar = _build(context);
    if (onTap == null) return avatar;
    return GestureDetector(onTap: onTap, child: avatar);
  }

  Widget _build(BuildContext context) {
    if (photoUrl != null && photoUrl!.isNotEmpty) {
      // FIX 2 (Part 5): nyahkod pada SAIZ PAPARAN, bukan resolusi penuh.
      // Avatar 38px (radius 19) dulu menyahkod foto profil resolusi penuh —
      // pembaziran memori/CPU besar × ramai pengarang semasa skrol laju.
      // ResizeImage hadkan saiz nyahkod ~ diameter × dpr (tajam, jimat).
      final dpr = MediaQuery.maybeOf(context)?.devicePixelRatio ?? 2.0;
      final decodePx = (radius * 2 * dpr).round().clamp(48, 256);
      return CircleAvatar(
        radius: radius,
        backgroundColor: AppColors.softYellow,
        backgroundImage: ResizeImage(
          NetworkImage(photoUrl!),
          width: decodePx,
          height: decodePx,
        ),
      );
    }
    final preset = avatarPresetOf(presetId);
    if (preset != null) {
      return _gradientCircle(
        preset.colors,
        Text(preset.emoji,
            style: TextStyle(fontSize: radius * 0.95)),
      );
    }
    final name = (displayName ?? '').trim();
    if (name.isNotEmpty && name != 'Foodie') {
      return _gradientCircle(
        fallbackGradientFor(name),
        Text(
          name.characters.first.toUpperCase(),
          style: TextStyle(
            fontSize: radius * 0.9,
            fontWeight: FontWeight.w800,
            color: Colors.white,
          ),
        ),
      );
    }
    // Kelakuan lama: emoji atas kuning lembut.
    return CircleAvatar(
      radius: radius,
      backgroundColor: AppColors.softYellow,
      child: Text(emoji ?? '😋',
          style: TextStyle(fontSize: radius * 1.05)),
    );
  }

  Widget _gradientCircle(List<Color> colors, Widget child) => Container(
        width: radius * 2,
        height: radius * 2,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: colors,
          ),
        ),
        child: Center(child: child),
      );
}
