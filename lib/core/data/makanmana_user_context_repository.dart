import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../models/makanmana_user_context.dart';

/// Repositori Core Spine: memuatkan & menyimpan konteks pengguna dengan
/// pembacaan Firestore yang selamat (dokumen hilang/separa tidak crash).
///
/// Ia TIDAK menyentuh enjin cadangan. Ia hanya membaca isyarat sedia ada
/// dan menulis semula medan kanonik.
class MakanManaUserContextRepository {
  MakanManaUserContextRepository({required this.firebaseReady});

  final bool firebaseReady;

  FirebaseFirestore get _db => FirebaseFirestore.instance;

  // ---------------- Penghidrat (hydrate) ----------------

  /// Muatkan semua isyarat konteks untuk [uid], bermula dari [base]
  /// (yang membawa nilai sesi seperti mood/bahasa/tema dari provider).
  Future<MakanManaUserContext> hydrate({
    required String uid,
    required MakanManaUserContext base,
  }) async {
    if (!firebaseReady || uid.isEmpty) {
      return base.copyWith(
        loadStatus: ContextLoadStatus.ready,
        loadedUid: uid,
        uid: uid,
      );
    }

    try {
      final results = await Future.wait<Object?>([
        _getDoc('users', uid),
        _getDoc('user_profiles', uid),
        _getDoc('user_brain_profiles', uid),
        _getDoc('fitness_profiles', uid),
        _getDoc('sport_preferences', uid),
        _getDoc('budget_profiles', uid),
        _getRecentMeals(uid),
      ]).timeout(const Duration(seconds: 10));

      final user = results[0] as Map<String, dynamic>? ?? const {};
      final profile = results[1] as Map<String, dynamic>? ?? const {};
      final brain = results[2] as Map<String, dynamic>? ?? const {};
      final fitness = results[3] as Map<String, dynamic>? ?? const {};
      final sport = results[4] as Map<String, dynamic>? ?? const {};
      final budget = results[5] as Map<String, dynamic>? ?? const {};
      final meals =
          results[6] as List<Map<String, dynamic>>? ?? const [];

      final mealSummary = _summariseMeals(meals);

      return base.copyWith(
        loadStatus: ContextLoadStatus.ready,
        loadedUid: uid,
        uid: uid,
        // A. Identiti
        email: _str(user['email']) ?? base.email,
        displayName: _str(user['displayName']) ?? base.displayName,
        plan: _oneOf(_str(user['plan']), ContextDefaults.allowedPlans,
            ContextDefaults.plan),
        role: _oneOf(_str(user['role']), ContextDefaults.allowedRoles,
            ContextDefaults.role),
        languageCode: _oneOf(
            _str(user['language']) ?? _str(user['languageCode']),
            ContextDefaults.allowedLanguages,
            base.languageCode),
        createdAt: _date(user['createdAt']),
        updatedAt: _date(user['updatedAt']),
        // B. Lokasi & radius (radius disimpan KM)
        defaultRadiusKm:
            _dbl(profile['defaultRadiusKm']) ?? base.defaultRadiusKm,
        selectedRadiusKm:
            _dbl(profile['defaultRadiusKm']) ?? base.selectedRadiusKm,
        preferredNearbyDistanceKm: _dbl(profile['preferredNearbyDistanceKm']) ??
            base.preferredNearbyDistanceKm,
        maxTravelDistanceKm: _dbl(profile['maxTravelDistanceKm']) ??
            base.maxTravelDistanceKm,
        // C. Profil Makanan
        dietType: _str(profile['dietType']) ?? base.dietType,
        halalPreference: _boolOr(profile['halalPreference'], base.halalPreference),
        allergies: _strList(profile['allergies']),
        budgetMin: _int(profile['budgetMin']) ?? base.budgetMin,
        budgetMax: _int(profile['budgetMax']) ?? base.budgetMax,
        favoriteCuisines: _favCuisines(profile),
        spicyPreference:
            _int(profile['spicyPreference']) ?? base.spicyPreference,
        usualMealTimes: _strList(profile['usualMealTimes'],
            fallback: base.usualMealTimes),
        dislikedFoods: _strList(profile['dislikedFoods']),
        preferredMealTypes: _strList(profile['preferredMealTypes']),
        drinkPreference: _str(profile['drinkPreference']),
        sweetDrinkHabit: _str(profile['sweetDrinkHabit']),
        // H. Pro / Diet Goal
        dietGoal: _str(profile['dietGoal']) ?? base.dietGoal,
        healthGoal:
            _str(profile['healthGoal']) ?? _str(fitness['mainGoal']),
        // F. Food Memory (utamakan user_brain_profiles jika ada).
        // topCuisines/avoidedCuisines/commonRejectReasons kini MAP
        // (nama->skor/kiraan) dari recalculateUserBrain; sokong juga
        // format List lama (backward compatible).
        topCuisines: _keysByValueDesc(brain['topCuisines']).isNotEmpty
            ? _keysByValueDesc(brain['topCuisines'])
            : mealSummary.topCuisines,
        avoidedCuisines: _keysByValueDesc(brain['avoidedCuisines']),
        preferredPriceLevel: _int(brain['preferredPriceLevel']),
        preferredDistanceKm: _dbl(brain['preferredDistanceKm']) ??
            base.preferredNearbyDistanceKm,
        commonRejectReasons: _keysByValueDesc(brain['commonRejectReasons']),
        repeatTolerance:
            _dbl(brain['repeatTolerance']) ?? base.repeatTolerance,
        explorationLevel:
            _dbl(brain['explorationLevel']) ?? base.explorationLevel,
        healthyPreference: _dbl(brain['healthyPreference']),
        heavyFoodFrequency: _dbl(brain['heavyFoodFrequency']),
        acceptRate: _dbl(brain['acceptRate']),
        rejectRate: _dbl(brain['rejectRate']),
        lastFoodMemoryUpdatedAt: _date(brain['lastUpdatedAt']),
        foodMemorySummary: brain.isEmpty ? null : brain,
        // G. Sejarah makan
        lastMeals: mealSummary.lastMeals,
        lastMealAt: mealSummary.lastMealAt,
        recentCuisineTags: mealSummary.recentCuisineTags,
        recentHealthTags: mealSummary.recentHealthTags,
        recentPlaceIds: mealSummary.recentPlaceIds,
        // I. Fit / Sport bridge
        fitGoal: _str(fitness['mainGoal']) ?? base.fitGoal,
        sportMood: _str(fitness['selectedSportMood']) ??
            _str(sport['primarySportGoal']) ??
            base.sportMood,
        stepTarget: _int(fitness['stepTarget']) ?? base.stepTarget,
        calorieTarget: _int(fitness['calorieTarget']),
        proteinTarget: _int(fitness['proteinTarget']),
        carbsTarget: _int(fitness['carbsTarget']),
        fatTarget: _int(fitness['fatTarget']),
        // J. Bajet
        dailyBudget: _dbl(budget['dailyBudget']),
        weeklyBudget: _dbl(budget['weeklyBudget']),
        monthlyBudget: _dbl(budget['monthlyBudget']),
        budgetMode: _str(budget['budgetMode']) ?? base.budgetMode,
        averageMealSpend: _dbl(budget['averageMealSpend']),
      );
    } on TimeoutException {
      debugPrint('MakanMana context: hydrate timeout, guna lalai selamat.');
      return base.copyWith(
        loadStatus: ContextLoadStatus.ready,
        loadedUid: uid,
        uid: uid,
      );
    } catch (e) {
      debugPrint('MakanMana context: hydrate gagal: $e');
      return base.copyWith(
        loadStatus: ContextLoadStatus.error,
        loadedUid: uid,
        uid: uid,
        lastError: '$e',
      );
    }
  }

