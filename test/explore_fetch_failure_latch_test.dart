import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/core/providers/location_context_provider.dart';
import 'package:makan_mana/core/services/cloud_suggestion_service.dart';
import 'package:makan_mana/features/explore/explore_pagination_controller.dart';
import 'package:makan_mana/models/place_summary.dart';
import 'package:makan_mana/repositories/auth_repository.dart';

/// Incident QA-INC-01 — Explore mesti TIDAK boleh tersangkut pada pemutar.
///
/// `_fetch` menetapkan `loading: true`, kemudian menunggu dua panggilan. Hanya
/// laluan BERJAYA mengosongkan bendera itu semula, jadi kegagalan yang tidak
/// dilindungi meninggalkan `loading` true SELAMANYA: `_buildEmptyState` melukis
/// CircularProgressIndicator, cabang `error` yang membawa butang "Cuba lagi"
/// tidak pernah dicapai, dan `loadFirst()` menolak setiap percubaan seterusnya
/// kerana ia berpaut pada `state.loading`.
///
/// Panggilan awan sendiri sudah jujur: `getNearbyPlacesPage` menangkap
/// pengecualiannya dan memulangkan null (dibuktikan atas peranti — ia memaparkan
/// "Cuba lagi", bukan pemutar). DUA mod kegagalan yang tidak dilindungi
/// berpunca daripada `locationContextProvider`:
///
///   1. LONTARAN  — `catch` membetulkannya.
///   2. GANTUNGAN — future yang TIDAK PERNAH selesai. `catch` tidak menangkap
///      ini langsung; hanya had masa boleh. Inilah yang benar-benar berlaku
///      atas peranti: `requestPermission()` dipanggil, dialog sistem muncul
///      dan keluar, "MM LOC" tidak pernah dicetak, dan Explore berpusing
///      lebih tiga minit tanpa jalan keluar.

const LocationRequestContext kNoLocation =
    LocationRequestContext(radiusMeters: 3000);

PlaceSummary p(String id) => PlaceSummary(
      placeId: id,
      name: id,
      cuisine: 'cafe',
      emoji: '🍽️',
      rating: 4.0,
      userRatingCount: 10,
      priceLevel: 2,
      distanceKm: 1,
      isOpen: true,
      address: 'x',
      matchScore: 50,
      matchReasonKeys: const [],
    );

/// Merekod setiap panggilan supaya ujian boleh membuktikan panggilan awan
/// TIDAK dibuat semasa lokasi masih tertunda.
class _RecordingService extends CloudSuggestionService {
  _RecordingService({this.pages = const []}) : super(firebaseReady: true);

  /// Halaman untuk dipulangkan mengikut urutan panggilan; jika habis, halaman
  /// kosong dipulangkan.
  final List<PlacesPage> pages;
  int calls = 0;

  @override
  Future<PlacesPage?> getNearbyPlacesPage({
    double? lat,
    double? lng,
    int? radius,
    String? languageCode,
    String? query,
    int cursor = 0,
  }) async {
    final index = calls;
    calls++;
    if (index < pages.length) return pages[index];
    return const PlacesPage(places: [], nextCursor: null, endOfResults: true);
  }
}

/// Memulangkan halaman mengikut urutan skrip, supaya satu panggilan boleh
/// dibuat tergantung sementara panggilan seterusnya selesai serta-merta.
class _SequencedService extends CloudSuggestionService {
  _SequencedService(this._script) : super(firebaseReady: true);

  final List<Future<PlacesPage?> Function()> _script;
  int calls = 0;

  @override
  Future<PlacesPage?> getNearbyPlacesPage({
    double? lat,
    double? lng,
    int? radius,
    String? languageCode,
    String? query,
    int cursor = 0,
  }) {
    final index = calls;
    calls++;
    if (index < _script.length) return _script[index]();
    return Future.value(
      const PlacesPage(places: [], nextCursor: null, endOfResults: true),
    );
  }
}

