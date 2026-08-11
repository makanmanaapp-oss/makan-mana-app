import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/events/event_types.dart';
import '../../core/providers.dart';
import '../../core/providers/makanmana_user_context_provider.dart';
import '../../core/utils/time_slot_utils.dart';
import '../../models/meal.dart';
import '../../models/place_summary.dart';

/// Asal cadangan yang sedang dipapar (menentukan tingkah laku accept/reject).
/// spin    = sesi spin sebenar (had spin, sessionId + suggestionId pelayan).
/// preview = Home AI Pick (mode preview: TIADA had, mungkin tiada suggestionId).
/// nearby  = dibuka dari senarai berdekatan / laluan generik.
/// sample  = data contoh/mock/demo (JANGAN latih sebagai pembelajaran sebenar).
enum SuggestionOrigin { spin, preview, nearby, sample }

/// Keadaan gelung tindakan cadangan (Prompt 7). Menjejak calon semasa,
/// alternatif tempatan, id sesi, dan bendera pemprosesan untuk elak
/// meal berganda / tekan dua kali.
@immutable
class SuggestionActionState {
  const SuggestionActionState({
    this.place,
    this.origin = SuggestionOrigin.nearby,
    this.suggestionId,
    this.sessionId,
    this.source,
    this.isSample = false,
    this.alternatives = const [],
    this.rejectedPlaceIds = const [],
    this.shownPlaceIds = const [],
    this.acceptedPlaceId,
    this.processing = false,
    this.accepted = false,
    this.noMore = false,
    this.rejectError = false,
    this.mood,
    this.radiusMeters,
    this.rankPosition,
    this.candidateCount,
    this.contextHash,
  });

  final PlaceSummary? place;
  final SuggestionOrigin origin;
  final String? suggestionId;
  final String? sessionId;
  final String? source;
  final bool isSample;
  final List<PlaceSummary> alternatives;
  final List<String> rejectedPlaceIds;
  final List<String> shownPlaceIds;
  final String? acceptedPlaceId;

  /// Sedang memproses accept/reject (butang dimatikan sementara).
  final bool processing;

  /// Sudah accept — elak submit berganda / meal berganda.
  final bool accepted;

  /// Semua alternatif tempatan habis (papar keadaan kosong).
  final bool noMore;

  /// Phase Master-fix — Reject authoritative (Algorithm 2) gagal SEMENTARA
  /// (rangkaian/pelayan). UI papar keadaan "cuba lagi" JUJUR. TIDAK PERNAH
  /// jatuh ke tempat dummy dalam sesi Algorithm 2 (kekalkan kad semasa).
  final bool rejectError;

  final String? mood;
  final int? radiusMeters;
  final int? rankPosition;
  final int? candidateCount;

  /// Phase 2.2D — contextHash opaque untuk Reject/Next authoritative (server).
  final String? contextHash;

  bool get isSpin => origin == SuggestionOrigin.spin;

  SuggestionActionState copyWith({
    PlaceSummary? place,
    SuggestionOrigin? origin,
    Object? suggestionId = _sentinel,
    Object? sessionId = _sentinel,
    String? source,
    bool? isSample,
    List<PlaceSummary>? alternatives,
    List<String>? rejectedPlaceIds,
    List<String>? shownPlaceIds,
    Object? acceptedPlaceId = _sentinel,
    bool? processing,
    bool? accepted,
    bool? noMore,
    bool? rejectError,
    String? mood,
    int? radiusMeters,
    int? rankPosition,
    int? candidateCount,
    Object? contextHash = _sentinel,
  }) {
    return SuggestionActionState(
      place: place ?? this.place,
      origin: origin ?? this.origin,
      suggestionId:
          suggestionId == _sentinel ? this.suggestionId : suggestionId as String?,
      sessionId: sessionId == _sentinel ? this.sessionId : sessionId as String?,
      source: source ?? this.source,
      isSample: isSample ?? this.isSample,
      alternatives: alternatives ?? this.alternatives,
      rejectedPlaceIds: rejectedPlaceIds ?? this.rejectedPlaceIds,
      shownPlaceIds: shownPlaceIds ?? this.shownPlaceIds,
      acceptedPlaceId: acceptedPlaceId == _sentinel
          ? this.acceptedPlaceId
          : acceptedPlaceId as String?,
      processing: processing ?? this.processing,
      accepted: accepted ?? this.accepted,
      noMore: noMore ?? this.noMore,
      rejectError: rejectError ?? this.rejectError,
      mood: mood ?? this.mood,
      radiusMeters: radiusMeters ?? this.radiusMeters,
      rankPosition: rankPosition ?? this.rankPosition,
      candidateCount: candidateCount ?? this.candidateCount,
      contextHash:
          contextHash == _sentinel ? this.contextHash : contextHash as String?,
    );
  }

