import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import 'food_profile.dart';

/// ISSUE 004: penyelesai identiti pengarang LIVE untuk semua kandungan
/// sosial.
///
/// Sumber kanonik = public_profiles/{uid} melalui [publicProfileProvider]
/// (strim family autoDispose - Riverpod mendedup secara automatik: 50 post
/// daripada 3 pengarang berkongsi 3 strim sahaja, dan listener dilupus
/// apabila tiada widget menonton. Itulah strategi cache/batch kami; tiada
/// listener per-post tambahan).
///
/// Keutamaan:
///   1. Profil awam semasa (hanya jika dokumen WUJUD - lalai 'Foodie'
///      untuk dokumen hilang tidak boleh menimpa snapshot).
///   2. Snapshot pada dokumen kandungan (authorNameSnapshot/displayName
///      lama) - kekal sebagai fallback, TIDAK dipadam.
///   3. Label "Pengguna dipadam" yang dilokalkan.
///
/// Jangan gunakan label terjemahan sebagai identiti - [uid] kekal satu-
/// satunya pengecam dalam logik.
class AuthorIdentity {
  const AuthorIdentity({
    required this.uid,
    required this.displayName,
    this.username,
    this.photoUrl,
    this.avatarPreset,
    this.isLive = false,
    this.isDeleted = false,
  });

  final String uid;
  final String displayName;
  final String? username;
  final String? photoUrl;
  final String? avatarPreset;

  /// true bila nama datang daripada profil awam semasa (bukan snapshot).
  final bool isLive;

  /// true bila tiada profil live DAN tiada snapshot (akaun dipadam).
  final bool isDeleted;
}

/// Selesaikan identiti pengarang terkini. Panggil dari build() dengan
/// [ref.watch] supaya perubahan profil menyegar semula baris pengarang
/// tanpa mulakan semula aplikasi.
AuthorIdentity resolveAuthorIdentity(
  WidgetRef ref,
  AppLocalizations l, {
  required String uid,
  String? snapshotName,
  String? snapshotUsername,
  String? snapshotPhotoUrl,
  String? snapshotPreset,
}) {
  FoodProfile? live;
  if (uid.isNotEmpty) {
    live = ref.watch(publicProfileProvider(uid)).valueOrNull;
  }
  final hasLive = live != null && live.exists;
  final snapName = snapshotName?.trim();
  final hasSnapshot = snapName != null && snapName.isNotEmpty;

  if (hasLive) {
    return AuthorIdentity(
      uid: uid,
      displayName: live.displayName,
      username: live.username,
      // Media avatar: live diutamakan, snapshot sebagai fallback bila
      // profil live tiada foto (identiti terkini menang - ISSUE 004).
      photoUrl: (live.photoUrl?.isNotEmpty ?? false)
          ? live.photoUrl
          : snapshotPhotoUrl,
      avatarPreset: (live.avatarPreset?.isNotEmpty ?? false)
          ? live.avatarPreset
          : snapshotPreset,
      isLive: true,
    );
  }
  if (hasSnapshot) {
    return AuthorIdentity(
      uid: uid,
      displayName: snapName,
      username: snapshotUsername,
      photoUrl: snapshotPhotoUrl,
      avatarPreset: snapshotPreset,
    );
  }
  return AuthorIdentity(
    uid: uid,
    displayName: l.t('deletedUser'),
    isDeleted: true,
  );
}
