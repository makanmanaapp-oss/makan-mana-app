import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../models/suggestion_record.dart';

/// users/{uid}/suggestions + suggestion_sessions - jejak untuk AI Brain.
class SuggestionRepository {
  SuggestionRepository({required this.firebaseReady});

  final bool firebaseReady;

  CollectionReference<Map<String, dynamic>> _suggestions(String uid) =>
      FirebaseFirestore.instance
          .collection('users')
          .doc(uid)
          .collection('suggestions');

  DocumentReference<Map<String, dynamic>> _session(String sessionId) =>
      FirebaseFirestore.instance
          .collection('suggestion_sessions')
          .doc(sessionId);

  Future<void> saveSuggestion(String uid, SuggestionRecord record) async {
    if (!firebaseReady || uid.isEmpty) return;
    unawaited(_suggestions(uid).doc(record.suggestionId).set({
      ...record.toMap(),
      'createdAt': FieldValue.serverTimestamp(),
    }).then(
      (v) {},
      onError: (Object e) =>
          debugPrint('MakanMana: simpan suggestion gagal: $e'),
    ));
  }

  Future<void> updateStatus(
    String uid,
    String suggestionId, {
    required String status,
    String? reason,
  }) async {
    if (!firebaseReady || uid.isEmpty || suggestionId.isEmpty) return;
    unawaited(_suggestions(uid).doc(suggestionId).set({
      'status': status,
      if (reason != null) 'reason': reason,
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true)).then(
      (v) {},
      onError: (Object e) =>
          debugPrint('MakanMana: kemas kini suggestion gagal: $e'),
    ));
  }

  Future<void> upsertSession(
    String sessionId,
    Map<String, dynamic> data,
  ) async {
    if (!firebaseReady) return;
    unawaited(_session(sessionId).set({
      ...data,
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true)).then(
      (v) {},
      onError: (Object e) => debugPrint('MakanMana: simpan sesi gagal: $e'),
    ));
  }
}
