import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';
import '../../core/providers/makanmana_user_context_provider.dart';
import '../../core/widgets/app_chip.dart';
import '../../core/widgets/primary_cta_button.dart';
import '../../models/user_profile.dart';
import '../taste/taste_taxonomy.dart';
import '../taste/taste_compat.dart';
import '../taste/taste_pickers.dart';
import '../taste/taste_profile_sync.dart';

/// ISSUE 003 Increment 3 — onboarding selera 8-seksyen kanonikal.
/// Draf disimpan dalam state tempatan (survive Back/Continue/tema/bahasa).
/// Simpan sekali sahaja pada akhir → canonicalizeForSave → repository merge.
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _pageController = PageController();
  int _step = 0;
  bool _saving = false;
  static const _totalSteps = 8;

  // ---- Draf (state tempatan; ID kanonikal sahaja) ----
  String? _foodGoal;
  String _halalId = 'halal_required';
  final Set<String> _diets = {};
  // Alahan berstruktur: id -> (severity, note?).
  final Map<String, ({String severity, String? note})> _allergyMap = {};
  final Set<String> _favCuisines = {};
  final Set<String> _exploreCuisines = {};
  final Set<String> _avoidCuisines = {};
  final List<Map<String, dynamic>> _customCuisines = [];

  Set<String> get _allergyIds => _allergyMap.keys.toSet();
  String _spiceId = 'medium';
  final Set<String> _tastePrefs = {};
  final Set<String> _mealTimes = {'lunch', 'dinner'};
  final Set<String> _contexts = {};
  RangeValues _budget = const RangeValues(8, 30);
  double _distanceKm = 3;
  final Map<String, String> _balance = {};
  String? _repeatId;
  String? _discoveryId;

  String get _lang => AppLocalizations.of(context).locale.languageCode;

  @override
  void initState() {
    super.initState();
    // Pra-isi daripada profil sedia ada (pengguna sunting semula).
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final c = ref.read(makanManaUserContextProvider);
      if (!mounted) return;
      setState(() {
        _halalId = canonicalHalalIdFromLegacyBool(c.halalPreference);
        if (c.dietType.isNotEmpty && c.dietType != 'none') {
          _diets.add(canonicalDietId(c.dietType));
        }
        for (final a in c.allergies) {
          _allergyMap[a] = (severity: 'moderate', note: null);
        }
        _favCuisines.addAll(c.favoriteCuisines);
        _spiceId = canonicalSpiceIdFromLegacyInt(c.spicyPreference);
        if (c.usualMealTimes.isNotEmpty) {
          _mealTimes
            ..clear()
            ..addAll(c.usualMealTimes);
        }
        _budget = RangeValues(
            c.budgetMin.toDouble(), c.budgetMax.toDouble());
        _distanceKm = c.effectiveRadiusKm;
      });
      // ISSUE 003 (QA emulator): pra-isi medan KANONIKAL dari profil
      // tersimpan. Tanpa ini, "Ubah citarasa" memadam matlamat,
      // explore/avoid/custom cuisine, keterukan+nota alahan dan
      // repeat/discovery apabila disimpan semula (kehilangan data senyap).
      UserProfile? saved;
      try {
        saved = await ref.read(loadedUserProfileProvider.future);
      } catch (_) {
        saved = null; // gagal muat (offline) → kekal draf legasi
      }
      final p = saved;
      if (!mounted || p == null) return;
      setState(() {
        _foodGoal = p.primaryFoodGoal ?? _foodGoal;
        if (p.halalPreferenceId != null) _halalId = p.halalPreferenceId!;
        _diets.addAll(p.dietaryPatternIds);
        for (final e in p.allergyEntries) {
          final id = e['id'] as String?;
          if (id == null || id.isEmpty) continue;
          _allergyMap[id] = (
            severity: (e['severity'] as String?) ?? 'moderate',
            note: e['note'] as String?,
          );
        }
        _exploreCuisines.addAll(p.exploreCuisineIds);
        _avoidCuisines.addAll(p.avoidedCuisineIds);
        for (final ce in p.customCuisineEntries) {
          if (!_customCuisines.any((x) => x['id'] == ce['id'])) {
            _customCuisines.add(Map<String, dynamic>.from(ce));
          }
        }
        if (p.spiceToleranceId != null) _spiceId = p.spiceToleranceId!;
        _tastePrefs.addAll(p.tastePreferenceIds);
        _contexts.addAll(p.specialMealContextIds);
        p.mealBalancePreferences.forEach((k, v) => _balance[k] = v);
        _repeatId = p.repeatToleranceId ?? _repeatId;
        _discoveryId = p.discoveryPreferenceId ?? _discoveryId;
        if (p.preferredDistanceKm != null) {
          _distanceKm = p.preferredDistanceKm!;
        }
      });
    });
  }

  void _next() {
    if (_step < _totalSteps - 1) {
      _pageController.nextPage(
          duration: const Duration(milliseconds: 220), curve: Curves.easeOut);
    } else {
      _finish();
    }
  }

  void _back() {
    if (_step > 0) {
      _pageController.previousPage(
          duration: const Duration(milliseconds: 220), curve: Curves.easeOut);
    }
  }

  Future<void> _finish() async {
    if (_saving) return; // elak double-save
    setState(() => _saving = true);
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';

    var profile = UserProfile(
      uid: uid,
      // Legasi (diselaraskan semula oleh canonicalizeForSave).
      dietType: _diets.isNotEmpty ? _diets.first : 'none',
      halalPreference: legacyBoolFromCanonicalHalal(_halalId),
      allergies: _allergyMap.keys.toList(),
      budgetMin: _budget.start.round(),
      budgetMax: _budget.end.round(),
      favoriteCuisines: _favCuisines.toList(),
      spicyPreference: legacyIntFromCanonicalSpice(_spiceId),
      usualMealTimes: _mealTimes.toList(),
      // Kanonikal ISSUE 003.
      primaryFoodGoal: _foodGoal,
      halalPreferenceId: _halalId,
      dietaryPatternIds: _diets.toList(),
      allergyEntries: [
        for (final e in _allergyMap.entries)
          {
            'id': e.key,
            'severity': e.value.severity,
            if (e.value.note != null) 'note': e.value.note,
          }
      ],
      exploreCuisineIds: _exploreCuisines.toList(),
      avoidedCuisineIds: _avoidCuisines.toList(),
      customCuisineEntries: _customCuisines,
      spiceToleranceId: _spiceId,
      tastePreferenceIds: _tastePrefs.toList(),
      specialMealContextIds: _contexts.toList(),
      mealBalancePreferences: _balance,
      repeatToleranceId: _repeatId,
      discoveryPreferenceId: _discoveryId,
      preferredDistanceKm: _distanceKm,
      tasteProfileVersion: 2,
      tasteProfileUpdatedAt: DateTime.now(),
    );
    profile = canonicalizeForSave(profile);

    try {
      await ref.read(profileRepositoryProvider).saveProfile(profile);
      await ref.read(appPrefsProvider).setOnboardingDone(true);
      if (uid.isNotEmpty) {
        await ref
            .read(makanManaUserContextProvider.notifier)
            .loadForUser(uid, force: true);
      }
      if (mounted) context.go(RoutePaths.home);
    } catch (_) {
      // Gagal simpan → kekalkan draf, benarkan cuba lagi.
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(AppLocalizations.of(context).t('postFailed'))));
      }
    }
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(l.t('onbTitle'),
                      style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w800,
                          color: context.mm.onCard)),
                  const SizedBox(height: 12),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: LinearProgressIndicator(
                      value: (_step + 1) / _totalSteps,
                      minHeight: 8,
                      backgroundColor: context.mm.softFill,
                      valueColor: const AlwaysStoppedAnimation(
                          AppColors.primaryRed),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: PageView(
                controller: _pageController,
                physics: const NeverScrollableScrollPhysics(),
                onPageChanged: (i) => setState(() => _step = i),
                children: [
                  _stepGoal(l),
                  _stepHalalDiet(l),
                  _stepAllergy(l),
                  _stepCuisine(l),
                  _stepSpiceTaste(l),
                  _stepTimesContexts(l),
                  _stepBudgetDistBalance(l),
                  _stepRepeatDiscovery(l),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  if (_step > 0)
                    Expanded(
                      child: OutlinedButton(
                          onPressed: _back, child: Text(l.t('back'))),
                    ),
                  if (_step > 0) const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: PrimaryCtaButton(
                      label: _step == _totalSteps - 1
                          ? l.t('saveProfile')
                          : l.t('next'),
                      loading: _saving,
                      onPressed: _next,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ---------- Widget boleh guna semula ----------
  Widget _title(String t, {String? sub}) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(t,
                style: TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w700,
                    color: context.mm.onCard)),
            if (sub != null) ...[
              const SizedBox(height: 4),
              Text(sub,
                  style: TextStyle(
                      fontSize: 13, color: context.mm.onCardMuted)),
            ],
          ],
        ),
      );

  /// Chip berbilang-pilih daripada senarai TasteOption kanonikal.
  Widget _multi(List<TasteOption> options, Set<String> sel,
          {void Function(String id)? onToggle}) =>
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final o in options)
            AppChip(
              label: o.label(_lang),
              selected: sel.contains(o.id),
              onTap: () => setState(() {
                if (onToggle != null) {
                  onToggle(o.id);
                } else {
                  sel.contains(o.id) ? sel.remove(o.id) : sel.add(o.id);
                }
              }),
            ),
        ],
      );

  /// Kad pilihan tunggal dengan label + penunjuk terpilih.
  Widget _singleCards(List<TasteOption> options, String? selected,
          void Function(String id) onPick) =>
      Column(
        children: [
          for (final o in options)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: InkWell(
                borderRadius: BorderRadius.circular(14),
                onTap: () => setState(() => onPick(o.id)),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: selected == o.id
                        ? AppColors.selectedYellow
                        : context.mm.card,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                        color: selected == o.id
                            ? AppColors.warmYellow
                            : context.mm.border,
                        width: selected == o.id ? 1.5 : 1),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(o.label(_lang),
                            style: TextStyle(
                                fontWeight: FontWeight.w700,
                                color: selected == o.id
                                    ? AppColors.darkText
                                    : context.mm.onCard)),
                      ),
                      if (selected == o.id)
                        const Icon(Icons.check_circle,
                            color: AppColors.primaryRed, size: 20),
                    ],
                  ),
                ),
              ),
            ),
        ],
      );

  // ---------- Langkah 1: Matlamat ----------
  Widget _stepGoal(AppLocalizations l) => ListView(
        padding: const EdgeInsets.all(24),
        children: [
          _title(l.t('onbGoal'), sub: l.t('onbGoalSub')),
          _singleCards(kFoodGoals, _foodGoal, (id) => _foodGoal = id),
        ],
      );

  // ---------- Langkah 2: Halal & diet (dgn konflik) ----------
  Widget _stepHalalDiet(AppLocalizations l) => ListView(
        padding: const EdgeInsets.all(24),
        children: [
          _title(l.t('onbHalalDiet')),
          _singleCards(kHalalOptions, _halalId, (id) => _halalId = id),
          const SizedBox(height: 20),
          _title(l.t('onbDiet')),
          _multi(kDietPatterns, _diets, onToggle: _toggleDiet),
        ],
      );

  void _toggleDiet(String id) {
    if (_diets.contains(id)) {
      _diets.remove(id);
      return;
    }
    final conflicts = dietConflictsFor(id, _diets);
    if (conflicts.isEmpty) {
      _diets.add(id);
      return;
    }
    // Dialog konflik — JANGAN padam senyap.
    _showConflictDialog(id, conflicts);
  }

  Future<void> _showConflictDialog(
      String candidate, List<String> conflicts) async {
    final l = AppLocalizations.of(context);
    final keepNew = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(l.t('dietConflictTitle')),
        content: Text(l.t('dietConflictBody')),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(d, false),
              child: Text(l.t('keepExisting'))),
          ElevatedButton(
              onPressed: () => Navigator.pop(d, true),
              child: Text(l.t('keepNew'))),
        ],
      ),
    );
    if (keepNew == true) {
      setState(() {
        _diets.removeAll(conflicts);
        _diets.add(candidate);
      });
    }
  }

  // ---------- Langkah 3: Alahan ----------
  Widget _stepAllergy(AppLocalizations l) => ListView(
        padding: const EdgeInsets.all(24),
        children: [
          _title(l.t('onbAllergyStep')),
          _multi([...kAllergensCommon, ...kAllergensLocal, ...kAllergensOther],
              _allergyIds,
              onToggle: _toggleAllergy),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.mm.softFill,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(kAllergyDisclaimer[_lang] ?? kAllergyDisclaimer['en']!,
                style: TextStyle(
                    fontSize: 12, color: context.mm.onCard, height: 1.4)),
          ),
        ],
      );

  String _severityLabel(String severity) {
    for (final s in kAllergySeverity) {
      if (s.id == severity) return s.label(_lang);
    }
    return severity;
  }

  String _allergyLabelOf(String id) {
    for (final o in [
      ...kAllergensCommon,
      ...kAllergensLocal,
      ...kAllergensOther
    ]) {
      if (o.id == id) return o.label(_lang);
    }
    return id;
  }

  Future<void> _toggleAllergy(String id) async {
    final l = AppLocalizations.of(context);
    // no_known_allergy: TIDAK sesekali buka UI keterukan.
    if (id == 'no_known_allergy') {
      if (_allergyMap.containsKey(id)) {
        setState(() => _allergyMap.remove(id));
        return;
      }
      if (_allergyMap.isNotEmpty) {
        final ok = await showDialog<bool>(
          context: context,
          builder: (d) => AlertDialog(
            title: Text(l.t('noKnownAllergyTitle')),
            content: Text(l.t('noKnownAllergyBody')),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(d, false),
                  child: Text(l.t('back'))),
              ElevatedButton(
                  onPressed: () => Navigator.pop(d, true),
                  child: Text(l.t('keepNew'))),
            ],
          ),
        );
        if (ok != true) return;
      }
      setState(() {
        _allergyMap
          ..clear()
          ..[id] = (severity: 'moderate', note: null);
      });
      return;
    }

    // Alahan biasa/tempatan/custom → buka sheet keterukan + nota.
    final existing = _allergyMap[id];
    final res = await showAllergySeveritySheet(
      context,
      allergyLabel: _allergyLabelOf(id),
      currentSeverity: existing?.severity,
      currentNote: existing?.note,
      allowRemove: existing != null,
    );
    if (res == null) return; // batal
    setState(() {
      if (res.remove) {
        _allergyMap.remove(id);
      } else {
        _allergyMap.remove('no_known_allergy'); // tak boleh coexist
        _allergyMap[id] = (severity: res.severity, note: res.note);
      }
    });
  }

  // ---------- Langkah 4: Cuisine fav/explore/avoid ----------
  Widget _stepCuisine(AppLocalizations l) => ListView(
        padding: const EdgeInsets.all(24),
        children: [
          _title(l.t('onbCuisineStep')),
          _summaryRow(l.t('onbFav'),
              '${_favCuisines.length} ${l.t('tasteSelected')}'),
          _summaryRow(l.t('onbExplore'),
              '${_exploreCuisines.length} ${l.t('tasteSelected')}'),
          _summaryRow(l.t('onbAvoid'),
              '${_avoidCuisines.length} ${l.t('tasteSelected')}'),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _openCuisinePicker,
              icon: const Icon(Icons.search, size: 20),
              label: Text(l.t('cuisinePickerTitle')),
            ),
          ),
        ],
      );

  Future<void> _openCuisinePicker() async {
    final res = await openCuisinePicker(
      context,
      fav: _favCuisines,
      explore: _exploreCuisines,
      avoid: _avoidCuisines,
      customs: _customCuisines,
    );
    if (res == null) return;
    setState(() {
      _favCuisines
        ..clear()
        ..addAll(res.fav);
      _exploreCuisines
        ..clear()
        ..addAll(res.explore);
      _avoidCuisines
        ..clear()
        ..addAll(res.avoid);
      _customCuisines
        ..clear()
        ..addAll(res.customs);
    });
  }

  // ---------- Langkah 5: Pedas & citarasa ----------
  Widget _stepSpiceTaste(AppLocalizations l) => ListView(
        padding: const EdgeInsets.all(24),
        children: [
          _title(l.t('onbSpiceTaste')),
          _singleCards(kSpiceLevels, _spiceId, (id) => _spiceId = id),
          const SizedBox(height: 18),
          _title(l.t('onbTastePrefs')),
          _multi(kTastePreferences, _tastePrefs),
        ],
      );

  // ---------- Langkah 6: Waktu & konteks ----------
  Widget _stepTimesContexts(AppLocalizations l) => ListView(
        padding: const EdgeInsets.all(24),
        children: [
          _title(l.t('onbUsualTimes')),
          _multi(kMealTimes, _mealTimes),
          const SizedBox(height: 18),
          _title(l.t('onbSpecialContexts')),
          _multi(kMealContexts, _contexts),
        ],
      );

  // ---------- Langkah 7: Bajet, jarak, imbangan ----------
  Widget _stepBudgetDistBalance(AppLocalizations l) => ListView(
        padding: const EdgeInsets.all(24),
        children: [
          _title(l.t('onbBudget')),
          Text('RM${_budget.start.round()} - RM${_budget.end.round()}',
              style: const TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: AppColors.primaryRed)),
          RangeSlider(
            values: _budget,
            min: 3,
            max: 100,
            divisions: 97,
            activeColor: AppColors.primaryRed,
            labels: RangeLabels('RM${_budget.start.round()}',
                'RM${_budget.end.round()}'),
            onChanged: (v) => setState(() => _budget = v),
          ),
          const SizedBox(height: 12),
          _title(l.t('onbDistance')),
          Text('${_distanceKm.round()} km',
              style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: context.mm.onCard)),
          Slider(
            value: _distanceKm.clamp(1, 20),
            min: 1,
            max: 20,
            divisions: 19,
            activeColor: AppColors.primaryRed,
            label: '${_distanceKm.round()} km',
            onChanged: (v) => setState(() => _distanceKm = v),
          ),
          const SizedBox(height: 12),
          _title(l.t('onbBalance')),
          for (final dim in kMealBalanceDimensions)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(dim.label(_lang),
                      style: TextStyle(
                          fontWeight: FontWeight.w600,
                          color: context.mm.onCard)),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    children: [
                      for (final f in kFrequencyLevels)
                        AppChip(
                          label: f.label(_lang),
                          selected: _balance[dim.id] == f.id,
                          onTap: () =>
                              setState(() => _balance[dim.id] = f.id),
                        ),
                    ],
                  ),
                ],
              ),
            ),
        ],
      );

  // ---------- Langkah 8: Ulangan, penerokaan, ringkasan ----------
  Widget _stepRepeatDiscovery(AppLocalizations l) => ListView(
        padding: const EdgeInsets.all(24),
        children: [
          _title(l.t('onbRepeatTol')),
          _singleCards(kRepeatTolerance, _repeatId, (id) => _repeatId = id),
          const SizedBox(height: 18),
          _title(l.t('onbDiscovery')),
          _singleCards(
              kDiscoveryLevels, _discoveryId, (id) => _discoveryId = id),
          const SizedBox(height: 18),
          _title(l.t('onbSummary')),
          _summaryRow(l.t('onbGoal'), _goalLabel(l)),
          _summaryRow(l.t('onbHalal'), _optLabel(kHalalOptions, _halalId)),
          _summaryRow(l.t('onbDiet'),
              _diets.map((d) => _optLabel(kDietPatterns, d)).join(', ')),
          _summaryRow(l.t('onbAllergies'),
              _allergyMap.isEmpty
                  ? '-'
                  : _allergyMap.entries
                      .map((e) =>
                          '${_allergyLabelOf(e.key)} · ${_severityLabel(e.value.severity)}')
                      .join(', ')),
          _summaryRow(l.t('onbFav'), '${_favCuisines.length} ${l.t('tasteSelected')}'),
          _summaryRow(l.t('onbSpicy'), _optLabel(kSpiceLevels, _spiceId)),
          _summaryRow(l.t('onbBudget'),
              'RM${_budget.start.round()}-RM${_budget.end.round()}'),
          _summaryRow(l.t('onbDistance'), '${_distanceKm.round()} km'),
        ],
      );

  String _goalLabel(AppLocalizations l) => _foodGoal == null
      ? '-'
      : _optLabel(kFoodGoals, _foodGoal!);

  String _optLabel(List<TasteOption> list, String id) {
    for (final o in list) {
      if (o.id == id) return o.label(_lang);
    }
    return id;
  }

  Widget _summaryRow(String k, String v) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          children: [
            Expanded(
                flex: 2,
                child: Text(k,
                    style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: context.mm.onCard))),
            Expanded(
              flex: 3,
              child: Text(v.isEmpty ? '-' : v,
                  textAlign: TextAlign.right,
                  style: TextStyle(color: context.mm.onCardMuted)),
            ),
          ],
        ),
      );
}