  static const _sentinel = Object();
}

/// Pemilik tunggal gelung Accept/Reject/Next untuk Suggestion Screen (Prompt 7).
/// Menyatukan spin (sebenar), preview (Home) dan sample supaya setiap satu
/// dikendalikan dengan selamat & jujur.
class SuggestionActionController extends StateNotifier<SuggestionActionState> {
  SuggestionActionController(this._ref)
      : super(const SuggestionActionState());

  final Ref _ref;

  String get _uid => _ref.read(authRepositoryProvider).currentUser?.uid ?? '';

  // ---------- Titik masuk ----------

  /// Dari Spin: sesi pelayan sebenar (sessionId + suggestionId).
  void beginFromSpin(
    PlaceSummary place, {
    String? suggestionId,
    String? sessionId,
    String? source,
    List<PlaceSummary> alternatives = const [],
    String? mood,
    int? radiusMeters,
    String? contextHash,
  }) {
    final ctx = _ref.read(makanManaUserContextProvider);
    state = SuggestionActionState(
      place: place,
      origin: SuggestionOrigin.spin,
      suggestionId: suggestionId,
      sessionId: sessionId,
      source: source ?? place.source,
      isSample: place.isSample,
      alternatives: alternatives,
      shownPlaceIds: [place.placeId],
      mood: mood ?? ctx.selectedMood,
      radiusMeters: radiusMeters ?? ctx.effectiveRadiusMeters,
      rankPosition: 1,
      candidateCount: alternatives.length + 1,
      contextHash: contextHash,
    );
    _ref.read(currentSuggestionProvider.notifier).state = place;
  }

  /// Dari Home AI Pick (mode preview). Mungkin tiada suggestionId/sessionId.
  void beginFromPreview(
    PlaceSummary place, {
    List<PlaceSummary> alternatives = const [],
    String? source,
    String? sessionId,
    bool isSample = false,
    String? mood,
    int? radiusMeters,
  }) {
    final ctx = _ref.read(makanManaUserContextProvider);
    final sample = isSample || place.isSample;
    state = SuggestionActionState(
      place: place,
      origin: sample ? SuggestionOrigin.sample : SuggestionOrigin.preview,
      source: source ?? place.source,
      isSample: sample,
      alternatives: alternatives,
      sessionId: sessionId,
      shownPlaceIds: [place.placeId],
      mood: mood ?? ctx.selectedMood,
      radiusMeters: radiusMeters ?? ctx.effectiveRadiusMeters,
      rankPosition: 1,
      candidateCount: alternatives.length + 1,
    );
    _ref.read(currentSuggestionProvider.notifier).state = place;
  }

  /// Laluan generik (nearby / explore / meal plan) — tempat tunggal tanpa sesi.
  /// Digunakan juga oleh Suggestion Screen untuk menyegerak jika keadaan basi.
  void beginFromPlace(PlaceSummary place, {String? source}) {
    final ctx = _ref.read(makanManaUserContextProvider);
    state = SuggestionActionState(
      place: place,
      origin: place.isSample ? SuggestionOrigin.sample : SuggestionOrigin.nearby,
      source: source ?? place.source,
      isSample: place.isSample,
      shownPlaceIds: [place.placeId],
      mood: ctx.selectedMood,
      radiusMeters: ctx.effectiveRadiusMeters,
      rankPosition: 1,
      candidateCount: 1,
    );
    _ref.read(currentSuggestionProvider.notifier).state = place;
  }

  // ---------- Accept ----------

