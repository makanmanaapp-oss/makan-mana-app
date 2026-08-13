import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

/// Developer-only mock billing.
///
/// Release/profile build tidak dibenarkan memberi entitlement berbayar
/// tanpa Google Play + backend verification.
class MockPurchaseService {
  MockPurchaseService({required this.firebaseReady});

  final bool firebaseReady;

  DocumentReference<Map<String, dynamic>> _user(String uid) =>
      FirebaseFirestore.instance.collection('users').doc(uid);

  Future<void> purchase({
    required String uid,
    required String plan,
  }) async {
    if (!kDebugMode) {
      throw StateError(
        'Mock billing is disabled outside debug builds.',
      );
    }

    if (!firebaseReady || uid.isEmpty) return;

    await _user(uid).set({
      'plan': plan,
      'planStatus': plan == 'free' ? 'cancelled' : 'active',
      'planSource': 'mock',
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true)).timeout(
      const Duration(seconds: 10),
    );
  }
}
