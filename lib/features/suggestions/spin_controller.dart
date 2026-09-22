import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/providers/location_context_provider.dart';
import '../../core/providers/makanmana_user_context_provider.dart';
import '../../core/utils/time_slot_utils.dart';
import '../../models/event_log.dart';
import '../../models/meal.dart';
import '../../models/place_summary.dart';
import '../../models/suggestion_record.dart';

/// Hasil satu percubaan spin.
class SpinOutcome {
  const SpinOutcome.blocked()
      : blocked = true,
        place = null,
        emptyArea = false,
        unavailable = false;

  const SpinOutcome.success(this.place)
      : blocked = false,
        emptyArea = false,
        unavailable = false;

  /// WAVE 4A — kawasan ini benar-benar tiada restoran yang ngam.
  const SpinOutcome.emptyArea()
      : blocked = false,
        place = null,
        emptyArea = true,
        unavailable = false;

  /// WAVE 4A — perkhidmatan cadangan tidak dapat dilayan. Dahulu laluan ini
  /// memutar sepuluh restoran REKAAN dan merekodkannya sebagai cadangan.
  const SpinOutcome.unavailable()
      : blocked = false,
        place = null,
        emptyArea = false,
        unavailable = true;

  final bool blocked;
  final PlaceSummary? place;
  final bool emptyArea;
  final bool unavailable;

  bool get hasNoSuggestion => emptyArea || unavailable;
}

/// Orkestrasi spin Milestone 2 (client-side, data dummy):
/// had harian -> sesi -> calon -> rekod suggestion -> events.
/// Milestone 3 akan pindahkan logik ini ke Cloud Function getSuggestions.
class SpinController {
  SpinController(this._ref);

  final Ref _ref;
  final _random = Random();

  String? _sessionId;
  final List<String> _shownPlaceIds = [];
  final List<String> _rejectedPlaceIds = [];
  String? _currentSuggestionId;

  /// true jika sesi semasa diuruskan oleh Cloud Function (Milestone 3).
  bool _remoteSession = false;

  /// Calon dari pelayan (tempat Google sebenar) untuk reject-chain.
  List<PlaceSummary> _remoteCandidates = [];

  /// Phase 2.2D — contextHash opaque (kohort) untuk Reject/Next authoritative.
  String? _contextHash;
  String? get contextHash => _contextHash;

  /// Getter awam untuk SuggestionActionController (Prompt 7): baca id sesi
  /// spin semasa supaya skrin cadangan boleh kekalkan sessionId/suggestionId.
  String? get sessionId => _sessionId;
  String? get currentSuggestionId => _currentSuggestionId;
  bool get isRemoteSession => _remoteSession;
  List<PlaceSummary> get remoteCandidates =>
      List<PlaceSummary>.unmodifiable(_remoteCandidates);

  String get _uid =>
      _ref.read(authRepositoryProvider).currentUser?.uid ?? '';
  String get _plan => _ref.read(userPlanProvider).valueOrNull ?? 'free';
  String get _language =>
      _ref.read(languageProvider).languageCode;

  EventLog _event(
    String type, {
    PlaceSummary? place,
    String? mood,
    Map<String, dynamic> metadata = const {},
  }) =>
      EventLog(
        userId: _uid,
        eventType: type,
        timeSlot: TimeSlotUtils.now(),
        languageCode: _language,
        plan: _plan,
        placeId: place?.placeId,
        suggestionId: _currentSuggestionId,
        sessionId: _sessionId,
        mood: mood,
        metadata: metadata,
      );

  Future<void> logAppEvent(String type) =>
      _ref.read(eventRepositoryProvider).log(_event(type));

