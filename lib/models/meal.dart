import 'dart:convert';

/// Rekod makan: users/{uid}/meals/{mealId}.
class Meal {
  const Meal({
    required this.placeId,
    required this.placeNameSnapshot,
    required this.cuisine,
    required this.emoji,
    required this.timeSlot,
    required this.mealTime,
    this.source = 'suggestion',
    this.matchScore,
    this.priceLevel = 1,
    this.priceEstimate = '',
    this.id = '',
    this.satisfactionRating,
  });

  /// ID dokumen Firestore (kosong untuk rekod tempatan mod dev).
  final String id;

  /// Rating 1-5 yang pengguna beri selepas makan (null = belum dinilai).
  final int? satisfactionRating;

  final String placeId;
  final String placeNameSnapshot;
  final String cuisine;
  final String emoji;
  final String timeSlot;
  final DateTime mealTime;
  final String source; // suggestion | manual
  final int? matchScore;
  final int priceLevel;
  final String priceEstimate;

  /// Anggaran belanja kasar mengikut price level (untuk ringkasan mingguan).
  double get estimatedSpend =>
      const [0.0, 8.0, 18.0, 35.0, 60.0][priceLevel.clamp(0, 4)];

  Map<String, dynamic> toMap() => {
        'placeId': placeId,
        'placeNameSnapshot': placeNameSnapshot,
        'cuisineTags': [cuisine],
        'emoji': emoji,
        'timeSlot': timeSlot,
        'mealTime': mealTime.toIso8601String(),
        'source': source,
        'matchScore': matchScore,
        'priceLevel': priceLevel,
        'priceEstimate': priceEstimate,
      };

  factory Meal.fromMap(Map<String, dynamic> map, {String id = ''}) => Meal(
        id: id,
        satisfactionRating: (map['satisfactionRating'] as num?)?.toInt(),
        placeId: map['placeId'] as String? ?? '',
        placeNameSnapshot: map['placeNameSnapshot'] as String? ?? '',
        cuisine: ((map['cuisineTags'] as List?)?.isNotEmpty ?? false)
            ? (map['cuisineTags'] as List).first as String
            : map['cuisine'] as String? ?? '',
        emoji: map['emoji'] as String? ?? '🍽️',
        timeSlot: map['timeSlot'] as String? ?? 'lunch',
        mealTime: DateTime.tryParse(map['mealTime'] as String? ?? '') ??
            DateTime.now(),
        source: map['source'] as String? ?? 'suggestion',
        matchScore: (map['matchScore'] as num?)?.toInt(),
        priceLevel: (map['priceLevel'] as num?)?.toInt() ?? 1,
        priceEstimate: map['priceEstimate'] as String? ?? '',
      );

  String toJson() => jsonEncode(toMap());

  factory Meal.fromJson(String source) =>
      Meal.fromMap(jsonDecode(source) as Map<String, dynamic>);
}
