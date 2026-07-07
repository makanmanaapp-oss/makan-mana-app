import 'dart:async';
import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../core/services/app_prefs.dart';
import '../models/meal.dart';

/// Rekod makan: users/{uid}/meals. Fallback tempatan untuk mod dev.
class MealRepository {
  MealRepository({required this.firebaseReady, required this.prefs});

  final bool firebaseReady;
  final AppPrefs prefs;

  CollectionReference<Map<String, dynamic>> _meals(String uid) =>
      FirebaseFirestore.instance
          .collection('users')
          .doc(uid)
          .collection('meals');

  Future<void> addMeal(String uid, Meal meal) async {
    if (firebaseReady && uid.isNotEmpty) {
      // Jangan tunggu ack pelayan - SDK queue dan sync sendiri.
      unawaited(_meals(uid).add({
        ...meal.toMap(),
        'createdAt': FieldValue.serverTimestamp(),
      }).then(
        (doc) {},
        onError: (Object e) => debugPrint('MakanMana: simpan meal gagal: $e'),
      ));
      return;
    }
    // Mod dev: simpan senarai JSON tempatan.
    final list = _localMeals()..insert(0, meal);
    await prefs.setMealsJson(
      jsonEncode(list.map((m) => m.toMap()).toList()),
    );
  }

  Stream<List<Meal>> watchMeals(String uid, {int limit = 50}) {
    if (firebaseReady && uid.isNotEmpty) {
      return _meals(uid)
          .orderBy('mealTime', descending: true)
          .limit(limit)
          .snapshots()
          .map((snap) => snap.docs
              .map((d) => Meal.fromMap(d.data(), id: d.id))
              .toList());
    }
    return Stream.value(_localMeals());
  }

  List<Meal> _localMeals() {
    final raw = prefs.mealsJson;
    if (raw == null) return [];
    final list = jsonDecode(raw) as List;
    return list
        .map((e) => Meal.fromMap(e as Map<String, dynamic>))
        .toList();
  }
}
