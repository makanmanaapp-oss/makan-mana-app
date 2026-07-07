import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';

/// Mock pembelian langganan (Milestone 5).
/// Struktur mengikut aliran RevenueCat supaya penggantian nanti mudah:
/// purchase() -> entitlement aktif -> users/{uid}.plan dikemaskini.
/// RevenueCat sebenar: ganti isi kaedah ini sahaja, UI kekal.
class MockPurchaseService {
  MockPurchaseService({required this.firebaseReady});

  final bool firebaseReady;

  DocumentReference<Map<String, dynamic>> _user(String uid) =>
      FirebaseFirestore.instance.collection('users').doc(uid);

  /// "Beli" pelan (free | plus | pro). Mock: terus aktif tanpa bayaran.
  Future<void> purchase({
    required String uid,
    required String plan,
  }) async {
    if (!firebaseReady || uid.isEmpty) return;
    await _user(uid).set({
      'plan': plan,
      'planStatus': plan == 'free' ? 'cancelled' : 'active',
      'planSource': 'mock',
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true)).timeout(const Duration(seconds: 10));
  }
}
