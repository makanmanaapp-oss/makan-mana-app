import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../models/app_user.dart';

class UserRepository {
  UserRepository({required this.firebaseReady});

  final bool firebaseReady;

  CollectionReference<Map<String, dynamic>> get _users =>
      FirebaseFirestore.instance.collection('users');

  /// Cipta profil pengguna baharu dengan plan Free yang selamat. Untuk dokumen
  /// sedia ada, kemas kini profil biasa SAHAJA dan jangan sentuh field billing.
  Future<void> upsertUser(AppUser user) async {
    if (!firebaseReady) return;
    try {
      final ref = _users.doc(user.uid);
      final existing = await ref.get().timeout(const Duration(seconds: 8));
      final profile = <String, dynamic>{
        'uid': user.uid,
        'email': user.email,
        'displayName': user.displayName,
        'photoUrl': user.photoUrl,
        'language': user.language,
        'updatedAt': FieldValue.serverTimestamp(),
      };

      if (existing.exists) {
        // Important: plan/planStatus/planSource/planPeriodEnd are backend-owned.
        await ref.set(profile, SetOptions(merge: true))
            .timeout(const Duration(seconds: 8));
      } else {
        await ref.set({
          ...profile,
          'plan': 'free',
          'planStatus': 'active',
          'createdAt': FieldValue.serverTimestamp(),
        }).timeout(const Duration(seconds: 8));
      }
    } on TimeoutException {
      debugPrint('MakanMana: tulisan users/{uid} beratur/tertangguh.');
    }
  }

  Future<void> updateLanguage(String uid, String language) async {
    if (!firebaseReady) return;
    try {
      await _users.doc(uid).set(
        {'language': language, 'updatedAt': FieldValue.serverTimestamp()},
        SetOptions(merge: true),
      ).timeout(const Duration(seconds: 8));
    } on TimeoutException {
      debugPrint('MakanMana: tulisan bahasa beratur (offline queue).');
    }
  }
}
