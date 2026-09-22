import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../models/place_summary.dart';
import '../events/event_types.dart';
import '../providers.dart';
import 'real_place.dart';

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

// WAVE 6 HOTFIX — `logRestaurantDetailViewed` was removed from here.
//
// It existed so ONE screen could announce a detail view, and that is exactly
// what went wrong: only the suggestion path ever called it, so a view arriving
// from Explore or search was never counted. The detail screen now emits its own
// view once, for every entry route. A per-caller helper would just invite the
// same partial wiring again.

/// Buka tempat dalam Google Maps + log `open_map`.
///
/// WAVE 4A — tempat BUKAN-SEBENAR (contoh demo, data sintetik QA) TIDAK
/// PERNAH dibuka. Dahulu fungsi ini membina carian Google Maps daripada nama
/// REKAAN + kawasan SEBENAR (cth. "Raju Banana Leaf Jalan Gasing, PJ"),
/// menghantar pengguna ke kedai sebenar yang namanya kebetulan serupa.
///
/// Memulangkan true jika peta benar-benar dibuka.
Future<bool> openPlaceInMaps(
  WidgetRef ref,
  PlaceSummary place, {
  required String source, // suggestion_card | restaurant_detail
  String? suggestionId,
  String? sessionId,
}) async {
  if (!isNavigablePlace(place)) {
    debugPrint('MakanMana: buka peta DISEKAT untuk tempat bukan-sebenar '
        '(${place.placeId})');
    return false;
  }

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
  final uri = Uri.parse(
    'https://www.google.com/maps/search/?api=1&query=$query'
    '&query_place_id=${place.placeId}',
  );
  try {
    await launchUrl(uri, mode: LaunchMode.externalApplication);
    return true;
  } catch (e) {
    debugPrint('MakanMana: buka peta gagal: $e');
    return false;
  }
}
