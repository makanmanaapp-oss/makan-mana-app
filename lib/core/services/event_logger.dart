import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/event_log.dart';
import '../events/event_types.dart';
import '../providers.dart';
import '../providers/makanmana_user_context_provider.dart';
import '../utils/time_slot_utils.dart';

/// Pusat log event AI Brain (Prompt 8). SATU kontrak untuk semua penulisan
/// event client. Melampirkan medan konteks biasa dari MakanManaUserContext,
/// membersih metadata sensitif, dan menulis ke events/{eventId} secara
/// fire-and-forget. TIDAK PERNAH melempar ke UI.
class EventLogger {
  EventLogger(this._ref);

  final Ref _ref;

  /// Kunci metadata sensitif yang TIDAK boleh dilog mentah (privasi).
  static const _sensitiveKeys = {
    'allergies',
    'allergyList',
    'dislikedFoods',
    'medicalConditions',
    'medicalCondition',
    'injury',
    'injuryNote',
    'bodyStats',
    'weightKg',
    'heightCm',
    'bmi',
    'phone',
    'phoneNumber',
    'email',
    'lat',
    'lng',
    'latitude',
    'longitude',
    'receipt',
    'receiptText',
    'ocrText',
  };

  static const _daysOfWeek = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];

  String get _uid => _ref.read(authRepositoryProvider).currentUser?.uid ?? '';

  /// Log satu event. Semua parameter selain [eventType] adalah pilihan.
  /// Kegagalan log tidak boleh menyekat aliran pengguna.
  void logEvent(
    String eventType, {
    String? sourceScreen,
    String? sessionId,
    String? suggestionId,
    String? placeId,
    String? placeNameSnapshot,
    String? sourceMode,
    String? resultSource,
    bool isSample = false,
    bool isPreview = false,
    double? matchScore,
    List<String>? negativeSignals,
    Map<String, dynamic>? metadata,
  }) {
    try {
      final ctx = _ref.read(makanManaUserContextProvider);
      final now = DateTime.now();
      _ref.read(eventRepositoryProvider).log(
            EventLog(
              userId: _uid,
              eventType: eventType,
              timeSlot: TimeSlotUtils.now(),
              languageCode: ctx.languageCode,
              plan: ctx.plan,
              mood: ctx.selectedMood,
              source: 'client',
              sourceScreen: sourceScreen,
              dayOfWeek: _daysOfWeek[(now.weekday - 1) % 7],
              radiusKm: ctx.effectiveRadiusKm,
              radiusMeters: ctx.effectiveRadiusMeters,
              locationGrid: _locationGrid(ctx.locationGrid, ctx.currentLat,
                  ctx.currentLng),
              sessionId: sessionId,
              suggestionId: suggestionId,
              placeId: placeId,
              placeNameSnapshot: placeNameSnapshot,
              sourceMode: sourceMode,
              resultSource: resultSource,
              isSample: isSample,
              isPreview: isPreview,
              matchScore: matchScore,
              negativeSignals: negativeSignals ?? const [],
              clientTimestampMs: now.millisecondsSinceEpoch,
              metadata: _sanitize(metadata),
            ),
          );
    } catch (e) {
      // Log tidak boleh menjatuhkan UI.
      debugPrint('MakanMana EventLogger: $eventType gagal: $e');
    }
  }

  // ---------------- Kaedah pembantu ----------------

  void logScreenView(String screenName) =>
      logEvent(EventType.screenView, sourceScreen: screenName);

  void logSuggestionViewed({
    required String placeId,
    String? placeNameSnapshot,
    String? suggestionId,
    String? sessionId,
    String? sourceScreen,
    String? sourceMode,
    String? resultSource,
    bool isSample = false,
    bool isPreview = false,
    double? matchScore,
  }) =>
      logEvent(
        EventType.suggestionViewed,
        placeId: placeId,
        placeNameSnapshot: placeNameSnapshot,
        suggestionId: suggestionId,
        sessionId: sessionId,
        sourceScreen: sourceScreen ?? SourceScreen.suggestion,
        sourceMode: sourceMode,
        resultSource: resultSource,
        isSample: isSample,
        isPreview: isPreview,
        matchScore: matchScore,
      );

  void logPreviewShown({
    required String placeId,
    String? placeNameSnapshot,
    String? resultSource,
    double? matchScore,
    int? rankPosition,
    int? candidateCount,
    bool isSample = false,
  }) =>
      logEvent(
        EventType.suggestionPreviewShown,
        placeId: placeId,
        placeNameSnapshot: placeNameSnapshot,
        sourceScreen: SourceScreen.home,
        sourceMode: SourceMode.preview,
        resultSource: resultSource,
        isPreview: true,
        isSample: isSample,
        matchScore: matchScore,
        metadata: {
          if (rankPosition != null) 'rankPosition': rankPosition,
          if (candidateCount != null) 'candidateCount': candidateCount,
        },
      );

  void logNoMoreSuggestions({String? sessionId, String? sourceMode}) =>
      logEvent(
        EventType.noMoreSuggestions,
        sessionId: sessionId,
        sourceScreen: SourceScreen.suggestion,
        sourceMode: sourceMode,
      );

  void logMealLogged({
    required String source,
    String? placeId,
    String? placeNameSnapshot,
    String? sourceMode,
    bool fromSuggestion = false,
    bool isSample = false,
    String? mealId,
  }) =>
      logEvent(
        EventType.mealLogged,
        placeId: placeId,
        placeNameSnapshot: placeNameSnapshot,
        sourceMode: sourceMode,
        isSample: isSample,
        metadata: {
          'source': source,
          'fromSuggestion': fromSuggestion,
          if (mealId != null) 'mealId': mealId,
        },
      );

  // ---------------- Dalaman ----------------

  /// Grid lokasi KASAR (~1km) — bukan lat/lng tepat (privasi).
  String? _locationGrid(String? existing, double? lat, double? lng) {
    if (existing != null && existing.isNotEmpty) return existing;
    if (lat == null || lng == null) return null;
    final gLat = (lat * 100).round() / 100;
    final gLng = (lng * 100).round() / 100;
    return '$gLat,$gLng';
  }

  /// Buang kunci sensitif; tukar senarai alahan kepada kiraan sahaja.
  Map<String, dynamic> _sanitize(Map<String, dynamic>? input) {
    if (input == null || input.isEmpty) return const {};
    final out = <String, dynamic>{};
    input.forEach((key, value) {
      if (_sensitiveKeys.contains(key)) {
        // Simpan isyarat tanpa butiran sensitif.
        if ((key == 'allergies' || key == 'allergyList') && value is List) {
          out['allergyFlagCount'] = value.length;
        }
        return;
      }
      out[key] = value;
    });
    return out;
  }
}
