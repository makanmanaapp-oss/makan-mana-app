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
    this.negativeSignals = const [],
    this.source,
    this.dataSource,
    this.canonicalPlaceId,
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

  /// Prompt 6: isyarat negatif jujur (cth. possible_allergy_conflict,
  /// price_unknown). Bukan jaminan keselamatan.
  final List<String> negativeSignals;

  /// Sumber data: google_places | firestore_cache | mock_fallback |
  /// demo_preview | offline_fallback | null.
  final String? source;

  /// Phase 1.14G: sumber data per-tempat untuk kohort dalaman —
  /// 'canonical' (server-mediated) | 'legacy' | null (laluan awam biasa).
  final String? dataSource;

  /// Phase 1.14G: ID kanonikal (kohort sahaja) untuk penghalaan stabil.
  final String? canonicalPlaceId;

  bool get isCanonicalData => dataSource == 'canonical';

  /// true jika data ini contoh/sampel (bukan cadangan live sebenar).
  bool get isSample =>
      source == 'mock_fallback' ||
      source == 'demo_preview' ||
      source == 'offline_fallback';

  /// NET-01: fallback tempatan bila Functions/rangkaian tidak sampai.
  bool get isOfflineFallback => source == 'offline_fallback';

  String get priceLabel => r'$' * priceLevel;

  /// Salinan dengan sumber baharu (untuk cop fallback offline).
  PlaceSummary copyWithSource(String newSource) => PlaceSummary(
        placeId: placeId,
        name: name,
        cuisine: cuisine,
        emoji: emoji,
        rating: rating,
        userRatingCount: userRatingCount,
        priceLevel: priceLevel,
        distanceKm: distanceKm,
        isOpen: isOpen,
        address: address,
        matchScore: matchScore,
        matchReasonKeys: matchReasonKeys,
        priceEstimate: priceEstimate,
        photoUrl: photoUrl,
        negativeSignals: negativeSignals,
        source: newSource,
        dataSource: dataSource,
        canonicalPlaceId: canonicalPlaceId,
      );

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
        negativeSignals:
            (map['negativeSignals'] as List?)?.cast<String>() ?? const [],
        source: map['source'] as String?,
        dataSource: map['dataSource'] as String?,
        canonicalPlaceId: map['canonicalPlaceId'] as String?,
      );
}
