import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';

import '../constants/app_constants.dart';

/// Prompt 9: pencetus kira-semula Food Memory / User Brain.
/// Memanggil callable `recalculateUserBrain` secara fire-and-forget dengan
/// throttle supaya tidak membebankan kos. Tidak pernah menyekat UI.
class UserBrainService {
  UserBrainService({required this.firebaseReady});

  final bool firebaseReady;

  /// Throttle: elak kira-semula terlalu kerap (dikongsi seluruh sesi app).
  static DateTime? _lastCall;
  static const _minGap = Duration(minutes: 3);

  /// Barrier pendek untuk memastikan semua write Firestore yang sudah di-queue
  /// (terutamanya suggestion_reject + metadata.reason) sudah di-ACK pelayan
  /// SEBELUM callable brain membaca koleksi `events`.
  ///
  /// Event biasa kekal fire-and-forget. Barrier ini hanya berada pada laluan
  /// recalculate, jadi UX tidak menunggu analytics biasa.
  static const _pendingWritesTimeout = Duration(seconds: 8);

  FirebaseFunctions get _functions =>
      FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion);

  /// Kira semula brain pengguna. [force] melangkau throttle (cth. butang
  /// refresh manual). Pulangkan true jika panggilan berjaya dihantar.
  Future<bool> recalculate({bool force = false}) async {
    if (!firebaseReady) return false;
    final now = DateTime.now();
    if (!force &&
        _lastCall != null &&
        now.difference(_lastCall!) < _minGap) {
      return false; // terlalu kerap — langkau senyap
    }
    _lastCall = now;
    try {
      // Phase 2.4A hardening — EventRepository.log() memang fire-and-forget,
      // tetapi Firestore .add() sudah di-queue sebelum logEvent() kembali.
      // Tunggu semua pending write itu diakui server sebelum recalc supaya
      // suggestion_reject yang baru (cth. reason=too_far) tidak berlumba dengan
      // query `events` di recalculateUserBrain.
      await FirebaseFirestore.instance
          .waitForPendingWrites()
          .timeout(_pendingWritesTimeout);

      final callable = _functions.httpsCallable(
        'recalculateUserBrain',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 20)),
      );
      await callable.call<Map<Object?, Object?>>({'force': force});
      return true;
    } catch (e) {
      // Kegagalan barrier/callable tidak boleh menjatuhkan aliran pengguna.
      // Jika write event belum di-ACK, recalc tidak dihantar. Ini lebih selamat
      // daripada mengira brain tanpa signal terbaru dan menganggap learning
      // sudah berjaya.
      debugPrint('MakanMana: recalculateUserBrain gagal: $e');
      return false;
    }
  }

  /// Phase 2.4 — Reset Food Memory (tingkah laku dipelajari). Profil keselamatan
  /// (alahan, halal, diet) di user_profiles TIDAK disentuh oleh pelayan.
  /// Idempoten mengikut [actionId]. Pulangkan {reset, brainVersion} atau null.
  Future<Map<String, dynamic>?> resetFoodMemory({String? actionId}) async {
    if (!firebaseReady) return null;
    final id = actionId ??
        'reset_${DateTime.now().microsecondsSinceEpoch}';
    try {
      final callable = _functions.httpsCallable(
        'resetUserBrain',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 15)),
      );
      final res = await callable.call<Map<Object?, Object?>>({'actionId': id});
      return Map<String, dynamic>.from(res.data);
    } catch (e) {
      debugPrint('MakanMana: resetUserBrain gagal: $e');
      return null;
    }
  }
}
