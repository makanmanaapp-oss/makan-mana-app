import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';

import '../../models/place_summary.dart';
import '../constants/app_constants.dart';

/// Phase 2.2A — satu halaman Explore (pagination server-mediated).
class PlacesPage {
  const PlacesPage({
    required this.places,
    required this.nextCursor,
    required this.endOfResults,
    this.diagnostics = const {},
    this.poolSize,
  });
  final List<PlaceSummary> places;
  final int? nextCursor;
  final bool endOfResults;

  /// Phase 2.2B — canonicalDiagnostics dari pelayan (kohort/flags) — untuk
  /// panel diagnostik debug pada peranti sebenar. Kosong untuk awam.
  final Map<String, dynamic> diagnostics;
  final int? poolSize;
}

/// 16.1 blocker fix: payload callable mesti JSON-selamat. Konteks pengguna
/// boleh bawa Timestamp/DateTime (cth. foodMemorySummary.lastUpdatedAt dari
/// user_brain_profiles) — jenis ini gagal assertion cloud_functions dan
/// menyebabkan SEMUA spin jatuh senyap ke fallback tempatan.
dynamic _jsonSafe(dynamic v) {
  if (v == null || v is num || v is String || v is bool) return v;
  if (v is DateTime) return v.toIso8601String();
  if (v is Timestamp) return v.toDate().toIso8601String();
  if (v is Iterable) return v.map(_jsonSafe).toList();
  if (v is Map) {
    return v.map((k, value) => MapEntry(k.toString(), _jsonSafe(value)));
  }
  return v.toString();
}

Map<String, dynamic> sanitizeCallablePayload(Map<String, dynamic> payload) =>
    Map<String, dynamic>.from(_jsonSafe(payload) as Map);

/// Hasil panggilan getSuggestions dari Cloud Function.
class CloudSpinResult {
  const CloudSpinResult({
    required this.paywallRequired,
    this.place,
    this.sessionId,
    this.suggestionId,
    this.spinUsed,
    this.spinLimit,
    this.candidates = const [],
    this.source,
    this.contextHash,
  });

  final bool paywallRequired;
  final PlaceSummary? place;
  final String? sessionId;
  final String? suggestionId;

  /// Phase 2.2D — hash konteks opaque (kohort) untuk Reject/Next authoritative.
  final String? contextHash;
  final int? spinUsed;
  final int? spinLimit;

  /// Calon tambahan dari pelayan (untuk reject-chain tanpa panggilan baru).
  final List<PlaceSummary> candidates;

  /// Prompt 6: sumber data (google_places | mock_fallback | ...).
  final String? source;

  bool get isSample => source == 'mock_fallback' || source == 'demo_preview';
}

/// Klien Cloud Functions (region asia-southeast1).
/// SpinController cuba servis ini dahulu dan fallback ke logik
/// tempatan jika Functions belum deploy / tiada rangkaian.
class CloudSuggestionService {
  CloudSuggestionService({required this.firebaseReady});

  final bool firebaseReady;

