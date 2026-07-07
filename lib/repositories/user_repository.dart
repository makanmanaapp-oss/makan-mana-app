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
  Future<void> upsertUser(AppUser user) async {
    if (!firebaseReady) return;
    try {
      await _users.doc(user.uid).set(
        {
          ...user.toMap(),
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
