import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../groups/group_providers.dart';

/// FIX 4 — SISTEM VISUAL SOSIAL RASMI MakanMana.
///
/// Primitif DIKONGSI supaya seluruh Threads/sosial (Feed, Post, Komen, Grup)
/// bercakap SATU bahasa visual — bukan pelbagai sistem Material rawak. Warna
/// SENTIASA dari [AppColors] (tiada nilai warna hardcode baharu di sini).
///
/// PEMBEKUAN: primitif ini presentation sahaja. Tiada logik like/save/invite/
/// delete/timestamp di sini — pemanggil kekalkan tingkah laku sedia ada.

/// Token saiz sosial (Part 33) — satu sumber, elak nilai bertaburan.
class SocialTokens {
  SocialTokens._();

  /// Saiz ikon aksi (like/reply/repost/share/save).
  static const double actionIconSize = 22;

  /// Sasaran sentuh minimum boleh-akses (Part 22) — ikon boleh kecil,
  /// kawasan tap kekal besar.
  static const double actionTapTarget = 44;

  /// Jurang antara aksi dalam baris engagement.
  static const double actionGap = 16;

  static const double avatarRadius = 19;
  static const double cardRadius = 18;
  static const double mediaRadius = 14;
  static const double badgeRadius = 8;
}

/// Butang aksi sosial DIKONGSI (Part 3-8): Like/Reply/Repost/Share/Save/More.
///
/// Kongsi: saiz ikon, sasaran sentuh boleh-akses, tipografi kiraan, dan label
/// semantik untuk pembaca skrin (Part 23). Keadaan aktif/warna ditentukan
/// pemanggil (kekalkan logik sedia ada) — widget ini hanya seragamkan
/// persembahan. `label` dipapar apa adanya (termasuk "0") supaya kiraan
/// KEKAL sama seperti sebelum (Part 4 freeze).
class SocialActionButton extends StatelessWidget {
  const SocialActionButton({
    super.key,
    required this.icon,
    required this.color,
    required this.semanticLabel,
    required this.onTap,
    this.label,
    this.compact = false,
  });

  final IconData icon;
  final Color color;

  /// Teks kiraan (opsyenal). Dipapar apa adanya — pemanggil kawal.
  final String? label;

  /// Label boleh-akses (contoh "Suka" / "Kongsi"). WAJIB — tiada butang
  /// ikon-sahaja tanpa makna untuk pembaca skrin.
  final String semanticLabel;

  final VoidCallback onTap;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semanticLabel,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: ConstrainedBox(
          // Sasaran sentuh: minHeight sentiasa 44; minWidth 44 hanya untuk
          // butang ikon-sahaja (butang berkiraan sudah lebih lebar) supaya
          // baris engagement tidak melebar/overflow pada skrin kecil.
          constraints: BoxConstraints(
            minWidth: label == null ? SocialTokens.actionTapTarget : 0,
            minHeight: SocialTokens.actionTapTarget,
          ),
          child: Padding(
            padding: EdgeInsets.symmetric(
                horizontal: compact ? 3 : 4, vertical: 8),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: SocialTokens.actionIconSize, color: color),
                if (label != null) ...[
                  const SizedBox(width: 5),
                  // FIX 4.1: kiraan ringkas — HAD skala teks (maks 1.3) supaya
                  // baris 5-aksi tak overflow pada text-scale besar + skrin
                  // sempit. Aksesibiliti aksi kekal (sasaran 44px + label
                  // semantik + ikon skala penuh); ini hanya BATAS pertumbuhan
                  // lencana nombor, bukan matikan penskalaan.
                  MediaQuery.withClampedTextScaling(
                    maxScaleFactor: 1.3,
                    child: Text(
                      label!,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: color,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Lencana privasi grup DIKONGSI (Part 10): ikon globe/lock + label setempat.
/// Ganti paparan teks-sahaja supaya privasi difahami sepintas lalu tanpa
/// mendominasi nama grup. Icon widget (BUKAN emoji 🌐/🔒).
class GroupPrivacyBadge extends StatelessWidget {
  const GroupPrivacyBadge({
    super.key,
    required this.isPrivate,
    this.dense = false,
  });

  final bool isPrivate;

  /// Versi padat (baris subtitle kad grup) — ikon + label sahaja, tiada pil.
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final icon = isPrivate ? Icons.lock_outline : Icons.public;
    final label = isPrivate ? l.t('visPrivate') : l.t('visPublic');

    if (dense) {
      return Semantics(
        label: label,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 13, color: AppColors.threadsMuted),
            const SizedBox(width: 4),
            Text(label,
                style: TextStyle(
                    color: AppColors.threadsMuted,
                    fontSize: 12,
                    fontWeight: FontWeight.w600)),
          ],
        ),
      );
    }

    return Semantics(
      label: label,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        decoration: BoxDecoration(
          color: AppColors.threadsSurface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.threadsBorder),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 13, color: AppColors.threadsMuted),
            const SizedBox(width: 5),
            Text(label,
                style: TextStyle(
                    color: AppColors.threadsText,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

/// HOTFIX 4.5: AVATAR GRUP DIKONGSI (Part 16).
///
/// Satu sumber untuk identiti visual grup merentas My Groups / Search /
/// Public Preview / Group Hub / Settings / Create-Edit. Susunan fallback:
///   imageUrl sah → imej (cached, crop cover, saiz-decode) ;
///   selainnya → lencana emoji BERJENAMA (segi empat bulat tona-merah) ;
///   emoji kosong → 🍜.
/// Loading/ralat imej → fallback emoji (JANGAN sekali papar ikon imej-rosak).
class GroupAvatar extends StatelessWidget {
  const GroupAvatar({
    super.key,
    required this.emoji,
    this.imageUrl,
    this.size = 46,
    this.semanticLabel,
  });

  final String emoji;
  final String? imageUrl;
  final double size;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final radius = size * 0.30; // segi empat bulat berkadar (≈14 pada 46)

    Widget branded() => Container(
          width: size,
          height: size,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                AppColors.primaryRed.withValues(alpha: 0.22),
                AppColors.primaryRed.withValues(alpha: 0.08),
              ],
            ),
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(color: AppColors.threadsBorder),
          ),
          child: Text(emoji.isNotEmpty ? emoji : '🍜',
              style: TextStyle(fontSize: size * 0.52)),
        );

    Widget content;
    final url = imageUrl;
    if (url != null && url.isNotEmpty) {
      content = ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: CachedNetworkImage(
          imageUrl: url,
          width: size,
          height: size,
          fit: BoxFit.cover,
          // Part 23: saiz-decode untuk avatar kecil — JANGAN decode imej 4K
          // ke dalam kad kecil. Bounded ~3× logik.
          memCacheWidth: (size * 3).round(),
          // Loading & ralat → fallback emoji (bukan ikon imej-rosak).
          placeholder: (_, __) => branded(),
          errorWidget: (_, __, ___) => branded(),
        ),
      );
    } else {
      content = branded();
    }

    return Semantics(
      label: semanticLabel,
      image: url != null,
      child: SizedBox(width: size, height: size, child: content),
    );
  }
}