  FirebaseFunctions get _functions =>
      FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion);

  /// Prompt 6: satu payload penuh dari MakanManaUserContext.
  /// [mode]: 'spin' (kira had, tulis sesi) atau 'preview' (Home AI Pick).
  Future<CloudSpinResult?> getSuggestions({
    required Map<String, dynamic> payload,
    String mode = 'spin',
  }) async {
    if (!firebaseReady) return null;
    try {
      final callable = _functions.httpsCallable(
        'getSuggestions',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 15)),
      );
      final res = await callable.call<Map<Object?, Object?>>({
        ...sanitizeCallablePayload(payload),
        'mode': mode,
      });
      final data = Map<String, dynamic>.from(res.data);
      if (data['status'] == 'PAYWALL_REQUIRED') {
        return CloudSpinResult(
          paywallRequired: true,
          spinUsed: (data['spinUsed'] as num?)?.toInt(),
          spinLimit: (data['spinLimit'] as num?)?.toInt(),
        );
      }
      final primary = data['primary'];
      if (primary == null) return null;
      final source = data['source'] as String?;
      // Cop sumber ke setiap tempat supaya UI boleh label sample.
      PlaceSummary parse(Object? c) {
        final m = Map<String, dynamic>.from(c as Map);
        if (source != null && m['source'] == null) m['source'] = source;
        return PlaceSummary.fromMap(m);
      }
      final rawAlts =
          (data['alternatives'] as List?) ?? (data['candidates'] as List?) ?? [];
      final candidates = rawAlts.map(parse).toList();
      return CloudSpinResult(
        paywallRequired: false,
        place: parse(primary),
        sessionId: data['sessionId'] as String?,
        suggestionId: data['suggestionId'] as String?,
        spinUsed: (data['spinUsed'] as num?)?.toInt(),
        spinLimit: (data['spinLimit'] as num?)?.toInt(),
        candidates: candidates,
        source: source,
        contextHash: (data['canonicalDiagnostics'] is Map)
            ? (data['canonicalDiagnostics'] as Map)['contextHash'] as String?
            : null,
      );
    } catch (e) {
      debugPrint('MakanMana: getSuggestions cloud gagal, guna lokal: $e');
      return null;
    }
  }

  /// Phase 2.2D — Reject/Next AUTHORITATIF: server consume alternatif seterusnya
  /// (TIADA search/rank/provider). Idempoten mengikut [actionId]. Pulangkan hasil
  /// mentah (nextPlace + diagnostik) atau null bila offline/gagal → klien fallback.
  Future<Map<String, dynamic>?> nextSuggestion({
    required String action, // 'reject' | 'next'
    required String contextHash,
    required String actionId,
    String? sessionId,
    String? placeId,
    String? reason,
  }) async {
    if (!firebaseReady) return null;
    try {
      final callable = _functions.httpsCallable(
        'nextSuggestion',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 15)),
      );
      final res = await callable.call<Map<Object?, Object?>>({
        'action': action,
        'contextHash': contextHash,
        'actionId': actionId,
        if (sessionId != null) 'sessionId': sessionId,
        if (placeId != null) 'placeId': placeId,
        if (reason != null) 'reason': reason,
      });
      return Map<String, dynamic>.from(res.data);
    } catch (e) {
      debugPrint('MakanMana: nextSuggestion gagal (fallback tempatan): $e');
      return null;
    }
  }

  /// Senarai tempat berdekatan untuk Home (hero + grid).
  /// Hampir selalu hit cache 7 hari di pelayan — sangat jimat API.
  Future<List<PlaceSummary>?> getNearbyPlaces({
    double? lat,
    double? lng,
    int? radius,
    String? languageCode,
  }) async {
    if (!firebaseReady) return null;
    try {
      final callable = _functions.httpsCallable(
        'getNearbyPlaces',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 15)),
      );
      final res = await callable.call<Map<Object?, Object?>>({
        'lat': lat,
        'lng': lng,
        'radius': radius,
        'languageCode': languageCode,
      });
      final data = Map<String, dynamic>.from(res.data);
      return (data['places'] as List? ?? [])
          .map((p) =>
              PlaceSummary.fromMap(Map<String, dynamic>.from(p as Map)))
          .toList();
    } catch (e) {
      debugPrint('MakanMana: getNearbyPlaces cloud gagal, guna lokal: $e');
      return null;
    }
  }

  /// Phase 2.2A — halaman Explore (kohort + bendera). Menghantar `cursor`;
  /// pulangkan halaman + kursor seterusnya. Awam/tiada-kohort: pelayan pulangkan
  /// 12 kad biasa tanpa nextCursor (endOfResults=true) — selamat.
  Future<PlacesPage?> getNearbyPlacesPage({
    double? lat,
    double? lng,
    int? radius,
    String? languageCode,
    int cursor = 0,
  }) async {
    if (!firebaseReady) return null;
    try {
      final callable = _functions.httpsCallable(
        'getNearbyPlaces',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 15)),
      );
      final res = await callable.call<Map<Object?, Object?>>({
        'lat': lat,
        'lng': lng,
        'radius': radius,
        'languageCode': languageCode,
        'cursor': cursor,
      });
      final data = Map<String, dynamic>.from(res.data);
      final places = (data['places'] as List? ?? [])
          .map((p) => PlaceSummary.fromMap(Map<String, dynamic>.from(p as Map)))
          .toList();
      final next = data['nextCursor'];
      final diag = data['canonicalDiagnostics'];
      return PlacesPage(
        places: places,
        nextCursor: next is num ? next.toInt() : null,
        endOfResults: data['endOfResults'] == true || next == null,
        diagnostics: diag is Map ? Map<String, dynamic>.from(diag) : const {},
        poolSize: data['poolSize'] is num ? (data['poolSize'] as num).toInt() : null,
      );
    } catch (e) {
      debugPrint('MakanMana: getNearbyPlacesPage gagal: $e');
      return null;
    }
  }

  /// true jika berjaya dihantar ke pelayan.
  /// [place] ialah snapshot tempat (perlu untuk rekod meal tempat sebenar).
  Future<bool> submitFeedback({
    required String action,
    String? suggestionId,
    String? placeId,
    String? sessionId,
    String? reason,
    PlaceSummary? place,
    String? source,
    String? mood,
    int? radiusMeters,
    int? matchScore,
    List<String>? negativeSignals,
    Map<String, dynamic>? metadata,
  }) async {
    if (!firebaseReady) return false;
    try {
      final callable = _functions.httpsCallable(
        'submitFeedback',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 12)),
      );
      // Medan tambahan (source/mood/radius/metadata) adalah PILIHAN — pelayan
      // lama abaikan tanpa pecah; pelayan baharu log ke event AI Brain.
      await callable.call<Map<Object?, Object?>>({
        'action': action,
        'suggestionId': suggestionId,
        'placeId': placeId,
        'sessionId': sessionId,
        'reason': reason,
        if (source != null) 'source': source,
        if (mood != null) 'mood': mood,
        if (radiusMeters != null) 'radiusMeters': radiusMeters,
        if (matchScore != null) 'matchScore': matchScore,
        if (negativeSignals != null && negativeSignals.isNotEmpty)
          'negativeSignals': negativeSignals,
        if (metadata != null && metadata.isNotEmpty) 'metadata': metadata,
        if (place != null)
          'place': {
            'name': place.name,
            'cuisine': place.cuisine,
            'emoji': place.emoji,
            'priceLevel': place.priceLevel,
            'priceEstimate': place.priceEstimate,
            'matchScore': place.matchScore,
          },
      });
      return true;
    } catch (e) {
      debugPrint('MakanMana: submitFeedback cloud gagal, guna lokal: $e');
      return false;
    }
  }
}
