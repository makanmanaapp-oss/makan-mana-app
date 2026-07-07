import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import 'fit_providers.dart';
import 'fit_widgets.dart';

/// /fit/reports - Weekly Food & Fitness Report penuh.
class FitReportsScreen extends ConsumerWidget {
  const FitReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final access = ref.watch(fitAccessProvider);
    final reportAsync = ref.watch(fitWeeklyReportProvider);

    final body = reportAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, st) => Center(
        child: Text('😕 $e', style: const TextStyle(fontSize: 13)),
      ),
      data: (r) => ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          // Ringkasan coach.
          Container(
            margin: const EdgeInsets.only(bottom: 14),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF0F766E), Color(0xFF15803D)],
              ),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l.t('fitReportTitle'),
                  style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 16),
                ),
                const SizedBox(height: 8),
                Text(
                  '${r['coachSummary'] ?? ''}',
                  style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.92),
                      fontWeight: FontWeight.w600,
                      height: 1.45,
                      fontSize: 13),
                ),
              ],
            ),
          ),

          // Statistik minggu.
          FitSectionCard(
            title: l.t('fitWeekStats'),
            child: Column(
              children: [
                _statRow(
                    Icons.fitness_center,
                    l.t('fitTrainingDone'),
                    '${r['trainingCompleted'] ?? 0}/${r['trainingPlanned'] ?? 0}',
                    AppColors.primaryRed),
                _statRow(Icons.directions_walk, l.t('fitAvgSteps'),
                    _fmt(r['averageSteps']), const Color(0xFF0EA5E9)),
                _statRow(
                    Icons.local_fire_department_outlined,
                    l.t('fitAvgCalories'),
                    '${r['averageCalories'] ?? 0} kcal',
                    AppColors.warningOrange),
                _statRow(Icons.egg_alt_outlined, l.t('fitProteinHit'),
                    '${r['proteinHitRate'] ?? 0}%', const Color(0xFF7C3AED)),
                _statRow(Icons.restaurant, l.t('fitHealthyMeals'),
                    '${r['healthyMealCount'] ?? 0}', AppColors.healthyGreen),
                _statRow(Icons.fastfood_outlined, l.t('fitHeavyMeals'),
                    '${r['heavyMealCount'] ?? 0}', AppColors.mutedText),
                _statRow(Icons.local_cafe_outlined, l.t('fitSugaryDrinks'),
                    '${r['sugaryDrinkCount'] ?? 0}', AppColors.warningOrange),
              ],
            ),
          ),

          // Cadangan minggu depan.
          FitSectionCard(
            title: l.t('fitNextWeek'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ...((r['recommendations'] as List?) ?? const [])
                    .asMap()
                    .entries
                    .map((e) => Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                height: 22,
                                width: 22,
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: AppColors.primaryRed
                                      .withValues(alpha: 0.1),
                                  shape: BoxShape.circle,
                                ),
                                child: Text(
                                  '${e.key + 1}',
                                  style: const TextStyle(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w800,
                                      color: AppColors.primaryRed),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text('${e.value}',
                                    style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                        height: 1.4)),
                              ),
                            ],
                          ),
                        )),
                if (((r['recommendations'] as List?) ?? const []).isEmpty)
                  Text(l.t('fitNoDataYet'),
                      style: const TextStyle(
                          color: AppColors.mutedText,
                          fontWeight: FontWeight.w600,
                          fontSize: 12.5)),
              ],
            ),
          ),
        ],
      ),
    );

    return Scaffold(
      appBar: AppBar(title: Text(l.t('fitReportTitle'))),
      body: access == FitAccess.full
          ? body
          : LockedProOverlay(locked: true, child: body),
    );
  }

  static String _fmt(dynamic n) {
    final v = (n as num?)?.round() ?? 0;
    return v
        .toString()
        .replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]},');
  }

  Widget _statRow(IconData icon, String label, String value, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon, size: 19, color: color),
          const SizedBox(width: 11),
          Expanded(
            child: Text(label,
                style:
                    const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          ),
          Text(value,
              style:
                  const TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

/// /fit/wearables - penyambungan jam pintar (akan datang, schema sedia).
class FitWearablesScreen extends ConsumerWidget {
  const FitWearablesScreen({super.key});

  static const _providers = [
    ('Health Connect', Icons.favorite_outline),
    ('Apple Watch / HealthKit', Icons.watch_outlined),
    ('Wear OS', Icons.watch),
    ('Samsung Health', Icons.monitor_heart_outlined),
    ('Garmin', Icons.gps_fixed),
    ('Fitbit', Icons.fitness_center),
    ('Amazfit / Zepp', Icons.access_time),
    ('Huawei Health', Icons.health_and_safety_outlined),
    ('Xiaomi', Icons.watch_later_outlined),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.t('fitWearable'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          Container(
            margin: const EdgeInsets.only(bottom: 14),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.softYellow,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                const Icon(Icons.watch_outlined,
                    size: 30, color: Color(0xFFB45309)),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    l.t('fitWearableSoon'),
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, height: 1.4, fontSize: 13),
                  ),
                ),
              ],
            ),
          ),
          ..._providers.map((p) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  onTap: () {
                    ref.read(fitServiceProvider).logEvent(
                        'wearable_connect_clicked',
                        metadata: {'provider': p.$1});
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                      content: Text('${p.$1}: ${l.t('soonBadge')}'),
                      duration: const Duration(seconds: 2),
                    ));
                  },
                  tileColor: AppColors.cardWhite,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                    side: const BorderSide(color: AppColors.softBorder),
                  ),
                  leading: Icon(p.$2, color: AppColors.mutedText),
                  title: Text(p.$1,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 13.5)),
                  trailing: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.softBorder.withValues(alpha: 0.6),
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child: Text(
                      l.t('soonBadge'),
                      style: const TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w700,
                          color: AppColors.mutedText),
                    ),
                  ),
                ),
              )),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () => context.push('/fit/health-permissions'),
            style: OutlinedButton.styleFrom(minimumSize: const Size(0, 48)),
            icon: const Icon(Icons.privacy_tip_outlined, size: 18),
            label: Text(l.t('fitHealthPermTitle'),
                style: const TextStyle(fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
  }
}

