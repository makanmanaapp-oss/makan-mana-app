import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import 'wallet_models.dart';
import 'wallet_service.dart';

/// Akses wallet ikut pelan: free=asas, plus=bajet penuh, pro=coach AI.
enum WalletAccess { free, plus, pro }

final walletAccessProvider = Provider<WalletAccess>((ref) {
  final plan = ref.watch(userPlanProvider).value ?? 'free';
  return switch (plan) {
    'pro' => WalletAccess.pro,
    'plus' => WalletAccess.plus,
    _ => WalletAccess.free,
  };
});

final walletServiceProvider = Provider<WalletService>((ref) {
  return WalletService(
    firebaseReady: ref.watch(firebaseReadyProvider),
    uid: ref.watch(authRepositoryProvider).currentUser?.uid ?? '',
    plan: ref.watch(userPlanProvider).value ?? 'free',
    languageCode: ref.watch(languageProvider).languageCode,
    events: ref.watch(eventRepositoryProvider),
  );
});

/// Semua expense bulan semasa (live) - satu query equality.
final monthExpensesProvider =
    StreamProvider.autoDispose<List<MealExpense>>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const []);
  }
  return FirebaseFirestore.instance
      .collection('meal_expenses')
      .where('userId', isEqualTo: uid)
      .where('monthKey', isEqualTo: WalletService.monthKey(DateTime.now()))
      .snapshots()
      .map((snap) {
    final list = snap.docs
        .map((d) => MealExpense.fromDoc(d.id, d.data()))
        .toList()
      ..sort((a, b) => b.dateKey.compareTo(a.dateKey));
    return list;
  });
});

final budgetProfileProvider = StreamProvider<BudgetProfile>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const BudgetProfile());
  }
  return FirebaseFirestore.instance
      .collection('budget_profiles')
      .doc(uid)
      .snapshots()
      .map((snap) => BudgetProfile.fromMap(snap.data()));
});

final spendSummaryProvider = Provider.autoDispose<SpendSummary>((ref) {
  final expenses = ref.watch(monthExpensesProvider).value ?? const [];
  return ref.watch(walletServiceProvider).summarize(expenses);
});

final coachInsightsProvider = Provider.autoDispose<List<String>>((ref) {
  final summary = ref.watch(spendSummaryProvider);
  final budget =
      ref.watch(budgetProfileProvider).value ?? const BudgetProfile();
  return ref.watch(walletServiceProvider).coachInsights(summary, budget);
});
