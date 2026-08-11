/// Event AI Brain: events/{eventId}.
/// Raw event ialah bukti; profil brain ialah ringkasan (Milestone 3+).
/// Prompt 8: skema diperkaya (schemaVersion, sourceMode/resultSource,
/// isSample/isPreview, radius, locationGrid) — semua medan baru PILIHAN
/// supaya penulis lama kekal serasi.
class EventLog {
  const EventLog({
    required this.userId,
    required this.eventType,
    required this.timeSlot,
    required this.languageCode,
    required this.plan,
    this.placeId,
    this.suggestionId,
    this.sessionId,
    this.mood,
    this.metadata = const {},
    this.schemaVersion = 1,
    this.source = 'client',
    this.sourceScreen,
    this.platform = 'android',
    this.dayOfWeek,
    this.radiusKm,
    this.radiusMeters,
    this.locationGrid,
    this.sourceMode,
    this.resultSource,
    this.isSample = false,
    this.isPreview = false,
    this.placeNameSnapshot,
    this.matchScore,
    this.negativeSignals = const [],
    this.scoresSnapshot = const {},
    this.clientTimestampMs,
  });

  final String userId;
  final String eventType;
  final String timeSlot;
  final String languageCode;
  final String plan;
  final String? placeId;
  final String? suggestionId;
  final String? sessionId;
  final String? mood;
  final Map<String, dynamic> metadata;

  // ---- Prompt 8: pengayaan skema (semua pilihan) ----
  final int schemaVersion;
  final String source; // client | backend
  final String? sourceScreen;
  final String platform; // android | ios | web | unknown
  final String? dayOfWeek;
  final double? radiusKm;
  final int? radiusMeters;
  final String? locationGrid; // grid kasar, BUKAN lat/lng tepat
  final String? sourceMode; // preview | spin | manual | sample | system
  final String? resultSource; // google_places | mock_fallback | ...
  final bool isSample;
  final bool isPreview;
  final String? placeNameSnapshot;
  final double? matchScore;
  final List<String> negativeSignals;
  final Map<String, dynamic> scoresSnapshot;
  final int? clientTimestampMs;

  Map<String, dynamic> toMap() => {
        'schemaVersion': schemaVersion,
        'userId': userId,
        'eventType': eventType,
        'timeSlot': timeSlot,
        'languageCode': languageCode,
        'plan': plan,
        'source': source,
        'platform': platform,
        'deviceType': platform,
        if (sourceScreen != null) 'sourceScreen': sourceScreen,
        if (dayOfWeek != null) 'dayOfWeek': dayOfWeek,
        'placeId': placeId,
        if (placeNameSnapshot != null) 'placeNameSnapshot': placeNameSnapshot,
        'suggestionId': suggestionId,
        'sessionId': sessionId,
        'mood': mood,
        if (radiusKm != null) 'radiusKm': radiusKm,
        if (radiusMeters != null) 'radiusMeters': radiusMeters,
        if (locationGrid != null) 'locationGrid': locationGrid,
        if (sourceMode != null) 'sourceMode': sourceMode,
        if (resultSource != null) 'resultSource': resultSource,
        'isSample': isSample,
        'isPreview': isPreview,
        if (matchScore != null) 'matchScore': matchScore,
        if (negativeSignals.isNotEmpty) 'negativeSignals': negativeSignals,
        if (scoresSnapshot.isNotEmpty) 'scoresSnapshot': scoresSnapshot,
        if (clientTimestampMs != null) 'clientTimestamp': clientTimestampMs,
        'metadata': metadata,
      };
}
