/// Rekod cadangan: users/{uid}/suggestions/{suggestionId}.
class SuggestionRecord {
  const SuggestionRecord({
    required this.suggestionId,
    required this.placeId,
    required this.sessionId,
    required this.status,
    required this.matchScore,
    required this.timeSlot,
    this.reason,
    this.rankPosition = 1,
    this.distanceKm = 0,
    this.priceEstimate = '',
    this.matchReasons = const [],
    this.algorithmVersion = 'dummy_v1',
  });

  final String suggestionId;
  final String placeId;
  final String sessionId;
  final String status; // shown | accepted | rejected
  final int matchScore;
  final String timeSlot;
  final String? reason;
  final int rankPosition;
  final double distanceKm;
  final String priceEstimate;
  final List<String> matchReasons;
  final String algorithmVersion;

  Map<String, dynamic> toMap() => {
        'placeId': placeId,
        'sessionId': sessionId,
        'status': status,
        'matchScore': matchScore,
        'timeSlot': timeSlot,
        'reason': reason,
        'rankPosition': rankPosition,
        'distanceKm': distanceKm,
        'priceEstimate': priceEstimate,
        'matchReasons': matchReasons,
        'algorithmVersion': algorithmVersion,
      };
}