  /// Terima cadangan. Pulangkan true jika berjaya diproses.
  /// Sample TIDAK boleh melalui laluan ini — gunakan [logSampleManually].
  Future<bool> accept() async {
    final s = state;
    final place = s.place;
    if (place == null || s.processing || s.accepted) return false;
    if (s.isSample) return false; // dikendali secara manual sahaja
    state = s.copyWith(processing: true);
    try {
      if (s.isSpin) {
        // Laluan spin sedia ada (teruji): submitFeedback accept ->
        // meal + status accepted + feed, atau fallback tempatan.
        await _ref.read(spinControllerProvider).accept(place);
      } else {
        // Preview / nearby (tempat sebenar): accept sebenar TANPA had spin
        // (submitFeedback tidak sentuh kuota). Pelayan cipta meal + feed;
        // status hanya dikemas kini jika suggestionId wujud.
        final ok = await _ref.read(cloudSuggestionServiceProvider).submitFeedback(
              action: 'accept',
              suggestionId: s.suggestionId,
              placeId: place.placeId,
              sessionId: s.sessionId,
              place: place,
              source: s.source,
              mood: s.mood,
              radiusMeters: s.radiusMeters,
              matchScore: place.matchScore,
              negativeSignals: place.negativeSignals,
              metadata: {
                'sourceScreen': 'suggestion_screen',
                'origin': s.origin.name,
                if (s.rankPosition != null) 'rankPosition': s.rankPosition,
                if (s.candidateCount != null)
                  'candidateCount': s.candidateCount,
                'isSample': false,
              },
            );
        if (!ok) {
          // Firebase belum sedia: rekod meal tempatan supaya History
          // tetap dikemas kini (sekali sahaja).
          await _addLocalMeal(place, source: 'preview_accept');
          _ref.read(eventLoggerProvider).logMealLogged(
                source: 'preview_accept',
                placeId: place.placeId,
                placeNameSnapshot: place.name,
                sourceMode: SourceMode.preview,
                fromSuggestion: true,
              );
        }
      }
      state = state.copyWith(
        processing: false,
        accepted: true,
        acceptedPlaceId: place.placeId,
      );
      // Prompt 9: kemas kini Food Memory (throttled, fire-and-forget).
      _ref.read(userBrainServiceProvider).recalculate();
      return true;
    } catch (e) {
      debugPrint('MakanMana: accept gagal: $e');
      state = state.copyWith(processing: false);
      return false;
    }
  }

  /// Sample/mock: log manual sahaja (BUKAN accept sebenar, tiada latihan AI,
  /// tiada status suggestion, tiada feed).
  Future<bool> logSampleManually() async {
    final s = state;
    final place = s.place;
    if (place == null || s.processing || s.accepted) return false;
    state = s.copyWith(processing: true);
    try {
      await _addLocalMeal(place, source: 'sample_manual_log');
      final logger = _ref.read(eventLoggerProvider);
      // Sample: log tindakan manual eksplisit + meal (ditanda isSample) —
      // BUKAN accept sebenar, tidak melatih AI Brain sebagai pilihan hidup.
      logger.logEvent(
        EventType.sampleManualLog,
        placeId: place.placeId,
        placeNameSnapshot: place.name,
        sourceScreen: SourceScreen.suggestion,
        sourceMode: SourceMode.sample,
        resultSource: s.source,
        isSample: true,
      );
      logger.logMealLogged(
        source: 'sample_manual_log',
        placeId: place.placeId,
        placeNameSnapshot: place.name,
        sourceMode: SourceMode.sample,
        fromSuggestion: true,
        isSample: true,
      );
      state = state.copyWith(
        processing: false,
        accepted: true,
        acceptedPlaceId: place.placeId,
      );
      return true;
    } catch (e) {
      debugPrint('MakanMana: sample manual log gagal: $e');
      state = state.copyWith(processing: false);
      return false;
    }
  }

  // ---------- Reject / Next ----------