  /// Cuba spin. Pulangkan blocked jika had percuma habis.
  /// Cuba Cloud Function dahulu (pelayan = penguat kuasa sebenar);
  /// fallback ke logik tempatan jika Functions belum sedia.
  Future<SpinOutcome> spin({String? mood}) async {
    // LOCATION CONSISTENCY HOTFIX — lokasi dari konteks AUTHORITATIF yang SAMA
    // dengan Home & Explore (provider menyelesaikan GPS + kemas kini Core Spine).
    // Menggantikan getPosition langsung supaya Spin, Home & Explore konsisten.
    final loc = await _ref.read(locationContextProvider.future);
    // Prompt 6: payload PENUH dari MakanManaUserContext (mood, radius,
    // budget, diet, allergy, cuisine, food memory) — sama seperti Home.
    // buildSuggestionRequestBase sudah mengandungi lat/lng/radius dari konteks
    // (dikemas kini oleh locationContextProvider), jadi konsisten dengan Home.
    final payload = _ref
        .read(makanManaUserContextProvider)
        .buildSuggestionRequestBase();
    payload['languageCode'] = _language;
    if (mood != null) payload['selectedMood'] = mood;
    if (loc.hasLocation) {
      payload['lat'] = loc.lat;
      payload['lng'] = loc.lng;
    }
    debugPrint('MM-LOC spin: lat=${loc.maskedLatLng()} '
        'radiusM=${loc.radiusMeters} cell=${loc.locationGrid} src=${loc.source}');
    final remote = await _ref
        .read(cloudSuggestionServiceProvider)
        .getSuggestions(payload: payload, mode: 'spin');
    if (remote != null) {
      if (remote.paywallRequired) return const SpinOutcome.blocked();
      // WAVE 4A — pelayan menjawab dengan JUJUR: tiada hasil, atau pembekal
      // tidak tersedia. Klien TIDAK menggantikannya dengan restoran rekaan.
      if (remote.hasNoSuggestion) {
        _remoteSession = false;
        _remoteCandidates = const [];
        return remote.isEmptyArea
            ? const SpinOutcome.emptyArea()
            : const SpinOutcome.unavailable();
      }
      _remoteSession = true;
      _sessionId = remote.sessionId;
      _currentSuggestionId = remote.suggestionId;
      _remoteCandidates = remote.candidates;
      _contextHash = remote.contextHash;
      // Phase 2.2D — jejak: sahkan contextHash authoritative diterima dari server.
      debugPrint('MM-A2 spin.remote: contextHash='
          '${remote.contextHash == null ? "NULL" : "SET(${remote.contextHash!.length})"} '
          'candidates=${remote.candidates.length} source=${remote.source}');
      _shownPlaceIds
        ..clear()
        ..add(remote.place!.placeId);
      _rejectedPlaceIds.clear();
      _ref.read(currentSuggestionProvider.notifier).state = remote.place;
      return SpinOutcome.success(remote.place);
    }

    // ---- WAVE 4A: Functions tidak tersedia ----
    // Dahulu: spin tempatan atas sepuluh restoran REKAAN, direkod sebagai
    // cadangan sebenar dan boleh dibuka dalam Google Maps. Kini kegagalan
    // dilaporkan dengan jujur: tiada kuota digunakan, tiada rekod dicipta.
    _remoteSession = false;
    _remoteCandidates = const [];
    final events = _ref.read(eventRepositoryProvider);
    await events.log(_event('spin_started', mood: mood));
    return const SpinOutcome.unavailable();
  }

  /// Terima cadangan: rekod meal + kemas kini status + event.
  Future<void> accept(PlaceSummary place) async {
    if (_remoteSession) {
      // Pelayan uruskan meal + status + event dalam satu panggilan.
      final ok = await _ref.read(cloudSuggestionServiceProvider).submitFeedback(
            action: 'accept',
            suggestionId: _currentSuggestionId,
            placeId: place.placeId,
            sessionId: _sessionId,
            place: place,
          );
      if (ok) {
        _sessionId = null;
        return;
      }
      // Jatuh ke laluan tempatan jika pelayan tidak sampai.
    }
    final now = DateTime.now();
    await _ref.read(suggestionRepositoryProvider).updateStatus(
          _uid,
          _currentSuggestionId ?? '',
          status: 'accepted',
        );
    await _ref.read(mealRepositoryProvider).addMeal(
          _uid,
          Meal(
            placeId: place.placeId,
            placeNameSnapshot: place.name,
            cuisine: place.cuisine,
            emoji: place.emoji,
            timeSlot: TimeSlotUtils.forHour(now.hour),
            mealTime: now,
            matchScore: place.matchScore,
            priceLevel: place.priceLevel,
            priceEstimate: place.priceEstimate,
          ),
        );
    await _ref.read(eventRepositoryProvider).log(
          _event('suggestion_accept', place: place),
        );
    _ref.read(eventLoggerProvider).logMealLogged(
          source: 'suggestion',
          placeId: place.placeId,
          placeNameSnapshot: place.name,
          sourceMode: 'spin',
          fromSuggestion: true,
        );
    await _updateSession(finalAction: 'accept', acceptedPlaceId: place.placeId);
    _sessionId = null; // sesi tamat
  }

