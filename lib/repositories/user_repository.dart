import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../models/app_user.dart';

class UserRepository {
  UserRepository({required this.firebaseReady});

  final bool firebaseReady;

  CollectionReference<Map<String, dynamic>> get _users =>
      FirebaseFirestore.instance.collection('users');

  /// Jangan biar UI tergantung jika backend lambat/belum sedia:
  /// SDK Firestore akan beratur tulisan secara offline dan sync kemudian.
  ///
  /// PAY-01: medan pelan (plan/planStatus) TIDAK dihantar dari klien —
  /// rules Firestore menolak tulisan pelan klien. Pengguna tanpa medan plan
  /// dianggap 'free' (PlanTier.parse fallback). Pelan hanya diubah melalui
  /// Firebase Console (QA internal) / Cloud Functions / IAP disahkan pelayan.
  /// SP10.4: peta selamat untuk upsert (tulen, diuji unit).
  /// - Buang medan pelan (PAY-01 — pelan dikawal pelayan sahaja).
  /// - Buang SEMUA nilai null — merge dengan null MENIMPA medan media
  ///   sedia ada (displayName/photoUrl hilang setiap login — bug 10.3).
  static Map<String, dynamic> sanitizedUserMap(AppUser user) =>
      user.toMap()
        ..remove('plan')
        ..remove('planStatus')
        ..removeWhere((key, value) => value == null);

  /// [extra] (SP10.1B): medan tambahan selamat (cth. phoneNumber,
  /// providerIds) — pemanggil WAJIB pastikan tiada protected/null.
  Future<void> upsertUser(AppUser user,
      {Map<String, dynamic>? extra}) async {
    if (!firebaseReady) return;
    final map = sanitizedUserMap(user);
    try {
      await _users.doc(user.uid).set(
        {
          ...map,
          ...?extra,
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        },
        SetOptions(merge: true),
      ).timeout(const Duration(seconds: 8));
    } on TimeoutException {
      debugPrint('MakanMana: tulisan users/{uid} beratur (offline queue).');
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
