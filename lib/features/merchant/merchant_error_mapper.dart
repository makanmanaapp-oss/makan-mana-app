import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';

/// WAVE 6 — satu tempat untuk menukar kegagalan teknikal kepada ayat manusia.
///
/// Defek yang ini betulkan: skrin Peniaga pernah memaparkan kod gRPC mentah
/// terus kepada pengguna — `UNAVAILABLE`, kemudian `RESOURCE EXHAUSTED` semasa
/// kuota CPU projek habis selepas satu deploy besar. Kod itu tidak bermakna
/// apa-apa kepada tuan kedai, ia kelihatan seperti kerosakan kekal, dan ia
/// membocorkan bentuk dalaman sistem kepada orang luar.
///
/// Peraturannya mudah: kod teknikal kekal dalam log, ayat biasa naik ke skrin.
class MerchantErrorMapper {
  const MerchantErrorMapper._();

  /// Ayat lalai apabila kita betul-betul tidak tahu apa yang berlaku.
  static const _fallback = 'Ada masalah sementara. Cuba lagi sebentar nanti.';

  /// Tukar sebarang ralat kepada mesej selamat untuk pengguna.
  ///
  /// Tidak pernah mengembalikan kod status, nama pengecualian, jejak tindanan,
  /// URL dalaman, atau ID dalaman.
  static String message(Object? error) {
    final code = _codeOf(error);
    switch (code) {
      case 'unauthenticated':
        return 'Sesi anda sudah tamat. Sila log masuk semula.';
      case 'permission-denied':
      case 'permission_denied':
        return 'Akaun anda tiada akses untuk kedai ini.';
      case 'merchant_place_access_required':
        return 'Anda belum diberi akses untuk urus kedai ini.';
      case 'not-found':
      case 'restaurant_not_published':
        return 'Kedai ini belum diterbitkan lagi.';
      case 'resource-exhausted':
      case 'quota-exceeded':
        // Ini yang dulu bocor sebagai "RESOURCE EXHAUSTED".
        return 'Perkhidmatan sedang sibuk. Cuba lagi dalam beberapa minit.';
      case 'unavailable':
        // Dan ini yang dulu bocor sebagai "UNAVAILABLE".
        return 'Perkhidmatan tidak dapat dihubungi sekarang. Cuba lagi sebentar nanti.';
      case 'deadline-exceeded':
        return 'Sambungan terlalu lambat. Cuba lagi.';
      case 'failed-precondition':
        return 'Maklumat belum lengkap untuk teruskan.';
      case 'invalid-argument':
        return 'Maklumat yang dihantar tidak sah. Semak semula dan cuba lagi.';
      case 'already-exists':
        return 'Rekod ini sudah wujud.';
      case 'cancelled':
        return 'Permintaan dibatalkan.';
      case 'internal':
      case 'unknown':
      case 'data-loss':
      case 'aborted':
        return _fallback;
      case 'network-request-failed':
        return 'Tiada sambungan internet. Semak rangkaian anda.';
      default:
        return _fallback;
    }
  }

  /// Kod teknikal untuk log SAHAJA. Jangan sekali-kali render ini.
  static String debugCode(Object? error) => _codeOf(error);

  /// Log butiran teknikal tanpa membawanya ke UI.
  static void logForDebug(String context, Object? error) {
    if (kDebugMode) {
      debugPrint('MakanMana merchant[$context]: ${_codeOf(error)} — $error');
    }
  }

  static String _codeOf(Object? error) {
    if (error is FirebaseFunctionsException) {
      return error.code.toLowerCase();
    }
    if (error is FirebaseException) {
      return error.code.toLowerCase();
    }
    final raw = error?.toString() ?? '';
    // Beberapa lapisan membalut ralat sebagai teks. Kesan kod yang biasa,
    // tetapi JANGAN kembalikan teks mentah itu.
    final lower = raw.toLowerCase();
    for (final known in const [
      'unauthenticated',
      'permission-denied',
      'permission_denied',
      'merchant_place_access_required',
      'restaurant_not_published',
      'resource-exhausted',
      'resource_exhausted',
      'unavailable',
      'deadline-exceeded',
      'failed-precondition',
      'invalid-argument',
      'network-request-failed',
      'not-found',
    ]) {
      if (lower.contains(known)) return known.replaceAll('_', '-');
    }
    return 'unknown';
  }
}
