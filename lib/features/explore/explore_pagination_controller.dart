/// Phase 2.2A — kawalan pagination Explore (incremental load).
///
/// Halaman 12 setiap kali; kursor legap; nyahduplikasi merentas halaman; pengawal
/// permintaan serentak; keadaan loading/hujung/ralat. Awam/non-kohort: pelayan
/// pulangkan 12 + endOfResults=true → tiada butang "Load more" (selamat).
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/providers/location_context_provider.dart';
import '../../models/place_summary.dart';

/// Phase 2.2B — pengecam binaan KELIHATAN untuk pengesahan peranti sebenar.
/// Bump nilai ini setiap rebuild supaya pemilik boleh sahkan APK baharu.
const String kAlgo2BuildId = 'A2-2.4-AI-BRAIN';

@immutable
class ExplorePaginationState {
  const ExplorePaginationState({
    this.places = const [],
    this.cursor = 0,
    this.loading = false,
    this.endOfResults = false,
    this.error = false,
    this.initialized = false,
    this.diagnostics = const {},
    this.poolSize,
    this.location,
  });

  final List<PlaceSummary> places;
  final int cursor;
  final bool loading;
  final bool endOfResults;
  final bool error;
  final bool initialized;
  final Map<String, dynamic> diagnostics;
  final int? poolSize;

  /// LOCATION CONSISTENCY — konteks lokasi yang DIGUNA untuk fetch semasa
  /// (untuk panel diagnostik: lat/lng bertopeng, radius, cell, cacheKey).
  final LocationRequestContext? location;

  ExplorePaginationState copyWith({
    List<PlaceSummary>? places,
    int? cursor,
    bool? loading,
    bool? endOfResults,
    bool? error,
    bool? initialized,
    Map<String, dynamic>? diagnostics,
    int? poolSize,
    LocationRequestContext? location,
  }) =>
      ExplorePaginationState(
        places: places ?? this.places,
        cursor: cursor ?? this.cursor,
        loading: loading ?? this.loading,
        endOfResults: endOfResults ?? this.endOfResults,
        error: error ?? this.error,
        initialized: initialized ?? this.initialized,
        diagnostics: diagnostics ?? this.diagnostics,
        poolSize: poolSize ?? this.poolSize,
        location: location ?? this.location,
      );
}

class ExplorePaginationController extends StateNotifier<ExplorePaginationState> {
  ExplorePaginationController(this._ref)
      : super(const ExplorePaginationState()) {
    // LOCATION CONSISTENCY — bila lokasi/radius berubah (cacheKey berbeza),
    // reset halaman/cursor & muat semula halaman 1. Elak guna cache kawasan lama.
    _ref.listen<AsyncValue<LocationRequestContext>>(
      locationContextProvider,
      (prev, next) {
        final pk = prev?.valueOrNull?.cacheKey;
        final nk = next.valueOrNull?.cacheKey;
        if (nk != null && pk != null && nk != pk) {
          refresh();
        }
      },
    );
  }

  final Ref _ref;

  Future<void> loadFirst() async {
    if (state.initialized || state.loading) return;
    await _fetch(reset: true);
  }

  Future<void> loadMore() async {
    if (state.loading || state.endOfResults) return; // concurrent + end guard
    await _fetch(reset: false);
  }

  Future<void> refresh() async {
    state = const ExplorePaginationState(); // clean new snapshot
    await _fetch(reset: true);
  }

  Future<void> _fetch({required bool reset}) async {
    state = state.copyWith(loading: true, error: false);
    // LOCATION CONSISTENCY HOTFIX — lat/lng/radius dari konteks AUTHORITATIF
    // yang SAMA dengan Home & Spin. Sebelum ini controller ini TIDAK menghantar
    // lat/lng → pelayan default ke KL (punca Explore ≠ Home).
    final loc = await _ref.read(locationContextProvider.future);
    final page = await _ref.read(cloudSuggestionServiceProvider).getNearbyPlacesPage(
          lat: loc.lat,
          lng: loc.lng,
          radius: loc.radiusMeters > 0 ? loc.radiusMeters : 3000,
          cursor: reset ? 0 : state.cursor,
        );
    if (page == null) {
      state = state.copyWith(
          loading: false, error: true, initialized: true, location: loc);
      return;
    }
    // Dedupe by placeId across accumulated pages.
    final existing = reset ? <String>{} : state.places.map((p) => p.placeId).toSet();
    final merged = reset ? <PlaceSummary>[] : [...state.places];
    for (final p in page.places) {
      if (existing.add(p.placeId)) merged.add(p);
    }
    state = state.copyWith(
      places: merged,
      cursor: page.nextCursor ?? state.cursor,
      loading: false,
      endOfResults: page.endOfResults,
      initialized: true,
      diagnostics: page.diagnostics,
      poolSize: page.poolSize,
      location: loc,
    );
  }
}

final explorePaginationProvider = StateNotifierProvider.autoDispose<
    ExplorePaginationController, ExplorePaginationState>(
  (ref) => ExplorePaginationController(ref),
);
