import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../core/services/app_prefs.dart';
import '../models/user_profile.dart';

/// Profil selera pengguna: user_profiles/{uid}.
/// Sentiasa simpan salinan tempatan supaya app boleh berjalan
/// walaupun Firebase belum dikonfigurasi (mod dev).
class ProfileRepository {
  ProfileRepository({required this.firebaseReady, required this.prefs});

  final bool firebaseReady;
  final AppPrefs prefs;

  CollectionReference<Map<String, dynamic>> get _profiles =>
      FirebaseFirestore.instance.collection('user_profiles');

  /// Salinan tempatan sentiasa disimpan dahulu; tulisan Firestore diberi
  /// timeout supaya UI tidak tergantung — SDK akan sync bila backend sedia.
  Future<void> saveProfile(UserProfile profile) async {
    await prefs.setProfileJson(profile.toJson());
    if (!firebaseReady || profile.uid.isEmpty) return;
    try {
      await _profiles.doc(profile.uid).set(
        {
          ...profile.toMap(),
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        },
        SetOptions(merge: true),
      ).timeout(const Duration(seconds: 8));
    } on TimeoutException {
      debugPrint('MakanMana: tulisan user_profiles beratur (offline queue).');
    }
  }

  Future<UserProfile?> loadProfile(String uid) async {
    if (firebaseReady && uid.isNotEmpty) {
      try {
        final doc = await _profiles
            .doc(uid)
            .get()
            .timeout(const Duration(seconds: 8));
        if (doc.exists && doc.data() != null) {
          return UserProfile.fromMap(doc.data()!);
        }
      } on TimeoutException {
        debugPrint('MakanMana: bacaan profil timeout, guna salinan tempatan.');
      }
    }
    final local = prefs.profileJson;
    if (local != null) return UserProfile.fromJson(local);
    return null;
  }
}
