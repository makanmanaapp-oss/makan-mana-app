import 'dart:async';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';

import '../../core/utils/time_slot_utils.dart';
import '../../models/event_log.dart';
import '../../repositories/event_repository.dart';
import 'wallet_models.dart';

/// Enjin Meal Wallet (V4): log belanja, bajet, Budget Coach.
/// Corak sama V3: tulisan fire-and-forget, data owner-only.
class WalletService {
  WalletService({
    required this.firebaseReady,
    required this.uid,
    required this.plan,
    required this.languageCode,
    required EventRepository events,
  }) : _events = events;

  final bool firebaseReady;
  final String uid;
  final String plan;
  final String languageCode;
  final EventRepository _events;

  FirebaseFirestore get _db => FirebaseFirestore.instance;
  bool get _ready => firebaseReady && uid.isNotEmpty;

  static String dateKey(DateTime d) =>
      '${d.year}${d.month.toString().padLeft(2, '0')}${d.day.toString().padLeft(2, '0')}';
  static String monthKey(DateTime d) =>
      '${d.year}${d.month.toString().padLeft(2, '0')}';

  void logEvent(String type, {Map<String, dynamic> metadata = const {}}) {
    unawaited(_events.log(EventLog(
      userId: uid,
      eventType: type,
      timeSlot: TimeSlotUtils.now(),
      languageCode: languageCode,
      plan: plan,
      metadata: metadata,
    )));
  }

  void _fnf(Future<void> f, String label) {
    unawaited(f.then((v) {},
        onError: (Object e) =>
            debugPrint('MakanMana Wallet: $label gagal: $e')));
  }

  // ---------- Belanja ----------

  Future<String?> addExpense({
    required double totalSpend,
    required DateTime date,
    String? placeId,
    String placeName = '',
    String mealType = 'lunch',
    String paymentMethod = 'cash',
    List<MealItem> items = const [],
    String? foodPhotoUrl,
    String? receiptPhotoUrl,
    String? notes,
    int? satisfactionRating,
    String portion = 'normal',
    String source = 'manual',
    String? groupBillId,
  }) async {
    if (!_ready) return null;
    final doc = _db.collection('meal_expenses').doc();
    _fnf(
      doc.set({
        'userId': uid,
        'dateKey': dateKey(date),
        'monthKey': monthKey(date),
        'timeSlot': TimeSlotUtils.now(),
        'mealType': mealType,
        'currency': 'MYR',
        'totalSpend': totalSpend,
        'paymentMethod': paymentMethod,
        'items': items.map((i) => i.toMap()).toList(),
        'placeId': placeId,
        'placeNameSnapshot': placeName,
        'foodPhotoUrl': foodPhotoUrl,
        'receiptPhotoUrl': receiptPhotoUrl,
        'notes': notes,
        'satisfactionRating': satisfactionRating,
        'portion': portion,
        'source': source,
        'isGroupMeal': groupBillId != null,
        'groupBillId': groupBillId,
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      }),
      'addExpense',
    );
    logEvent('meal_expense_added', metadata: {
      'total': totalSpend,
      'source': source,
      'items': items.length,
      'mealType': mealType,
    });
    if (receiptPhotoUrl != null) logEvent('receipt_uploaded');
    if (foodPhotoUrl != null) logEvent('food_photo_uploaded');
    _updateSpendingBrain(totalSpend, items);
    return doc.id;
  }

  void updateExpense(String id, Map<String, dynamic> fields) {
    if (!_ready) return;
    _fnf(
      _db.collection('meal_expenses').doc(id).update({
        ...fields,
        'updatedAt': FieldValue.serverTimestamp(),
      }),
      'updateExpense',
    );
    logEvent('meal_expense_updated');
  }

  void deleteExpense(String id) {
    if (!_ready) return;
    _fnf(_db.collection('meal_expenses').doc(id).delete(), 'deleteExpense');
    logEvent('meal_expense_deleted');
  }

  /// Muat naik foto makanan / resit ke Storage (laluan dilindungi rules).
  Future<String?> uploadPhoto(File file, String kind) async {
    if (!_ready) return null;
    try {
      final ref = FirebaseStorage.instance.ref(
          'wallet_images/$uid/${DateTime.now().millisecondsSinceEpoch}_$kind.jpg');
      await ref.putFile(
          file, SettableMetadata(contentType: 'image/jpeg'));
      return await ref.getDownloadURL();
    } catch (e) {
      debugPrint('MakanMana Wallet: upload gagal: $e');
      return null;
    }
  }

  // ---------- Bajet ----------

  void saveBudget(BudgetProfile p) {
    if (!_ready) return;
    _fnf(
      _db.collection('budget_profiles').doc(uid).set({
        ...p.toMap(),
        'userId': uid,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true)),
      'saveBudget',
    );
    logEvent('budget_set', metadata: {
      'daily': p.dailyBudget,
      'weekly': p.weeklyBudget,
      'monthly': p.monthlyBudget,
    });
  }

