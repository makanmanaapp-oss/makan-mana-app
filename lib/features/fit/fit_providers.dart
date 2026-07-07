import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import 'fit_models.dart';
import 'fit_service.dart';

/// Tahap akses Fit Coach ikut pelan (paparan sahaja; kunci sebenar server).
enum FitAccess { locked, preview, full }

final fitAccessProvider = Provider<FitAccess>((ref) {
  final plan = ref.watch(userPlanProvider).value ?? 'free';
  return switch (plan) {
    'pro' => FitAccess.full,
    'plus' => FitAccess.preview,
    _ => FitAccess.locked,
  };
});

final fitServiceProvider = Provider<FitService>((ref) {
  return FitService(
    firebaseReady: ref.watch(firebaseReadyProvider),
    uid: ref.watch(authRepositoryProvider).currentUser?.uid ?? '',
    plan: ref.watch(userPlanProvider).value ?? 'free',
    languageCode: ref.watch(languageProvider).languageCode,
    events: ref.watch(eventRepositoryProvider),
  );
});

/// Profil kecergasan: fitness_profiles/{uid}. null = belum onboarding.
final fitProfileProvider = StreamProvider<FitnessProfile?>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(null);
  }
  return FirebaseFirestore.instance
      .collection('fitness_profiles')
      .doc(uid)
      .snapshots()
      .map((snap) => FitnessProfile.fromMap(snap.data()));
});

/// Metrik hari ini (live).
final todayMetricsProvider = StreamProvider<DailyMetrics>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const DailyMetrics());
  }
  final key = FitService.dateKey(DateTime.now());
  return FirebaseFirestore.instance
      .collection('fitness_metrics')
      .doc('${uid}_$key')
      .snapshots()
      .map((snap) => DailyMetrics.fromMap(snap.data()));
});

/// Sasaran nutrisi dikira dari profil.
final nutritionTargetsProvider = Provider<NutritionTargets?>((ref) {
  final profile = ref.watch(fitProfileProvider).value;
  if (profile == null) return null;
  return NutritionTargets.fromProfile(profile);
});

/// Pelan latihan hari ini (deterministik dari mood + profil).
final todayPlanProvider = Provider<DailyPlan?>((ref) {
  final profile = ref.watch(fitProfileProvider).value;
  if (profile == null) return null;
  return ref.watch(fitServiceProvider).generateDailyPlan(profile);
});

/// Skor Fit hari ini.
final dailyFitScoreProvider = Provider<int?>((ref) {
  final profile = ref.watch(fitProfileProvider).value;
  final targets = ref.watch(nutritionTargetsProvider);
  if (profile == null || targets == null) return null;
  final metrics = ref.watch(todayMetricsProvider).value ?? const DailyMetrics();
  return metrics.fitScore(targets, profile.stepTarget);
});

/// Metrik 7 hari terakhir (Isnin-Ahad minggu semasa) untuk carta.
final weeklyMetricsProvider =
    FutureProvider.autoDispose<List<(DateTime, DailyMetrics)>>((ref) async {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) return const [];
  final now = DateTime.now();
  final monday = now.subtract(Duration(days: now.weekday - 1));
  final days = List.generate(7, (i) => monday.add(Duration(days: i)));
  final db = FirebaseFirestore.instance;
  final results = <(DateTime, DailyMetrics)>[];
  // Satu batch bacaan selari - 7 doc kecil sahaja.
  final snaps = await Future.wait(days.map((d) => db
      .collection('fitness_metrics')
      .doc('${uid}_${FitService.dateKey(d)}')
      .get()));
  for (var i = 0; i < days.length; i++) {
    results.add((days[i], DailyMetrics.fromMap(snaps[i].data())));
  }
  return results;
});

/// Log makanan hari ini (live) - equality sahaja, tiada indeks komposit.
final todayMealLogsProvider =
    StreamProvider.autoDispose<List<Map<String, dynamic>>>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const []);
  }
  return FirebaseFirestore.instance
      .collection('meal_logs')
      .where('userId', isEqualTo: uid)
      .where('date', isEqualTo: FitService.dateKey(DateTime.now()))
      .snapshots()
      .map((snap) => snap.docs.map((d) => d.data()).toList());
});

/// Sesi workout terkini (perlukan indeks userId + createdAt DESC).
final recentWorkoutsProvider =
    StreamProvider.autoDispose<List<Map<String, dynamic>>>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const []);
  }
  return FirebaseFirestore.instance
      .collection('workout_sessions')
      .where('userId', isEqualTo: uid)
      .orderBy('createdAt', descending: true)
      .limit(30)
      .snapshots()
      .map((snap) => snap.docs.map((d) => d.data()).toList());
});

/// Sejarah ukuran badan untuk carta progres.
final bodyEntriesProvider =
    StreamProvider.autoDispose<List<Map<String, dynamic>>>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const []);
  }
  return FirebaseFirestore.instance
      .collection('body_measurements')
      .doc(uid)
      .collection('entries')
      .orderBy('date', descending: false)
      .limit(60)
      .snapshots()
      .map((snap) => snap.docs.map((d) => d.data()).toList());
});

/// Streak latihan: hari berturut-turut dengan workout siap.
/// Hari ini belum siap tidak mematikan streak (kira dari semalam).
final trainingStreakProvider = Provider<int>((ref) {
  final workouts = ref.watch(recentWorkoutsProvider).value ?? const [];
  final done = workouts
      .where((w) => w['status'] == 'completed')
      .map((w) => w['date'] as String? ?? '')
      .toSet();
  var day = DateTime.now();
  if (!done.contains(FitService.dateKey(day))) {
    day = day.subtract(const Duration(days: 1));
  }
  var streak = 0;
  while (done.contains(FitService.dateKey(day))) {
    streak++;
    day = day.subtract(const Duration(days: 1));
  }
  return streak;
});

/// Laporan mingguan Fit (jana + cache).
final fitWeeklyReportProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final profile = ref.watch(fitProfileProvider).value;
  final targets = ref.watch(nutritionTargetsProvider);
  if (profile == null || targets == null) {
    return {'coachSummary': '', 'recommendations': const <String>[]};
  }
  return ref.watch(fitServiceProvider).buildWeeklyReport(profile, targets);
});
