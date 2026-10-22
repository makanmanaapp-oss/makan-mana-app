import 'dart:math';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';

import '../../models/place_summary.dart';
import '../../models/places_outcome.dart';
import '../constants/app_constants.dart';
import 'recommendation_reject_outbox.dart';

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
    this.isEmptyArea = false,
    this.isUnavailable = false,
    this.retryable = false,
    this.spinRefunded = false,
  });

  final bool paywallRequired;

  /// WAVE 4A — kawasan ini benar-benar tiada restoran yang ngam. BUKAN ralat.
  final bool isEmptyArea;

  /// WAVE 4A — perkhidmatan tempat tidak dapat dilayan. BUKAN "tiada restoran".
  final bool isUnavailable;

  /// WAVE 4A — berbaloi mencuba semula (gangguan sementara lwn salah konfigurasi).
  final bool retryable;

  /// WAVE 4A — kuota spin dipulangkan kerana tiada cadangan dihasilkan.
  final bool spinRefunded;
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

  bool get isSample =>
      source == 'mock_fallback' ||
      source == 'demo_preview' ||
      source == 'offline_fallback' ||
      source == 'qa_synthetic';

  /// true bila pelayan memulangkan hasil jujur tanpa cadangan.
  bool get hasNoSuggestion => isEmptyArea || isUnavailable;
}

/// Klien Cloud Functions (region asia-southeast1).
/// SpinController cuba servis ini dahulu dan fallback ke logik
/// tempatan jika Functions belum deploy / tiada rangkaian.
class CloudSuggestionService {
  CloudSuggestionService({required this.firebaseReady});

  final bool firebaseReady;

  static String newRequestId() =>
      '${DateTime.now().microsecondsSinceEpoch}_${Random.secure().nextInt(1 << 30)}';