  // ---------------- Penulis (safe writes) ----------------

  Future<void> writeUserFields(String uid, Map<String, dynamic> data) =>
      _safeSet('users', uid, {...data, 'updatedAt': FieldValue.serverTimestamp()});

  Future<void> writeProfileFields(String uid, Map<String, dynamic> data) =>
      _safeSet('user_profiles', uid,
          {...data, 'updatedAt': FieldValue.serverTimestamp()});

  Future<void> writeLanguage(String uid, String code) =>
      writeUserFields(uid, {'language': code, 'languageCode': code});

  Future<void> writeUiPreferences(String uid, Map<String, dynamic> prefs) =>
      writeUserFields(uid, {'uiPreferences': prefs});

  Future<void> writeDietGoal(String uid, String goal) =>
      writeProfileFields(uid, {'dietGoal': goal});

  /// Jambatan Fit: tulis merge tanpa memusnahkan data Fit sedia ada.
  Future<void> writeFitGoal(String uid, String goal) =>
      _safeSet('fitness_profiles', uid, {
        'mainGoal': goal,
        'updatedAt': FieldValue.serverTimestamp(),
      });

  Future<void> writeSportMood(String uid, String moodId) =>
      _safeSet('sport_preferences', uid, {
        'primarySportGoal': moodId,
        'selectedSportMoods': FieldValue.arrayUnion([moodId]),
        'updatedAt': FieldValue.serverTimestamp(),
      });

  // ---------------- Dalaman ----------------

  Future<Map<String, dynamic>?> _getDoc(String col, String uid) async {
    try {
      final snap = await _db.collection(col).doc(uid).get();
      return snap.data();
    } catch (e) {
      debugPrint('MakanMana context: baca $col gagal: $e');
      return null;
    }
  }

  Future<List<Map<String, dynamic>>> _getRecentMeals(String uid) async {
    try {
      final snap = await _db
          .collection('users')
          .doc(uid)
          .collection('meals')
          .orderBy('mealTime', descending: true)
          .limit(8)
          .get();
      return snap.docs.map((d) => d.data()).toList();
    } catch (e) {
      debugPrint('MakanMana context: baca meals gagal: $e');
      return const [];
    }
  }

