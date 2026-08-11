import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';
import '../../models/app_user.dart';
import '../place_migration/internal_cohort_activation.dart';
import '../place_migration/place_migration_flags.dart';

/// SP10.1B: medan tambahan selamat untuk users/{uid} (tulen, diuji unit).
/// TIDAK PERNAH mengandungi medan protected SP9.2A (plan/isAdmin/role/...)
/// dan TIDAK mengandungi nilai null/kosong (elak timpa media — bug 10.3).
Map<String, dynamic> authExtraFields({
  String? phoneNumber,
  required List<String> providerIds,
}) {
  return {
    if (phoneNumber != null && phoneNumber.isNotEmpty)
      'phoneNumber': phoneNumber,
    if (providerIds.isNotEmpty) 'providerIds': providerIds,
  };
}

/// Bootstrap SELAMAT dikongsi SEMUA provider (Email/Register/Google/Phone):
/// - users/{uid}: nama/gambar dari provider HANYA untuk akaun BAHARU —
///   akaun pulang TIDAK ditimpa (null dibuang oleh sanitizedUserMap
///   SP10.3; medan pelan dibuang; protected tak pernah dihantar).
/// - public_profiles: dicermin via callable updateProfile (tulisan
///   server-only) — fire-and-forget, akaun baharu sahaja.
///
/// [displayNameOverride] untuk borang daftar (nama diisi pengguna).
Future<void> bootstrapSignedInUser(
  WidgetRef ref,
  User user, {
  String? displayNameOverride,
}) async {
  bool isNew = false;
  try {
    final snap = await FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .get()
        .timeout(const Duration(seconds: 8));
    isNew = !snap.exists;
  } catch (_) {
    // Ragu (offline/lambat) → layan sebagai akaun pulang: JANGAN timpa.
    isNew = false;
  }

  final displayName =
      displayNameOverride ?? (isNew ? user.displayName : null);
  final photoUrl = isNew ? user.photoURL : null;

  await ref.read(userRepositoryProvider).upsertUser(
        AppUser(
          uid: user.uid,
          email: user.email ?? '',
          displayName: displayName,
          photoUrl: photoUrl,
          language: ref.read(languageProvider).languageCode,
        ),
        extra: authExtraFields(
          phoneNumber: user.phoneNumber,
          providerIds:
              user.providerData.map((p) => p.providerId).toList(),
        ),
      );

  // Phase 1.14F-R: aktifkan kohort kanonikal dalaman (owner-only, debug-only).
  // Awam/keluaran + bukan-owner kekal legacyOnly (reset selamat). Ini menyambung
  // keupayaan kanonikal kepada UID/claims pengguna yang log masuk sebenar.
  try {
    final tokenResult = await user.getIdTokenResult().timeout(
          const Duration(seconds: 8),
        );
    final decision = evaluateInternalCohort(
      uid: user.uid,
      claims: tokenResult.claims,
      isDebugBuild: kDebugMode,
    );
    lastInternalCohortDecision = decision;
    applyInternalCohortActivation(decision);
  } catch (_) {
    // Ragu → kekal selamat (legacyOnly).
    PlaceMigrationFeatureFlags.resetToSafeDefaults();
  }

  if (!isNew && displayNameOverride == null) return;
  // Cermin ke public_profiles melalui pelayan — fire-and-forget;
  // profil awam ada fallback jika ini lambat/gagal.
  final payload = <String, dynamic>{
    if (displayName != null && displayName.isNotEmpty)
      'displayName': displayName,
    if (photoUrl != null && photoUrl.isNotEmpty) 'photoUrl': photoUrl,
  };
  // 10.1B-PHONE-CLOSE: akaun BAHARU tanpa nama/gambar (cth. login
  // telefon) — panggil JUGA dengan payload kosong: pelayan tetap
  // set public_profiles/{uid} {uid, updatedAt} (merge) supaya doc
  // profil awam wujud untuk semua akaun baharu.
  if (payload.isEmpty && !isNew) return;
  FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion)
      .httpsCallable('updateProfile')
      .call<Map>(payload)
      .then(
    (_) {},
    onError: (Object e) =>
        debugPrint('MakanMana: cermin profil awam tertangguh: $e'),
  );
}