  /// Tolak dengan sebab. Calon baru dipaparkan SERTA-MERTA (optimistic);
  /// log AI Brain berjalan di belakang tabir supaya UI tidak menunggu.
  /// WAVE 4A: memulangkan null bila tiada calon SEBENAR yang tinggal. Dahulu
  /// laluan ini beralih kepada restoran rekaan dan merekodkannya.
  Future<PlaceSummary?> reject(PlaceSummary place, String reasonKey) async {
    _rejectedPlaceIds.add(place.placeId);
    final rejectedSuggestionId = _currentSuggestionId;
    final wasRemote = _remoteSession;

    final next = _pickCandidate(excludePlaceId: place.placeId);
    _ref.read(currentSuggestionProvider.notifier).state = next;

    unawaited(() async {
      if (wasRemote) {
        // Pelayan kemas kini status + sesi + event reject.
        final ok =
            await _ref.read(cloudSuggestionServiceProvider).submitFeedback(
                  action: 'reject',
                  suggestionId: rejectedSuggestionId,
                  placeId: place.placeId,
                  sessionId: _sessionId,
                  reason: reasonKey,
                  place: place,
                );
        if (ok) {
          // Calon seterusnya direkod secara tempatan (dibenarkan rules).
          if (next != null) await _recordShown(next);
          return;
        }
      }
      await _ref.read(suggestionRepositoryProvider).updateStatus(
            _uid,
            rejectedSuggestionId ?? '',
            status: 'rejected',
            reason: reasonKey,
          );
      await _ref.read(eventRepositoryProvider).log(
            _event('suggestion_reject',
                place: place, metadata: {'reason': reasonKey}),
          );
      if (next != null) await _recordShown(next);
    }());

    return next;
  }

  /// Calon seterusnya daripada sesi pelayan. WAVE 4A: null bila tiada calon
  /// sebenar — tiada lagi kolam rekaan tempatan.
  PlaceSummary? _pickCandidate({String? excludePlaceId}) {
    if (!_remoteSession || _remoteCandidates.length <= 1) return null;
    final all = _remoteCandidates
        .where((p) => p.isOpen && p.placeId != excludePlaceId)
        .toList();
    if (all.isEmpty) return null;
    final fresh = all
        .where((p) =>
            !_rejectedPlaceIds.contains(p.placeId) &&
            !_shownPlaceIds.contains(p.placeId))
        .toList();
    final pool = fresh.isNotEmpty
        ? fresh
        : all.where((p) => !_rejectedPlaceIds.contains(p.placeId)).toList();
    final safePool = pool.isNotEmpty ? pool : all;
    return safePool[_random.nextInt(safePool.length)];
  }

  Future<void> _recordShown(PlaceSummary place, {String? mood}) async {
    _shownPlaceIds.add(place.placeId);
    _currentSuggestionId =
        'sug_${DateTime.now().millisecondsSinceEpoch}';
    await _ref.read(suggestionRepositoryProvider).saveSuggestion(
          _uid,
          SuggestionRecord(
            suggestionId: _currentSuggestionId!,
            placeId: place.placeId,
            sessionId: _sessionId ?? '',
            status: 'shown',
            matchScore: place.matchScore,
            timeSlot: TimeSlotUtils.now(),
            distanceKm: place.distanceKm,
            priceEstimate: place.priceEstimate,
            matchReasons: place.matchReasonKeys,
          ),
        );
    await _updateSession();
    await _ref.read(eventRepositoryProvider).log(
          _event(
            'suggestion_shown',
            place: place,
            mood: mood,
            // NET-01: tanda sample supaya AI Brain tidak anggap ia live.
            metadata: place.isSample
                ? {'isSample': true, 'source': place.source}
                : const {},
          ),
        );
  }

  Future<void> _updateSession({
    String? finalAction,
    String? acceptedPlaceId,
  }) async {
    if (_sessionId == null) return;
    await _ref.read(suggestionRepositoryProvider).upsertSession(_sessionId!, {
      'userId': _uid,
      'shownPlaceIds': _shownPlaceIds,
      'rejectedPlaceIds': _rejectedPlaceIds,
      if (acceptedPlaceId != null) 'acceptedPlaceId': acceptedPlaceId,
      if (finalAction != null) 'finalAction': finalAction,
      'timeSlot': TimeSlotUtils.now(),
    });
  }
}
