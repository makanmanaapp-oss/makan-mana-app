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
import '../../core/services/cloud_suggestion_service.dart';
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

  /// Setiap percubaan memegang timernya SENDIRI. Satu medan timer yang dikongsi
  /// akan menyebabkan percubaan yang lebih baharu membatalkan timer percubaan
  /// yang lebih lama, dan percubaan lama itu kemudian menggantung SELAMANYA —
  /// iaitu pepijat yang sama yang sedang dibaiki di sini, cuma satu lapisan
  /// lebih dalam. Kerana `refresh()` MENUNGGU `_fetch`, gantungan itu juga akan
  /// membuat RefreshIndicator berpusing kekal.
  final Set<_LocationAttempt> _locationAttempts = <_LocationAttempt>{};

  /// Belanjawan untuk menyelesaikan lokasi. Cukup longgar supaya pengguna
  /// sempat membaca dialog kebenaran, cukup ketat supaya senarai tidak
  /// berpusing tanpa henti apabila future itu tidak pernah selesai.
  static const Duration _locationBudget = Duration(seconds: 20);

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

  /// Had masa untuk `source`, tanpa `Future.timeout`.
  ///
  /// `Future.timeout` mencipta timer yang HIDUP sehingga sumbernya selesai —
  /// dan sumber di sini boleh tidak pernah selesai, jadi timer itu kekal
  /// tergantung selepas pelupusan. Itu memecahkan `flutter_test`
  /// (`A Timer is still pending even after the widget tree was disposed`) dan,
  /// lebih penting, ia kerja yang masih berjalan selepas skrin hilang.
  ///
  /// Versi ini memberi SETIAP percubaan timernya sendiri dan menjejaki semuanya
  /// dalam [_locationAttempts], supaya `dispose()` boleh menyelesaikan yang
  /// masih tertunda dan tiada percubaan boleh membatalkan timer percubaan lain.
  Future<LocationRequestContext> _withLocationBudget(
    Future<LocationRequestContext> source,
  ) {
    final attempt = _LocationAttempt();
    _locationAttempts.add(attempt);
    attempt.timer = Timer(_locationBudget, () {
      _locationAttempts.remove(attempt);
      attempt.fail(TimeoutException('lokasi tidak selesai', _locationBudget));
    });
    // `Future.timeout` TIDAK membatalkan operasi asasnya, dan tiada apa-apa di
    // sini boleh membatalkan permintaan kebenaran platform. Jadi sumber ini
    // masih boleh selesai LAMA selepas had masanya tamat; `_LocationAttempt`
    // mengabaikan kedatangan lewat itu, dan pengawal generasi dalam `_fetch`
    // menghalangnya daripada menulis ganti keadaan yang lebih baharu.
    source.then(
      (value) {
        _locationAttempts.remove(attempt);
        attempt.complete(value);
      },
      onError: (Object error, StackTrace stack) {
        _locationAttempts.remove(attempt);
        attempt.fail(error, stack);
      },
    );
    return attempt.future;
  }

  String _identityKey(PlaceSummary place) {
    final canonical = place.canonicalPlaceId?.trim();
    return canonical != null && canonical.isNotEmpty ? canonical : place.placeId;
  }

  Future<void> _fetch({required bool reset}) async {
    final generation = ++_requestGeneration;
    final queryAtStart = _query;
    state = state.copyWith(loading: true, error: false);

    // INCIDENT QA-INC-01 — apa-apa LONTARAN di sini dahulunya terbang keluar
    // dengan `loading` masih true. Kesannya kekal, bukan sementara: UI melukis
    // pemutar, cabang `error` yang membawa "Cuba lagi" tidak pernah dicapai,
    // dan `loadFirst()` menolak setiap percubaan seterusnya kerana ia berpaut
    // pada `state.loading`. `getNearbyPlacesPage` menangkap sendiri, jadi
    // sumber sebenar ialah `locationContextProvider` (GPS/kebenaran peranti).
    final LocationRequestContext loc;
    final PlacesPage? page;
    try {
      // DIBUKTIKAN ATAS PERANTI: `locationContextProvider` boleh MENGGANTUNG
      // SELAMANYA, bukan melontar. Satu-satunya `await`-nya ialah
      // `getPosition()`, yang memanggil `requestPermission()` apabila kebenaran
      // ditolak — dan future dialog sistem itu boleh tidak pernah selesai.
      // Diperhatikan: "MM LOC" tidak pernah dicetak, GrantPermissionsActivity
      // keluar, Explore berpusing >3 minit. `catch` TIDAK menangkap gantungan,
      // jadi had masa ini yang menjadikannya boleh dipulihkan.
      loc = await _withLocationBudget(
        _ref.read(locationContextProvider.future),
      );
      if (_disposed || generation != _requestGeneration) return;

      page = await _ref.read(cloudSuggestionServiceProvider).getNearbyPlacesPage(
            lat: loc.lat,
            lng: loc.lng,
            radius: loc.radiusMeters > 0 ? loc.radiusMeters : 3000,
            query: queryAtStart,
            cursor: reset ? 0 : state.cursor,
          );
    } catch (error, stack) {
      debugPrint('MakanMana: Explore _fetch gagal: $error');
      assert(() {
        debugPrintStack(stackTrace: stack, maxFrames: 6);
        return true;
      }());
      // Gagal KELIHATAN dan BOLEH DIPULIHKAN — sama seperti halaman null.
      if (!_disposed && generation == _requestGeneration) {
        state = state.copyWith(loading: false, error: true, initialized: true);
      }
      return;
    }
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
    // Selesaikan setiap percubaan yang masih tergantung supaya `_fetch`-nya
    // terurai dan masuk ke `catch`, yang menyemak `_disposed` dan TIDAK
    // menyentuh keadaan. Membatalkan timer sahaja akan meninggalkan `_fetch`
    // menunggu future yang tidak pernah selesai.
    for (final attempt in _locationAttempts.toList()) {
      attempt.fail(StateError('Explore dilupuskan semasa lokasi tertunda'));
    }
    _locationAttempts.clear();
    super.dispose();
  }
}

final explorePaginationProvider = StateNotifierProvider.autoDispose<
    ExplorePaginationController, ExplorePaginationState>(
  (ref) => ExplorePaginationController(ref),
);

/// Satu percubaan menyelesaikan lokasi, dengan timernya SENDIRI.
///
/// Wujud supaya percubaan serentak tidak boleh membatalkan timer satu sama lain
/// dan supaya kedatangan LEWAT (sumber selesai selepas had masa tamat, atau
/// selepas pelupusan) diabaikan dengan senyap dan bukan melontar
/// `Bad state: Future already completed`.
class _LocationAttempt {
  final Completer<LocationRequestContext> _completer =
      Completer<LocationRequestContext>();

  Timer? timer;

  Future<LocationRequestContext> get future => _completer.future;

  void complete(LocationRequestContext value) {
    timer?.cancel();
    if (!_completer.isCompleted) _completer.complete(value);
  }

  void fail(Object error, [StackTrace? stack]) {
    timer?.cancel();
    if (!_completer.isCompleted) {
      _completer.completeError(error, stack ?? StackTrace.current);
    }
  }
}