  /// Ringkasan dikira dari expense bulan semasa (satu query equality).
  SpendSummary summarize(List<MealExpense> monthExpenses) {
    final now = DateTime.now();
    final todayKey = dateKey(now);
    final monday = now.subtract(Duration(days: now.weekday - 1));
    final weekKeys = List.generate(
        7, (i) => dateKey(monday.add(Duration(days: i)))).toSet();

    double today = 0, week = 0, month = 0, drink = 0;
    final byPlace = <String, double>{};
    final byMealType = <String, double>{};
    MealExpense? top;
    for (final e in monthExpenses) {
      month += e.totalSpend;
      if (e.dateKey == todayKey) today += e.totalSpend;
      if (weekKeys.contains(e.dateKey)) week += e.totalSpend;
      drink += e.drinkSpend;
      if (e.placeNameSnapshot.isNotEmpty) {
        byPlace[e.placeNameSnapshot] =
            (byPlace[e.placeNameSnapshot] ?? 0) + e.totalSpend;
      }
      byMealType[e.mealType] =
          (byMealType[e.mealType] ?? 0) + e.totalSpend;
      if (top == null || e.totalSpend > top.totalSpend) top = e;
    }
    return SpendSummary(
      today: today,
      week: week,
      month: month,
      mealCount: monthExpenses.length,
      drinkSpend: drink,
      byPlace: byPlace,
      byMealType: byMealType,
      mostExpensive: top,
    );
  }

  // ---------- Budget Coach (berperaturan, mesra, TIADA shame) ----------

  List<String> coachInsights(SpendSummary s, BudgetProfile b) {
    final out = <String>[];
    final weekLeft = b.weeklyBudget - s.week;
    final weekPct = b.weeklyBudget <= 0 ? 0 : s.week / b.weeklyBudget * 100;

    if (s.mealCount == 0) {
      out.add('Belum ada log bulan ini. Log makan pertama untuk mula '
          'jejak belanja anda.');
      return out;
    }
    if (weekPct >= 100) {
      out.add('Bajet minggu ini dah penuh (RM${s.week.toStringAsFixed(2)}'
          '/RM${b.weeklyBudget.round()}). Tak apa - pilih menu bawah '
          'RM10 untuk beberapa hari, kita seimbangkan semula.');
      logEvent('budget_exceeded', metadata: {'period': 'week'});
    } else if (weekPct >= b.alertThresholdPercent) {
      out.add('Dah guna ${weekPct.round()}% bajet mingguan. Baki '
          'RM${weekLeft.toStringAsFixed(2)} - sasarkan makan bawah '
          'RM${(weekLeft / 4).clamp(5, 50).toStringAsFixed(0)} untuk '
          '4 hidangan seterusnya.');
    } else {
      out.add('Baki bajet minggu ini RM${weekLeft.toStringAsFixed(2)}. '
          'Perbelanjaan anda terkawal - teruskan.');
    }

    if (s.month > 0 && s.drinkSpend / s.month > 0.15) {
      out.add('Minuman ${(s.drinkSpend / s.month * 100).round()}% dari '
          'belanja makan bulan ini (RM${s.drinkSpend.toStringAsFixed(2)}). '
          'Tukar ke air kosong 2-3 kali seminggu boleh jimat '
          'RM${(s.drinkSpend * 0.4).toStringAsFixed(0)}.');
    }
    if (s.topPlace != null && (s.byPlace[s.topPlace] ?? 0) > s.month * 0.3) {
      out.add('${s.topPlace} ialah tempat belanja terbesar anda bulan ini '
          '(RM${s.byPlace[s.topPlace]!.toStringAsFixed(2)}).');
    }
    final supper = s.byMealType['supper'] ?? 0;
    if (s.month > 0 && supper / s.month > 0.2) {
      out.add('Supper ${(supper / s.month * 100).round()}% dari belanja '
          'bulan ini. Kurangkan supper membantu bajet DAN Fit Score anda.');
    }
    if (s.avgPerMeal > 0) {
      out.add('Purata setiap hidangan: RM${s.avgPerMeal.toStringAsFixed(2)}.');
    }
    return out.take(3).toList();
  }

  // ---------- Spending Brain ----------

  void _updateSpendingBrain(double total, List<MealItem> items) {
    if (!_ready) return;
    final drink = items
        .where((i) => i.itemType == 'drink')
        .fold(0.0, (s, i) => s + i.lineTotal);
    _fnf(
      _db.collection('user_profiles').doc(uid).set({
        'spendingStats': {
          'lastMealSpend': total,
          'lastDrinkSpend': drink,
          'totalLogged': FieldValue.increment(1),
          'totalSpendAll': FieldValue.increment(total),
          'totalDrinkAll': FieldValue.increment(drink),
          'updatedAt': FieldValue.serverTimestamp(),
        },
      }, SetOptions(merge: true)),
      'spendingBrain',
    );
  }
}
