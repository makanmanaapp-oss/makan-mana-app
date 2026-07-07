/// Ringkasan tempat makan. Milestone 1: data dummy sahaja.
/// Milestone 4 akan isi dari Google Places API (New).
class PlaceSummary {
  const PlaceSummary({
    required this.placeId,
    required this.name,
    required this.cuisine,
    required this.emoji,
    required this.rating,
    required this.userRatingCount,
    required this.priceLevel,
    required this.distanceKm,
    required this.isOpen,
    required this.address,
    required this.matchScore,
    required this.matchReasonKeys,
    this.priceEstimate = '',
    this.photoUrl,
  });

  final String placeId;
  final String name;
  final String cuisine;
  final String emoji;
  final double rating;
  final int userRatingCount;
  final int priceLevel; // 1-4
  final double distanceKm;
  final bool isOpen;
  final String address;
  final int matchScore; // 0-100
  final List<String> matchReasonKeys; // kunci l10n cth. withinBudget
  final String priceEstimate;

  /// Foto sebenar kedai dari Google Places (null = guna monogram).
  final String? photoUrl;

  String get priceLabel => r'$' * priceLevel;

  /// Dari respons Cloud Function getSuggestions (Milestone 3+).
  factory PlaceSummary.fromMap(Map<String, dynamic> map) => PlaceSummary(
        placeId: map['placeId'] as String? ?? '',
        name: map['name'] as String? ?? '',
        cuisine: map['cuisine'] as String? ?? '',
        emoji: map['emoji'] as String? ?? '🍽️',
        rating: (map['rating'] as num?)?.toDouble() ?? 0,
        userRatingCount: (map['userRatingCount'] as num?)?.toInt() ?? 0,
        priceLevel: (map['priceLevel'] as num?)?.toInt() ?? 1,
        distanceKm: (map['distanceKm'] as num?)?.toDouble() ?? 0,
        isOpen: map['isOpen'] as bool? ?? true,
        address: map['address'] as String? ?? '',
        matchScore: (map['matchScore'] as num?)?.toInt() ?? 0,
        matchReasonKeys:
            (map['matchReasonKeys'] as List?)?.cast<String>() ?? const [],
        priceEstimate: map['priceEstimate'] as String? ?? '',
        photoUrl: map['photoUrl'] as String?,
      );
}
