import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../core/constants/plan_constants.dart';
import '../core/services/app_prefs.dart';
import '../core/utils/time_slot_utils.dart';
import '../models/daily_usage.dart';

/// daily_usage/{uid_yyyyMMdd} - kawal had spin percuma (3/hari).
class UsageRepository {
  UsageRepository({required this.firebaseReady, required this.prefs});

  final bool firebaseReady;
  final AppPrefs prefs;

  String _docId(String uid) => '${uid}_${TimeSlotUtils.dateKey(DateTime.now())}';

  DocumentReference<Map<String, dynamic>> _doc(String uid) =>
      FirebaseFirestore.instance.collection('daily_usage').doc(_docId(uid));

  Future<DailyUsage> getToday(String uid, String plan) async {
    // Debug build: had longgar untuk testing; release kekal 3 (Free).
    final limit =
        plan == 'free' ? PlanConstants.effectiveFreeSpinLimit : -1;
    final date = TimeSlotUtils.dateKey(DateTime.now());

    if (firebaseReady && uid.isNotEmpty) {
      try {
        final snap = await _doc(uid).get().timeout(const Duration(seconds: 8));
        if (snap.exists && snap.data() != null) {
          final stored = DailyUsage.fromMap(snap.data()!);
          // Guna had semasa (bukan yang tersimpan) supaya perubahan
          // pelan/mod debug berkuat kuasa serta-merta.
          return DailyUsage(
            userId: stored.userId,
            date: stored.date,
            plan: plan,
            spinUsed: stored.spinUsed,
            spinLimit: limit,
            paywallShownCount: stored.paywallShownCount,
          );
        }
      } on TimeoutException {
        debugPrint('MakanMana: bacaan daily_usage timeout.');
      }
      return DailyUsage(userId: uid, date: date, plan: plan, spinLimit: limit);
    }

    // Mod dev: kira guna prefs.
    final used = prefs.devSpinUsedFor(date);
    return DailyUsage(
      userId: uid,
      date: date,
      plan: plan,
      spinUsed: used,
      spinLimit: limit,
    );
  }

  Future<void> incrementSpin(String uid, String plan) async {
    final date = TimeSlotUtils.dateKey(DateTime.now());
    final limit =
        plan == 'free' ? PlanConstants.effectiveFreeSpinLimit : -1;

    if (firebaseReady && uid.isNotEmpty) {
      // Jangan tunggu ack pelayan - SDK queue dan sync sendiri.
      unawaited(_doc(uid).set({
        'userId': uid,
        'date': date,
        'plan': plan,
        'spinLimit': limit,
        'spinUsed': FieldValue.increment(1),
        'lastSpinAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true)).then(
        (v) {},
        onError: (Object e) =>
            debugPrint('MakanMana: daily_usage gagal: $e'),
      ));
      return;
    }
    await prefs.setDevSpinUsedFor(date, prefs.devSpinUsedFor(date) + 1);
  }

  Future<void> incrementPaywallShown(String uid) async {
    if (!firebaseReady || uid.isEmpty) return;
    unawaited(_doc(uid).set({
      'userId': uid,
      'date': TimeSlotUtils.dateKey(DateTime.now()),
      'paywallShownCount': FieldValue.increment(1),
    }, SetOptions(merge: true)).then(
      (v) {},
      onError: (Object e) =>
          debugPrint('MakanMana: paywall_shown gagal: $e'),
    ));
  }
}
