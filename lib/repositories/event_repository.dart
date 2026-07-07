import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/foundation.dart';

import '../models/event_log.dart';

/// Log event AI Brain ke events/{eventId}. Fire-and-forget:
/// kegagalan log tidak boleh mengganggu UX pengguna.
class EventRepository {
  EventRepository({required this.firebaseReady});

  final bool firebaseReady;

  /// Tidak pernah menunggu ack pelayan - SDK Firestore akan queue
  /// dan sync sendiri. Kegagalan sebenar (cth. rules) dilog sahaja.
  Future<void> log(EventLog event) async {
    if (!firebaseReady || event.userId.isEmpty) {
      debugPrint('MakanMana event (dev): ${event.eventType}');
      return;
    }
    unawaited(
      FirebaseFirestore.instance.collection('events').add({
        ...event.toMap(),
        'timestamp': FieldValue.serverTimestamp(),
      }).then(
        (doc) {},
        onError: (Object e) =>
            debugPrint('MakanMana: event ${event.eventType} gagal: $e'),
      ),
    );

    // M6: hantar juga ke Firebase Analytics (satu titik integrasi
    // untuk semua event AI Brain -> funnel & retention di console).
    unawaited(
      FirebaseAnalytics.instance
          .logEvent(
            name: event.eventType,
            parameters: {
              'plan': event.plan,
              'time_slot': event.timeSlot,
              if (event.mood != null) 'mood': event.mood!,
            },
          )
          .catchError((Object e) =>
              debugPrint('MakanMana: analytics ${event.eventType}: $e')),
    );
  }
}
