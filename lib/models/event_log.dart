/// Event AI Brain: events/{eventId}.
/// Raw event ialah bukti; profil brain ialah ringkasan (Milestone 3+).
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

  Map<String, dynamic> toMap() => {
        'userId': userId,
        'eventType': eventType,
        'timeSlot': timeSlot,
        'languageCode': languageCode,
        'plan': plan,
        'placeId': placeId,
        'suggestionId': suggestionId,
        'sessionId': sessionId,
        'mood': mood,
        'deviceType': 'android',
        'metadata': metadata,
      };
}