  Future<void> _safeSet(
      String col, String uid, Map<String, dynamic> data) async {
    if (!firebaseReady || uid.isEmpty) return;
    try {
      await _db
          .collection(col)
          .doc(uid)
          .set(data, SetOptions(merge: true))
          .timeout(const Duration(seconds: 8));
    } on TimeoutException {
      debugPrint('MakanMana context: tulis $col beratur (offline queue).');
    } catch (e) {
      debugPrint('MakanMana context: tulis $col gagal: $e');
    }
  }

  _MealSummary _summariseMeals(List<Map<String, dynamic>> meals) {
    final cuisineCount = <String, int>{};
    final recentCuisines = <String>[];
    final recentHealth = <String>[];
    final recentPlaceIds = <String>[];
    final lastMeals = <Map<String, dynamic>>[];
    DateTime? lastMealAt;

    for (final m in meals) {
      // cuisine singular ATAU cuisineTags jamak — kendali kedua-dua.
      final cuisine = _str(m['cuisine']);
      final cuisineTags = _strList(m['cuisineTags']);
      final placeId = _str(m['placeId']);
      final tags = [
        ..._strList(m['tags']),
        ..._strList(m['healthTags']),
      ];
      if (cuisine != null && cuisine.isNotEmpty) {
        recentCuisines.add(cuisine);
        cuisineCount[cuisine] = (cuisineCount[cuisine] ?? 0) + 1;
      }
      for (final c in cuisineTags) {
        recentCuisines.add(c);
        cuisineCount[c] = (cuisineCount[c] ?? 0) + 1;
      }
      recentHealth.addAll(tags);
      if (placeId != null && placeId.isNotEmpty) recentPlaceIds.add(placeId);

      final mealTime = _date(m['mealTime']);
      lastMealAt ??= mealTime;
      lastMeals.add({
        'placeId': placeId,
        'placeName': _str(m['placeNameSnapshot']),
        'cuisine': cuisine ?? (cuisineTags.isNotEmpty ? cuisineTags.first : null),
        'mealTime': mealTime?.toIso8601String(),
        'rating': _int(m['satisfactionRating']),
      });
    }

    final top = cuisineCount.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    return _MealSummary(
      lastMeals: lastMeals,
      lastMealAt: lastMealAt,
      recentCuisineTags: recentCuisines.toSet().toList(),
      recentHealthTags: recentHealth.toSet().toList(),
      recentPlaceIds: recentPlaceIds,
      topCuisines: top.take(5).map((e) => e.key).toList(),
    );
  }

  // ---------------- Penukar selamat (safe casts) ----------------

  static String? _str(Object? v) {
    if (v == null) return null;
    final s = v.toString().trim();
    return s.isEmpty ? null : s;
  }

  static int? _int(Object? v) {
    if (v is int) return v;
    if (v is num) return v.toInt();
    if (v is String) return int.tryParse(v);
    return null;
  }

  static double? _dbl(Object? v) {
    if (v is double) return v;
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v);
    return null;
  }

  static bool _boolOr(Object? v, bool fallback) {
    if (v is bool) return v;
    if (v is String) {
      if (v == 'true' || v == 'yes' || v == 'preferred') return true;
      if (v == 'false' || v == 'no') return false;
    }
    return fallback;
  }

  static List<String> _strList(Object? v, {List<String> fallback = const []}) {
    if (v is List) {
      return v.map((e) => e.toString()).where((s) => s.isNotEmpty).toList();
    }
    return fallback;
  }

  /// Peta {nama: skor/kiraan} -> senarai nama diisih menurun ikut nilai.
  /// Turut menyokong format List lama (dikembalikan seadanya).
  static List<String> _keysByValueDesc(Object? v, {int max = 10}) {
    if (v is Map) {
      final entries = v.entries
          .map((e) => MapEntry(e.key.toString(), _dbl(e.value) ?? 0))
          .where((e) => e.key.isNotEmpty)
          .toList()
        ..sort((a, b) => b.value.compareTo(a.value));
      return entries.take(max).map((e) => e.key).toList();
    }
    if (v is List) {
      return v.map((e) => e.toString()).where((s) => s.isNotEmpty).toList();
    }
    return const [];
  }

  /// Padanan alias favoriteCuisines / favouriteCuisines (union selamat).
  static List<String> _favCuisines(Map<String, dynamic> profile) {
    final a = _strList(profile['favoriteCuisines']);
    final b = _strList(profile['favouriteCuisines']);
    return {...a, ...b}.toList();
  }

  static String _oneOf(String? v, Set<String> allowed, String fallback) {
    if (v != null && allowed.contains(v)) return v;
    return fallback;
  }

  static DateTime? _date(Object? v) {
    if (v is Timestamp) return v.toDate();
    if (v is DateTime) return v;
    if (v is String) return DateTime.tryParse(v);
    return null;
  }
}

class _MealSummary {
  const _MealSummary({
    required this.lastMeals,
    required this.lastMealAt,
    required this.recentCuisineTags,
    required this.recentHealthTags,
    required this.recentPlaceIds,
    required this.topCuisines,
  });

  final List<Map<String, dynamic>> lastMeals;
  final DateTime? lastMealAt;
  final List<String> recentCuisineTags;
  final List<String> recentHealthTags;
  final List<String> recentPlaceIds;
  final List<String> topCuisines;
}