ProviderContainer makeContainer({
  required CloudSuggestionService service,
  required Future<LocationRequestContext> Function(Ref ref) location,
  bool listenLocationErrors = false,
}) {
  final container = ProviderContainer(
    overrides: [
      firebaseReadyProvider.overrideWith((ref) => true),
      authRepositoryProvider
          .overrideWithValue(AuthRepository(firebaseReady: false)),
      locationContextProvider.overrideWith(location),
      cloudSuggestionServiceProvider.overrideWithValue(service),
    ],
  );
  if (listenLocationErrors) {
    // Dalam aplikasi sebenar provider ini sentiasa diperhatikan (Home
    // menontonnya, pengawal ini mendengarnya), jadi AsyncError-nya dikendalikan
    // dan bukan ralat zon yang tidak ditangkap. Tanpa ini, ujian mati semasa
    // pemasangan dan kita tidak pernah sampai ke keadaan pengawal.
    container.listen<AsyncValue<LocationRequestContext>>(
      locationContextProvider,
      (_, __) {},
      onError: (_, __) {},
    );
  }
  container.listen(explorePaginationProvider, (_, __) {});
  return container;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('kegagalan lokasi tidak boleh menyelak Explore', () {
    test('LONTARAN → keadaan ralat yang boleh dipulihkan', () async {
      final service = _RecordingService();
      final c = makeContainer(
        service: service,
        location: (ref) async => throw StateError('lokasi gagal diselesaikan'),
        listenLocationErrors: true,
      );
      addTearDown(c.dispose);

      await c.read(explorePaginationProvider.notifier).loadFirst();
      final s = c.read(explorePaginationProvider);

      expect(s.loading, isFalse,
          reason: 'loading tersangkut true → pemutar kekal, tiada "Cuba lagi"');
      expect(s.error, isTrue,
          reason: 'tanpa error=true, butang "Cuba lagi" tidak pernah dilukis');
      expect(s.initialized, isTrue,
          reason: '!initialized juga melukis pemutar yang sama');
      expect(service.calls, 0,
          reason: 'panggilan awan tidak patut berlaku; lokasi gagal dahulu');
    });

    test('selepas lontaran, refresh masih boleh cuba lagi (tiada selak)',
        () async {
      final service = _RecordingService();
      final c = makeContainer(
        service: service,
        location: (ref) async => throw StateError('lokasi gagal diselesaikan'),
        listenLocationErrors: true,
      );
      addTearDown(c.dispose);

      final n = c.read(explorePaginationProvider.notifier);
      await n.loadFirst();
      // `loadFirst` berpaut pada `state.loading`; jika bendera itu tersangkut,
      // percubaan kedua ini pulang senyap dan pengguna terperangkap kekal.
      await n.refresh();

      final s = c.read(explorePaginationProvider);
      expect(s.loading, isFalse);
      expect(s.error, isTrue);
    });

    test('GANTUNGAN → had masa memulihkannya (fakeAsync, tiada tunggu sebenar)',
        () {
      fakeAsync((async) {
        final service = _RecordingService();
        final never = Completer<LocationRequestContext>();
        final c = makeContainer(
          service: service,
          location: (ref) => never.future,
        );

        final n = c.read(explorePaginationProvider.notifier);
        unawaited(n.loadFirst());
        async.flushMicrotasks();

        // Sebelum had masa: masih memuat, dan TIADA panggilan awan dibuat
        // semasa lokasi masih tertunda.
        expect(c.read(explorePaginationProvider).loading, isTrue);
        expect(service.calls, 0);

        async.elapse(const Duration(seconds: 19));
        async.flushMicrotasks();
        expect(c.read(explorePaginationProvider).loading, isTrue,
            reason: 'had masa tidak sepatutnya menembak lebih awal');

        async.elapse(const Duration(seconds: 2));
        async.flushMicrotasks();

        final s = c.read(explorePaginationProvider);
        expect(s.loading, isFalse,
            reason: 'gantungan tanpa had masa = pemutar kekal, tiada jalan keluar');
        expect(s.error, isTrue);
        expect(s.initialized, isTrue);
        expect(service.calls, 0);

        c.dispose();
        async.flushTimers();
      });
    });

    test('penolakan kebenaran diiktiraf SERTA-MERTA, tanpa menunggu had masa',
        () {
      fakeAsync((async) {
        // getPosition() memulangkan null dengan segera apabila platform
        // memulangkan penolakan; provider kemudian selesai dengan konteks
        // tanpa lat/lng (sandaran KL sisi pelayan). Explore mesti meneruskan
        // TERUS — bukan menunggu 20s.
        final service = _RecordingService(
          pages: [PlacesPage(places: [p('a')], nextCursor: null, endOfResults: true)],
        );
        final c = makeContainer(
          service: service,
          location: (ref) async => kNoLocation,
        );

        unawaited(c.read(explorePaginationProvider.notifier).loadFirst());
        async.elapse(const Duration(milliseconds: 50));
        async.flushMicrotasks();

        final s = c.read(explorePaginationProvider);
        expect(s.loading, isFalse, reason: 'tiada menunggu had masa');
        expect(s.error, isFalse);
        expect(s.places, hasLength(1));
        expect(service.calls, 1);
        // Tiada koordinat direka — konteks kekal tanpa lokasi.
        expect(s.location?.hasLocation, isFalse);

        c.dispose();
        async.flushTimers();
      });
    });
  });

  group('keputusan basi dan perlumbaan', () {
    test('Senario A — hasil LEWAT selepas had masa tidak menulis ganti UI', () {
      fakeAsync((async) {
        final service = _RecordingService();
        final late1 = Completer<LocationRequestContext>();
        final c = makeContainer(service: service, location: (ref) => late1.future);

        unawaited(c.read(explorePaginationProvider.notifier).loadFirst());
        async.elapse(const Duration(seconds: 21));
        async.flushMicrotasks();

        final afterTimeout = c.read(explorePaginationProvider);
        expect(afterTimeout.error, isTrue);
        expect(afterTimeout.loading, isFalse);

        // Sumber akhirnya selesai — `Future.timeout` tidak membatalkan operasi
        // asasnya, jadi ini BENAR-BENAR berlaku. Ia mesti diabaikan.
        late1.complete(kNoLocation);
        async.elapse(const Duration(seconds: 5));
        async.flushMicrotasks();

        final after = c.read(explorePaginationProvider);
        expect(after.error, isTrue, reason: 'kedatangan lewat menulis ganti UI');
        expect(after.loading, isFalse);
        expect(after.places, isEmpty);
        expect(service.calls, 0,
            reason: 'percubaan yang sudah tamat tidak boleh memanggil awan');

        c.dispose();
        async.flushTimers();
      });
    });

    test('Senario B — Retry menggantikan permintaan lama; A tidak boleh menang',
        () {
      fakeAsync((async) {
        // NOTA: `locationContextProvider` ialah FutureProvider yang DICACHE,
        // jadi dua `_fetch` berturut menunggu future lokasi yang SAMA. Oleh itu
        // perlumbaan "lama lwn baharu" yang sebenar berlaku pada halaman awan,
        // di mana pengawal generasi bertugas. Itu yang diuji di sini.
        final slowPageA = Completer<PlacesPage?>();
        final service = _SequencedService([
          () => slowPageA.future,
          () async =>
              PlacesPage(places: [p('B1')], nextCursor: null, endOfResults: true),
        ]);
        final c = makeContainer(
          service: service,
          location: (ref) async => kNoLocation,
        );

        final n = c.read(explorePaginationProvider.notifier);
        unawaited(n.loadFirst()); // A — halaman tergantung
        async.elapse(const Duration(milliseconds: 20));
        async.flushMicrotasks();
        expect(service.calls, 1);
        expect(c.read(explorePaginationProvider).loading, isTrue);

        unawaited(n.refresh()); // B — menggantikan A
        async.elapse(const Duration(milliseconds: 20));
        async.flushMicrotasks();

        final afterB = c.read(explorePaginationProvider);
        expect(afterB.places.map((e) => e.placeId), ['B1']);
        expect(afterB.loading, isFalse);
        expect(afterB.error, isFalse);

        // A akhirnya selesai, LEPAS B, dengan hasil yang berbeza.
        slowPageA.complete(
          PlacesPage(places: [p('A1')], nextCursor: null, endOfResults: true),
        );
        async.elapse(const Duration(seconds: 25));
        async.flushMicrotasks();

        final afterA = c.read(explorePaginationProvider);
        expect(afterA.places.map((e) => e.placeId), ['B1'],
            reason: 'permintaan lama menulis ganti hasil yang lebih baharu');
        expect(afterA.loading, isFalse);
        expect(afterA.error, isFalse);

        c.dispose();
        async.flushTimers();
      });
    });

    test('Senario C — pelupusan menguraikan _fetch yang tertunda', () {
      fakeAsync((async) {
        // Sumber yang TIDAK PERNAH selesai. Tanpa pembersihan pelupusan,
        // `_fetch` kekal menunggu selamanya — dan kerana `refresh()` MENUNGGU
        // `_fetch`, RefreshIndicator akan berpusing kekal.
        final service = _RecordingService();
        final never = Completer<LocationRequestContext>();
        final c = makeContainer(service: service, location: (ref) => never.future);

        final n = c.read(explorePaginationProvider.notifier);
        var finished = false;
        unawaited(n.loadFirst().whenComplete(() => finished = true));
        async.flushMicrotasks();
        expect(c.read(explorePaginationProvider).loading, isTrue);
        expect(finished, isFalse);

        // Skrin hilang semasa lokasi masih tertunda.
        c.dispose();
        async.flushMicrotasks();

        expect(finished, isTrue,
            reason: '`_fetch` masih menunggu future yang tidak pernah selesai');
        expect(service.calls, 0);

        // Masa melepasi had masa: tiada timer yatim yang menembak, tiada ralat.
        async.elapse(const Duration(seconds: 30));
        async.flushMicrotasks();
        expect(service.calls, 0);
        async.flushTimers();
      });
    });

    test('Senario C2 — kedatangan LEWAT selepas pelupusan diabaikan', () {
      fakeAsync((async) {
        final service = _RecordingService();
        final pending = Completer<LocationRequestContext>();
        final c =
            makeContainer(service: service, location: (ref) => pending.future);

        unawaited(c.read(explorePaginationProvider.notifier).loadFirst());
        async.flushMicrotasks();
        c.dispose();
        async.flushMicrotasks();

        // Sumber selesai SELEPAS pelupusan — mesti tidak melontar
        // `Bad state: Future already completed` dan tidak memanggil awan.
        pending.complete(kNoLocation);
        async.elapse(const Duration(seconds: 30));
        async.flushMicrotasks();

        expect(service.calls, 0);
        async.flushTimers();
      });
    });

    test('percubaan bertindih: setiap satu perlu timernya SENDIRI', () {
      fakeAsync((async) {
        // Satu medan timer yang DIKONGSI akan menyebabkan percubaan kedua
        // membatalkan timer percubaan pertama. Percubaan pertama kemudian tidak
        // pernah selesai — dan kerana `refresh()`/`loadFirst()` MENUNGGU
        // `_fetch`, future pemanggilnya menggantung selamanya juga.
        final service = _RecordingService();
        final never = Completer<LocationRequestContext>();
        final c = makeContainer(service: service, location: (ref) => never.future);

        final n = c.read(explorePaginationProvider.notifier);
        var firstDone = false;
        var secondDone = false;
        unawaited(n.loadFirst().whenComplete(() => firstDone = true));
        async.elapse(const Duration(seconds: 5));
        unawaited(n.refresh().whenComplete(() => secondDone = true));
        async.flushMicrotasks();

        expect(firstDone, isFalse);
        expect(secondDone, isFalse);

        // Melepasi belanjawan KEDUA-DUA percubaan.
        async.elapse(const Duration(seconds: 30));
        async.flushMicrotasks();

        expect(firstDone, isTrue,
            reason: 'percubaan pertama kehilangan timernya kepada yang kedua');
        expect(secondDone, isTrue);
        expect(c.read(explorePaginationProvider).loading, isFalse);
        expect(c.read(explorePaginationProvider).error, isTrue);

        c.dispose();
        async.flushTimers();
      });
    });

    test('retry berulang tidak mengumpul timer yatim', () {
      fakeAsync((async) {
        final service = _RecordingService();
        final c = makeContainer(
          service: service,
          location: (ref) async => kNoLocation,
        );

        final n = c.read(explorePaginationProvider.notifier);
        for (var i = 0; i < 5; i++) {
          unawaited(n.refresh());
          async.elapse(const Duration(milliseconds: 20));
          async.flushMicrotasks();
        }

        expect(c.read(explorePaginationProvider).loading, isFalse);
        expect(service.calls, 5);

        c.dispose();
        // Jika mana-mana daripada lima percubaan meninggalkan timer, ini
        // melontar.
        async.flushTimers();
      });
    });
  });
}