/// /fit/health-permissions - kawalan data kesihatan oleh pengguna.
class HealthPermissionsScreen extends ConsumerStatefulWidget {
  const HealthPermissionsScreen({super.key});

  @override
  ConsumerState<HealthPermissionsScreen> createState() =>
      _HealthPermissionsScreenState();
}

class _HealthPermissionsScreenState
    extends ConsumerState<HealthPermissionsScreen> {
  Map<String, bool> perms = {
    'stepsGranted': true,
    'workoutGranted': true,
    'caloriesGranted': true,
    'distanceGranted': true,
    'heartRateGranted': false,
    'sleepGranted': false,
  };
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final uid = ref.read(fitServiceProvider).uid;
    if (uid.isEmpty || !ref.read(fitServiceProvider).firebaseReady) {
      setState(() => _loaded = true);
      return;
    }
    try {
      final snap = await FirebaseFirestore.instance
          .collection('health_permissions')
          .doc(uid)
          .get();
      final data = snap.data();
      if (data != null && mounted) {
        setState(() {
          for (final k in perms.keys.toList()) {
            if (data[k] is bool) perms[k] = data[k] as bool;
          }
        });
      }
    } catch (e) {
      debugPrint('MakanMana Fit: baca permissions gagal: $e');
    }
    if (mounted) setState(() => _loaded = true);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final items = [
      ('stepsGranted', l.t('fitPermSteps'), Icons.directions_walk, true),
      ('workoutGranted', l.t('fitPermWorkout'), Icons.fitness_center, true),
      (
        'caloriesGranted',
        l.t('fitPermCalories'),
        Icons.local_fire_department_outlined,
        true
      ),
      ('distanceGranted', l.t('fitPermDistance'), Icons.route, true),
      (
        'heartRateGranted',
        l.t('fitPermHeart'),
        Icons.monitor_heart_outlined,
        false
      ),
      ('sleepGranted', l.t('fitPermSleep'), Icons.bedtime_outlined, false),
    ];

    return Scaffold(
      appBar: AppBar(title: Text(l.t('fitHealthPermTitle'))),
      body: !_loaded
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                Container(
                  margin: const EdgeInsets.only(bottom: 14),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.cardWhite,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.softBorder),
                  ),
                  child: Text(
                    l.t('fitPermNote'),
                    style: const TextStyle(
                        fontSize: 12.5,
                        color: AppColors.mutedText,
                        fontWeight: FontWeight.w600,
                        height: 1.45),
                  ),
                ),
                ...items.map((item) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: SwitchListTile(
                        value: perms[item.$1] ?? false,
                        onChanged: (v) {
                          setState(() => perms[item.$1] = v);
                          ref
                              .read(fitServiceProvider)
                              .saveHealthPermissions(perms);
                          if (!v) {
                            ref.read(fitServiceProvider).logEvent(
                                'health_permission_revoked',
                                metadata: {'permission': item.$1});
                          }
                        },
                        activeTrackColor: AppColors.healthyGreen,
                        tileColor: AppColors.cardWhite,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                          side: const BorderSide(color: AppColors.softBorder),
                        ),
                        secondary: Icon(item.$3, color: AppColors.mutedText),
                        title: Text(
                          item.$2,
                          style: const TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 13.5),
                        ),
                        subtitle: item.$4
                            ? null
                            : Text(l.t('soonBadge'),
                                style: const TextStyle(fontSize: 11.5)),
                      ),
                    )),
              ],
            ),
    );
  }
}
