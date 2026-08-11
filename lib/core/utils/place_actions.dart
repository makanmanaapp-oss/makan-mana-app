import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../models/place_summary.dart';
import '../events/event_types.dart';
import '../providers.dart';

/// Tindakan & event berkaitan tempat (Prompt 4 + Prompt 8): buka peta + log
/// AI Brain melalui EventLogger pusat. Dikongsi oleh Suggestion Card dan
/// Restaurant Detail supaya satu logik.

/// Log `suggestion_viewed` (dipanggil bila skrin cadangan dibuka).
/// Tidak crash jika suggestionId hilang (kad dibuka dari nearby/dummy).
void logSuggestionViewed(
  WidgetRef ref,
  PlaceSummary place, {
  required String source,
  String? suggestionId,
  String? sessionId,
}) {
  ref.read(eventLoggerProvider).logSuggestionViewed(
        placeId: place.placeId,
        placeNameSnapshot: place.name,
        suggestionId: suggestionId,
        sessionId: sessionId,
        sourceScreen: source,
        resultSource: place.source,
        isSample: place.isSample,
        matchScore: place.matchScore.toDouble(),
      );
}

/// Log `restaurant_detail_viewed` bila skrin detail dibuka dari cadangan.
/// Membawa konteks cadangan (suggestionId/sessionId/source) jika ada.
void logRestaurantDetailViewed(
  WidgetRef ref,
  PlaceSummary place, {
  String? suggestionId,
  String? sessionId,
  String? source,
}) {
  ref.read(eventLoggerProvider).logEvent(
        EventType.restaurantDetailViewed,
        placeId: place.placeId,
        placeNameSnapshot: place.name,
        suggestionId: suggestionId,
        sessionId: sessionId,
        sourceScreen: SourceScreen.restaurantDetail,
        resultSource: place.source ?? source,
        isSample: place.isSample,
      );
}

/// Buka tempat dalam Google Maps + log `open_map`.
/// Keutamaan URI: query_place_id (tempat Google sebenar) -> carian nama.
/// Tempat dummy: carian ikut nama sahaja. Tidak menyekat pembukaan peta
/// jika log gagal.
Future<void> openPlaceInMaps(
  WidgetRef ref,
  PlaceSummary place, {
  required String source, // suggestion_card | restaurant_detail
  String? suggestionId,
  String? sessionId,
}) async {
  ref.read(eventLoggerProvider).logEvent(
        EventType.openMap,
        placeId: place.placeId,
        placeNameSnapshot: place.name,
        suggestionId: suggestionId,
        sessionId: sessionId,
        sourceScreen: source,
        resultSource: place.source,
        isSample: place.isSample,
        metadata: {'distanceKm': place.distanceKm},
      );

  final query = Uri.encodeComponent('${place.name} ${place.address}'.trim());
  final idParam = place.placeId.startsWith('dummy_')
      ? ''
      : '&query_place_id=${place.placeId}';
  final uri = Uri.parse(
    'https://www.google.com/maps/search/?api=1&query=$query$idParam',
  );
  try {
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (e) {
    debugPrint('MakanMana: buka peta gagal: $e');
  }
}