/// HOTFIX 4.5C: AVATAR GRUP DISELESAIKAN (server-mediated V2).
///
/// Membungkus [GroupAvatar] dengan resolver signed-GET ([groupImageUrlProvider]).
/// URL kekal TIDAK lagi disimpan — imej diselesaikan (jangka pendek) hanya bila
/// dibenarkan. Susunan fallback:
///   sedang muat / tiada imej / gagal / tanpa-kebenaran → emoji berjenama ;
///   URL diselesaikan → imej (cached, decode-sized) via [GroupAvatar].
/// JANGAN sekali papar ikon imej-rosak.
class GroupAvatarResolved extends ConsumerWidget {
  const GroupAvatarResolved({
    super.key,
    required this.groupId,
    required this.emoji,
    this.size = 46,
    this.semanticLabel,
  });

  final String groupId;
  final String emoji;
  final double size;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // .value → null semasa loading/ralat → GroupAvatar guna fallback emoji.
    final url = groupId.isEmpty
        ? null
        : ref.watch(groupImageUrlProvider(groupId)).value;
    return GroupAvatar(
      emoji: emoji,
      imageUrl: url,
      size: size,
      semanticLabel: semanticLabel,
    );
  }
}

/// Lencana peranan grup DIKONGSI (Part 11): Owner terima aksen jenama
/// (kuning) yang terkawal; Admin/Member/Viewer kekal restrained (neutral).
/// Visual TIDAK memberi kuasa yang backend tak berikan — hanya papar peranan
/// autoritatif yang dihantar.
class GroupRoleBadge extends StatelessWidget {
  const GroupRoleBadge({super.key, required this.role});

  final String role;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    // Hanya OWNER = aksen jenama. Admin restrained (border halus, teks muted).
    final (label, isOwner) = switch (role) {
      'owner' => (l.t('roleOwner'), true),
      'admin' => (l.t('roleAdmin'), false),
      'viewer' => (l.t('roleViewer'), false),
      _ => (l.t('roleMember'), false),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: isOwner
            ? AppColors.warmYellow.withValues(alpha: 0.18)
            : AppColors.threadsSurface,
        borderRadius: BorderRadius.circular(SocialTokens.badgeRadius),
        border: Border.all(
            color: isOwner
                ? AppColors.warmYellow.withValues(alpha: 0.6)
                : AppColors.threadsBorder),
      ),
      child: Text(label,
          style: TextStyle(
              color: isOwner ? AppColors.warmYellow : AppColors.threadsMuted,
              fontSize: 10.5,
              fontWeight: FontWeight.w800)),
    );
  }
}