  Future<RecommendationRejectOutbox?> _outbox() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return null;
    return RecommendationRejectOutbox(await SharedPreferences.getInstance(), uid);
  }

  Future<bool> _flushPendingReject() async {
    final outbox = await _outbox();
    if (outbox == null) return false;
    final pending = outbox.pending;
    if (pending == null) return true;
    final ok = await submitFeedback(
      action: 'reject', placeId: pending['placeId'] as String?,
      reason: pending['reason'] as String?,
      eventId: 'reject:${pending['actionId']}',
    );
    if (ok) return outbox.clearIfAction(pending['actionId'] as String);
    return false;
  }

  FirebaseFunctions get _functions =>
      FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion);

  /// Prompt 6: satu payload penuh dari MakanManaUserContext.
  /// [mode]: 'spin' (kira had, tulis sesi) atau 'preview' (Home AI Pick).
  Future<CloudSpinResult?> getSuggestions({
    required Map<String, dynamic> payload,
    String mode = 'spin',
    String? requestId,
  }) async {
    if (!firebaseReady) return null;
    try {
      if (!await _flushPendingReject()) return null;
      final callable = _functions.httpsCallable(
        'getSuggestions',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 15)),
      );
      final res = await callable.call<Map<Object?, Object?>>({
        ...sanitizeCallablePayload(payload),
        'mode': mode,
        'requestId': requestId ?? newRequestId(),
      });
      final data = Map<String, dynamic>.from(res.data);
      // QA-DEV3 diagnostik (debug/QA sahaja — di-strip dalam release). Guna
      // semula metadata canonicalDiagnostics sedia ada; TIADA koordinat/PII.
      assert(() {
        final diag = data['canonicalDiagnostics'];
        final cand = (data['alternatives'] as List?)?.length ??
            (data['candidates'] as List?)?.length ??
            0;
        if (diag is Map) {
          final a2 = diag['algorithm2'];
          debugPrint('MM SUGGEST[$mode]: source=${data['source']} '
              'algoVer=${data['algorithmVersion']} cohort=${diag['cohort']} '
              'readSource=${diag['source']} '
              'algo2Enabled=${a2 is Map ? a2['enabled'] : a2} '
              'canonicalCount=${diag['canonicalCount']} '
              'legacyCount=${diag['legacyCount']} '
              'forceLegacy=${diag['forceLegacy']} rollout=${diag['rollout']} '
              'candidates=$cand');
        } else {
          debugPrint('MM SUGGEST[$mode]: source=${data['source']} '
              'algoVer=${data['algorithmVersion']} '
              'canonicalDiagnostics=ABSENT(not-eligible/owner-only) '
              'candidates=$cand');
        }
        return true;
      }());
      if (data['status'] == 'PAYWALL_REQUIRED') {
        return CloudSpinResult(
          paywallRequired: true,
          spinUsed: (data['spinUsed'] as num?)?.toInt(),
          spinLimit: (data['spinLimit'] as num?)?.toInt(),
        );
      }
      // WAVE 4A — hasil JUJUR daripada pelayan. Tiada satu pun daripadanya
      // digantikan dengan restoran rekaan oleh klien.
      final status = data['status'] as String?;
      if (status == 'OK_EMPTY' || status == 'PLACES_UNAVAILABLE') {
        return CloudSpinResult(
          paywallRequired: false,
          isEmptyArea: status == 'OK_EMPTY',
          isUnavailable: status == 'PLACES_UNAVAILABLE',
          retryable: data['retryable'] == true,
          spinRefunded: data['spinRefunded'] == true,
          spinUsed: (data['spinUsed'] as num?)?.toInt(),
          spinLimit: (data['spinLimit'] as num?)?.toInt(),
          source: data['source'] as String?,
        );
      }
      if (data['policyVersion'] != 'outlet_26h_v1') return null;
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
        contextHash: data['contextHash'] as String? ?? ((data['canonicalDiagnostics'] is Map)
            ? (data['canonicalDiagnostics'] as Map)['contextHash'] as String?
            : null),
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
    String? suggestionId,
    String? placeId,
    String? reason,
  }) async {
    if (!firebaseReady) return null;
    try {
      final outbox = await _outbox();
      Map<String, dynamic>? pending;
      if (action == 'reject') {
        if (outbox == null) return null;
        pending = outbox.pending;
        if (pending != null) {
          if (pending['placeId'] != placeId || pending['contextHash'] != contextHash) {
            if (!await _flushPendingReject()) return null;
            pending = null;
          }
        }
        pending ??= {'actionId': actionId, 'placeId': placeId,
          'contextHash': contextHash, 'reason': reason};
        if (!await outbox.save(pending)) return null;
      }
      final callable = _functions.httpsCallable(
        'nextSuggestion',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 15)),
      );
      final res = await callable.call<Map<Object?, Object?>>({
        'action': action,
        'contextHash': contextHash,
        'actionId': pending?['actionId'] ?? actionId,
        if (sessionId != null) 'sessionId': sessionId,
        if (suggestionId != null) 'suggestionId': suggestionId,
        if (placeId != null) 'placeId': placeId,
        if (reason != null) 'reason': pending?['reason'] ?? reason,
      });
      final data = Map<String, dynamic>.from(res.data);
      if (outbox != null && pending != null && data['actionAccepted'] == true) {
        await outbox.clearIfAction(pending['actionId'] as String);
      }
      assert(() {
        debugPrint('MM NEXT[$action]: keys=${data.keys.toList()} '
            'exhausted=${data['exhausted']} '
            'remaining=${data['remainingCount'] ?? data['remaining']} '
            'diagnostics=${data['diagnostics'] ?? data['canonicalDiagnostics']}');
        return true;
      }());
      return data;
    } catch (e) {
      debugPrint('MakanMana: nextSuggestion gagal (fallback tempatan): $e');
      return null;
    }
  }

  /// Senarai tempat berdekatan untuk Home (hero + grid).
  /// Hampir selalu hit cache 7 hari di pelayan — sangat jimat API.
  ///
  /// WAVE 4A: memulangkan hasil JUJUR. "Tiada restoran di kawasan ini" dan
  /// "tidak dapat menghubungi perkhidmatan" ialah dua keadaan berbeza, dan
  /// TIADA satu pun digantikan dengan restoran rekaan.
  Future<PlacesOutcome> getNearbyPlaces({
    double? lat,
    double? lng,
    int? radius,
    String? languageCode,
  }) async {
    if (!firebaseReady) {
      return const PlacesOutcome.unavailable(
        reason: PlacesUnavailableReason.network,
      );
    }
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
      return PlacesOutcome.fromMap(Map<String, dynamic>.from(res.data));
    } catch (e) {
      debugPrint('MakanMana: getNearbyPlaces gagal: $e');
      return const PlacesOutcome.unavailable(
        reason: PlacesUnavailableReason.network,
      );
    }
  }

  /// Phase 2.2A — halaman Explore (kohort + bendera). Menghantar `cursor` dan
  /// query carian opsyenal; pelayan mencari FULL area pool sebelum pagination.
  Future<PlacesPage?> getNearbyPlacesPage({
    double? lat,
    double? lng,
    int? radius,
    String? languageCode,
    String? query,
    int cursor = 0,
  }) async {
    if (!firebaseReady) return null;
    try {
      final callable = _functions.httpsCallable(
        'getNearbyPlaces',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 15)),
      );
      final cleanQuery = query?.trim();
      final res = await callable.call<Map<Object?, Object?>>({
        'lat': lat,
        'lng': lng,
        'radius': radius,
        'languageCode': languageCode,
        'cursor': cursor,
        if (cleanQuery != null && cleanQuery.isNotEmpty) 'query': cleanQuery,
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
    String? eventId,
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
      RecommendationRejectOutbox? rejectOutbox;
      String? rejectActionId;
      if (action == 'reject' && eventId == null) {
        rejectOutbox = await _outbox();
        if (rejectOutbox == null) return false;
        final existing = rejectOutbox.pending;
        if (existing != null && existing['placeId'] != placeId) return false;
        rejectActionId = existing?['actionId'] as String? ?? newRequestId();
        if (!await rejectOutbox.save({'actionId': rejectActionId,
          'placeId': placeId, 'reason': existing?['reason'] ?? reason})) return false;
        eventId = 'reject:$rejectActionId';
      }
      final callable = _functions.httpsCallable(
        'submitFeedback',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 12)),
      );
      // Medan tambahan (source/mood/radius/metadata) adalah PILIHAN — pelayan
      // lama abaikan tanpa pecah; pelayan baharu log ke event AI Brain.
      await callable.call<Map<Object?, Object?>>({
        'action': action,
        if (eventId != null) 'eventId': eventId,
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
      if (rejectOutbox != null && rejectActionId != null) {
        await rejectOutbox.clearIfAction(rejectActionId);
      }
      return true;
    } catch (e) {
      debugPrint('MakanMana: submitFeedback cloud gagal, guna lokal: $e');
      return false;
    }
  }
}
