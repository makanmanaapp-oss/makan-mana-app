import 'dart:math';

import '../../models/place_summary.dart';

/// Sumber cadangan dummy untuk Milestone 1-3.
/// Akan digantikan dengan Cloud Function getSuggestions + Google Places di Milestone 4.
class DummySuggestionService {
  final _random = Random();

  static const List<PlaceSummary> places = [
    PlaceSummary(
      placeId: 'dummy_nasi_lemak_bonda',
      name: 'Nasi Lemak Bonda',
      cuisine: 'Melayu',
      emoji: '🍛',
      rating: 4.6,
      userRatingCount: 1280,
      priceLevel: 1,
      distanceKm: 0.8,
      isOpen: true,
      address: 'Jalan Merah 3, Taman Sentosa',
      matchScore: 92,
      matchReasonKeys: ['withinBudget', 'nearLocation', 'fitsMood'],
      priceEstimate: 'RM6 - RM12',
    ),
    PlaceSummary(
      placeId: 'dummy_mamak_maju_jaya',
      name: 'Restoran Mamak Maju Jaya',
      cuisine: 'Mamak',
      emoji: '🫓',
      rating: 4.3,
      userRatingCount: 3150,
      priceLevel: 1,
      distanceKm: 1.2,
      isOpen: true,
      address: 'Lorong Kuning 7, Bandar Baru',
      matchScore: 88,
      matchReasonKeys: ['withinBudget', 'nearLocation'],
      priceEstimate: 'RM5 - RM15',
    ),
    PlaceSummary(
      placeId: 'dummy_kopi_lima_pagi',
      name: 'Kopi Lima Pagi',
      cuisine: 'Cafe',
      emoji: '☕',
      rating: 4.7,
      userRatingCount: 640,
      priceLevel: 2,
      distanceKm: 2.4,
      isOpen: true,
      address: 'The Curve Walk, Seksyen 9',
      matchScore: 84,
      matchReasonKeys: ['fitsMood', 'nearLocation'],
      priceEstimate: 'RM12 - RM28',
    ),
    PlaceSummary(
      placeId: 'dummy_ayam_gepuk_pakcik',
      name: 'Ayam Gepuk Pak Cik',
      cuisine: 'Indonesia',
      emoji: '🍗',
      rating: 4.5,
      userRatingCount: 990,
      priceLevel: 2,
      distanceKm: 1.9,
      isOpen: true,
      address: 'Jalan Api 12, Taman Pelangi',
      matchScore: 86,
      matchReasonKeys: ['fitsMood', 'withinBudget'],
      priceEstimate: 'RM10 - RM18',
    ),
    PlaceSummary(
      placeId: 'dummy_chee_cheong_fun_ss2',
      name: 'Chee Cheong Fun Corner',
      cuisine: 'Cina',
      emoji: '🥢',
      rating: 4.4,
      userRatingCount: 780,
      priceLevel: 1,
      distanceKm: 3.1,
      isOpen: false,
      address: 'Medan Selera SS2',
      matchScore: 75,
      matchReasonKeys: ['withinBudget'],
      priceEstimate: 'RM5 - RM10',
    ),
    PlaceSummary(
      placeId: 'dummy_banana_leaf_raju',
      name: 'Raju Banana Leaf',
      cuisine: 'India',
      emoji: '🍃',
      rating: 4.8,
      userRatingCount: 2100,
      priceLevel: 2,
      distanceKm: 4.5,
      isOpen: true,
      address: 'Jalan Gasing, PJ',
      matchScore: 81,
      matchReasonKeys: ['fitsMood'],
      priceEstimate: 'RM12 - RM25',
    ),
    PlaceSummary(
      placeId: 'dummy_tomyam_selera_kampung',
      name: 'Tomyam Selera Kampung',
      cuisine: 'Thai',
      emoji: '🍲',
      rating: 4.2,
      userRatingCount: 1550,
      priceLevel: 2,
      distanceKm: 2.8,
      isOpen: true,
      address: 'Jalan Damai 5, Kampung Baru',
      matchScore: 79,
      matchReasonKeys: ['fitsMood', 'withinBudget'],
      priceEstimate: 'RM8 - RM20',
    ),
    PlaceSummary(
      placeId: 'dummy_western_grill_house',
      name: 'The Grill House',
      cuisine: 'Western',
      emoji: '🥩',
      rating: 4.5,
      userRatingCount: 860,
      priceLevel: 3,
      distanceKm: 5.2,
      isOpen: true,
      address: 'Aman Suria Mall, Tingkat 2',
      matchScore: 70,
      matchReasonKeys: ['fitsMood'],
      priceEstimate: 'RM25 - RM60',
    ),
    PlaceSummary(
      placeId: 'dummy_salad_hijau_sihat',
      name: 'Hijau Sihat Bowl',
      cuisine: 'Healthy',
      emoji: '🥗',
      rating: 4.6,
      userRatingCount: 430,
      priceLevel: 2,
      distanceKm: 3.6,
      isOpen: true,
      address: 'Sunway Geo Avenue',
      matchScore: 77,
      matchReasonKeys: ['fitsMood', 'nearLocation'],
      priceEstimate: 'RM15 - RM25',
    ),
    PlaceSummary(
      placeId: 'dummy_burger_bakar_abang',
      name: 'Burger Bakar Abang Long',
      cuisine: 'Street Food',
      emoji: '🍔',
      rating: 4.1,
      userRatingCount: 2300,
      priceLevel: 1,
      distanceKm: 0.5,
      isOpen: true,
      address: 'Tepi Jalan Besar, Seksyen 7',
      matchScore: 83,
      matchReasonKeys: ['withinBudget', 'nearLocation'],
      priceEstimate: 'RM6 - RM14',
    ),
  ];

  /// Pilihan utama AI (dummy): skor tertinggi yang buka.
  PlaceSummary heroPick() =>
      places.where((p) => p.isOpen).reduce((a, b) => a.matchScore >= b.matchScore ? a : b);

  /// Satu cadangan rawak (untuk butang Spin).
  PlaceSummary randomPick() {
    final open = places.where((p) => p.isOpen).toList();
    return open[_random.nextInt(open.length)];
  }

  List<PlaceSummary> nearby({int limit = 6}) {
    final sorted = [...places]..sort((a, b) => a.distanceKm.compareTo(b.distanceKm));
    return sorted.take(limit).toList();
  }

  PlaceSummary? byId(String placeId) {
    for (final p in places) {
      if (p.placeId == placeId) return p;
    }
    return null;
  }
}
