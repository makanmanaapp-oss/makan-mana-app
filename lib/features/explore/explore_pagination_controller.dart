/// Phase 2.2A — kawalan pagination Explore (incremental load).
///
/// Halaman 12 setiap kali; kursor legap; nyahduplikasi merentas halaman; pengawal
/// permintaan serentak; keadaan loading/hujung/ralat. Carian dihantar ke server
/// supaya nama Registry boleh ditemui walaupun belum berada dalam 12 kad pertama.
library;

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/providers/location_context_provider.dart';
import '../../models/place_summary.dart';

/// Phase 2.2B — pengecam binaan KELIHATAN untuk pengesahan peranti sebenar.
/// Bump nilai ini setiap rebuild supaya pemilik boleh sahkan APK baharu.
const String kAlgo2BuildId = 'A2-REGISTRY-SEARCH-20260912';

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

  /// LOCATION CONSISTENCY — konteks lokasi yang DIGUNA untuk fetch semasa.
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
          unawaited(refresh());
        }
      },
    );
  }

  final Ref _ref;
  String _query = '';
  Timer? _searchDebounce;
  int _requestGeneration = 0;
  bool _disposed = false;

  Future<void> loadFirst() async {
    if (state.initialized || state.loading) return;
    await _fetch(reset: true);
  }

  Future<void> loadMore() async {
    if (state.loading || state.endOfResults || _query.isNotEmpty) return;
    await _fetch(reset: false);
  }

  /// Search is server-backed and debounced. Increment generation immediately so
  /// an older in-flight page cannot overwrite the new query state.
  void setSearchQuery(String value) {
    final clean = value.trim();
    if (clean == _query) return;
    _query = clean;
    _requestGeneration++;
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 280), () {
      if (_disposed) return;
      unawaited(refresh());
    });
  }

  Future<void> refresh() async {
    state = const ExplorePaginationState();
    await _fetch(reset: true);
  }

  String _identityKey(PlaceSummary place) {
    final canonical = place.canonicalPlaceId?.trim();
    return canonical != null && canonical.isNotEmpty ? canonical : place.placeId;
  }

  Future<void> _fetch({required bool reset}) async {
    final generation = ++_requestGeneration;
    final queryAtStart = _query;
    state = state.copyWith(loading: true, error: false);

    final loc = await _ref.read(locationContextProvider.future);
    if (_disposed || generation != _requestGeneration) return;

    final page = await _ref.read(cloudSuggestionServiceProvider).getNearbyPlacesPage(
          lat: loc.lat,
          lng: loc.lng,
          radius: loc.radiusMeters > 0 ? loc.radiusMeters : 3000,
          query: queryAtStart,
          cursor: reset ? 0 : state.cursor,
        );
    if (_disposed || generation != _requestGeneration || queryAtStart != _query) {
      return;
    }
    if (page == null) {
      state = state.copyWith(
          loading: false, error: true, initialized: true, location: loc);
      return;
    }

    // Canonical identity, not raw provider ID, is the dedupe key. This prevents
    // a later Google/provider alias from creating a second restaurant card.
    final existing = reset
        ? <String>{}
        : state.places.map(_identityKey).toSet();
    final merged = reset ? <PlaceSummary>[] : [...state.places];
    for (final p in page.places) {
      if (existing.add(_identityKey(p))) merged.add(p);
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

  @override
  void dispose() {
    _disposed = true;
    _requestGeneration++;
    _searchDebounce?.cancel();
    super.dispose();
  }
}

final explorePaginationProvider = StateNotifierProvider.autoDispose<
    ExplorePaginationController, ExplorePaginationState>(
  (ref) => ExplorePaginationController(ref),
);