  /// Tolak dengan [reasonId] kanonik (cth. too_far). Untuk sesi spin kohort:
  /// GUNA baris alternatif AUTHORITATIF pelayan (nextSuggestion). Selainnya:
  /// alternatif tempatan (offline-safe). TIDAK panggil getSuggestions semula.
  Future<void> rejectWithReason(String reasonId) async {
    final s = state;
    final place = s.place;
    if (place == null) return;

    // Phase 2.2D — jejak runtime (debug sahaja) untuk bukti peranti sebenar:
    // dedah SAMA ADA laluan authoritative pelayan atau fallback tempatan diambil.
    debugPrint('MM-A2 reject: isSpin=${s.isSpin} '
        'contextHash=${s.contextHash == null ? "NULL" : "SET(${s.contextHash!.length})"} '
        'reason=$reasonId place=${place.placeId}');

    // Phase 2.2D — Reject/Next AUTHORITATIF (kohort): server consume alternatif
    // seterusnya (TIADA search/rank/provider). Guard double-tap; fallback tempatan
    // bila offline / bukan kohort / gagal. Klien TIDAK hantar array authoritative.
    if (s.isSpin && s.contextHash != null) {
      if (s.processing) return; // guard double-tap (advance sekali sahaja)
      state = s.copyWith(processing: true);
      final actionId =
          '${DateTime.now().microsecondsSinceEpoch}_${place.placeId}';
      final res = await _ref.read(cloudSuggestionServiceProvider).nextSuggestion(
            action: 'reject',
            contextHash: s.contextHash!,
            actionId: actionId,
            sessionId: s.sessionId,
            placeId: place.placeId,
            reason: reasonId,
          );
      debugPrint('MM-A2 reject.server: actionId=$actionId '
          'responseSource=${res?['responseSource']} '
          'providerQueryCount=${res?['providerQueryCount']} '
          'rankingExecuted=${res?['rankingExecuted']} '
          'alternativesRemaining=${res?['alternativesRemaining']} '
          'poolExhausted=${res?['poolExhausted']} '
          'nextPlace=${(res?['nextPlace'] is Map) ? (res!['nextPlace'] as Map)['placeId'] : null}');
      // Phase 2.4A — log suggestion_reject event supaya AI Brain BELAJAR sebab
      // reject (too_far→jarak, too_expensive→bajet). Sebelum ini laluan reject
      // AUTHORITATIF hanya tulis reject-memory pelayan, TIADA event → brain tak
      // belajar sebab reject. Defek wiring diperbaiki.
      if (res != null && res['actionAccepted'] == true) {
        _ref.read(eventLoggerProvider).logEvent(
              EventType.suggestionReject,
              placeId: place.placeId,
              placeNameSnapshot: place.name,
              sessionId: s.sessionId,
              suggestionId: s.suggestionId,
              sourceScreen: SourceScreen.suggestion,
              sourceMode: SourceMode.spin,
              matchScore: place.matchScore.toDouble(),
              metadata: {
                'reason': reasonId,
                'distanceKm': place.distanceKm,
                'origin': s.origin.name,
                'authoritative': true,
              },
            );
      }
      final nextMap = res?['nextPlace'];
      if (res != null && res['actionAccepted'] == true && nextMap is Map) {
        final next =
            PlaceSummary.fromMap(Map<String, dynamic>.from(nextMap));
        state = s.copyWith(
          place: next,
          processing: false,
          suggestionId: null,
          rejectedPlaceIds: [...s.rejectedPlaceIds, place.placeId],
          shownPlaceIds: [...s.shownPlaceIds, next.placeId],
          accepted: false,
          noMore: false,
          rejectError: false,
        );
        _ref.read(currentSuggestionProvider.notifier).state = next;
        _ref.read(userBrainServiceProvider).recalculate();
        return;
      }
      if (res != null && res['poolExhausted'] == true) {
        state = s.copyWith(
          processing: false,
          rejectedPlaceIds: [...s.rejectedPlaceIds, place.placeId],
          noMore: true,
          rejectError: false,
        );
        return;
      }
      // SESI ALGORITHM 2: laluan authoritative gagal SEMENTARA (rangkaian/pelayan)
      // atau ditolak server (cth. legacy_local). JANGAN jatuh ke fallback tempatan /
      // dummy dalam sesi Algorithm 2 (locked E.8/E.9/F). Kekalkan kad semasa +
      // papar keadaan "cuba lagi" JUJUR; pengguna boleh Reject semula.
      debugPrint('MM-A2 reject: ALGO2 authoritative gagal — RETRY state '
          '(TIADA dummy/local fallback dalam sesi Algorithm 2). '
          'responseSource=${res?['responseSource']}');
      state = s.copyWith(processing: false, rejectError: true);
      return;
    }

    if (s.isSpin) {
      // LEGASI sahaja (contextHash == null): fallback tempatan teruji (offline-safe).
      debugPrint('MM-A2 reject: FALLBACK TEMPATAN (spinController.reject) '
          '— sesi legasi (contextHash null)');
      // Laluan spin sedia ada (teruji): submitFeedback reject + calon Google
      // seterusnya dalam sesi sama. spinController kemas kini currentSuggestion.
      final next = await _ref.read(spinControllerProvider).reject(place, reasonId);
      state = s.copyWith(
        place: next,
        suggestionId: null, // calon seterusnya belum ada id pelayan sendiri
        rejectedPlaceIds: [...s.rejectedPlaceIds, place.placeId],
        shownPlaceIds: [...s.shownPlaceIds, next.placeId],
        accepted: false,
        noMore: false,
      );
      // Prompt 9: reject sebenar = isyarat kuat -> kemas kini Food Memory.
      _ref.read(userBrainServiceProvider).recalculate();
      return;
    }

    // Preview / nearby / sample: hanya alternatif tempatan. Tiada kuota.
    final rejected = [...s.rejectedPlaceIds, place.placeId];
    final isPreview = s.origin == SuggestionOrigin.preview;
    if (!s.isSample) {
      // Skip ringan (bukan reject cadangan sebenar kerana tiada suggestionId).
      _ref.read(eventLoggerProvider).logEvent(
            EventType.suggestionSkipped,
            placeId: place.placeId,
            placeNameSnapshot: place.name,
            sessionId: s.sessionId,
            sourceScreen: SourceScreen.suggestion,
            sourceMode: isPreview ? SourceMode.preview : SourceMode.manual,
            resultSource: s.source,
            isPreview: isPreview,
            metadata: {
              'reason': reasonId,
              'origin': s.origin.name,
              'noSuggestionId': s.suggestionId == null,
            },
          );
    }
    final next = _nextLocalAlternative(rejected, s.shownPlaceIds);
    if (next == null) {
      state = s.copyWith(rejectedPlaceIds: rejected, noMore: true);
      _ref.read(eventLoggerProvider).logNoMoreSuggestions(
            sessionId: s.sessionId,
            sourceMode: s.isSample
                ? SourceMode.sample
                : (isPreview ? SourceMode.preview : SourceMode.manual),
          );
      return;
    }
    state = s.copyWith(
      place: next,
      rejectedPlaceIds: rejected,
      shownPlaceIds: [...s.shownPlaceIds, next.placeId],
      rankPosition: (s.rankPosition ?? 1) + 1,
      noMore: false,
      accepted: false,
    );
    _ref.read(currentSuggestionProvider.notifier).state = next;
  }

  PlaceSummary? _nextLocalAlternative(
      List<String> rejected, List<String> shown) {
    for (final p in state.alternatives) {
      if (!rejected.contains(p.placeId) && !shown.contains(p.placeId)) {
        return p;
      }
    }
    // Jika semua sudah dipapar tapi belum ditolak, benarkan ulang.
    for (final p in state.alternatives) {
      if (!rejected.contains(p.placeId)) return p;
    }
    return null;
  }

  // ---------- Pembantu ----------

  Future<void> _addLocalMeal(PlaceSummary place,
      {required String source}) async {
    final now = DateTime.now();
    await _ref.read(mealRepositoryProvider).addMeal(
          _uid,
          Meal(
            placeId: place.placeId,
            placeNameSnapshot: place.name,
            cuisine: place.cuisine,
            emoji: place.emoji,
            timeSlot: TimeSlotUtils.forHour(now.hour),
            mealTime: now,
            source: source,
            // Sample tidak menyumbang skor padanan sebenar.
            matchScore: place.isSample ? null : place.matchScore,
            priceLevel: place.priceLevel,
            priceEstimate: place.priceEstimate,
          ),
        );
  }

}
