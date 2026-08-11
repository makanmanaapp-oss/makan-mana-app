import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers/makanmana_user_context_provider.dart';
import '../../core/widgets/app_chip.dart';
import '../../core/widgets/mm_icons.dart';

// Pilihan diselaraskan dengan onboarding (ID kekal supaya tiada
// percanggahan data — favoriteCuisines/allergies/mealTimes guna ID sama).
const _kDiets = [
  ('none', 'dietNone', ''),
  ('vegetarian', 'dietVegetarian', ''),
  ('vegan', 'dietVegan', ''),
  ('pescatarian', 'dietPescatarian', ''),
];
const _kAllergies = [
  ('kacang', 'Kacang'),
  ('seafood', 'Seafood'),
  ('telur', 'Telur'),
  ('susu', 'Susu / Dairy'),
  ('gluten', 'Gluten'),
];
const _kCuisines = [
  ('melayu', 'Melayu'),
  ('mamak', 'Mamak'),
  ('cina', 'Cina'),
  ('india', 'India'),
  ('thai', 'Thai'),
  ('western', 'Western'),
  ('jepun', 'Jepun'),
  ('korea', 'Korea'),
  ('cafe', 'Cafe'),
];
const _kMealTimes = [
  ('breakfast', 'Sarapan'),
  ('lunch', 'Lunch'),
  ('dinner', 'Dinner'),
  ('supper', 'Supper'),
];
const _kRadiusOptions = [1.0, 3.0, 5.0, 10.0, 15.0];

/// Rangka editor kongsi: tajuk + kandungan + butang Simpan dipin.
class _EditorScaffold extends StatelessWidget {
  const _EditorScaffold({
    required this.title,
    required this.child,
    required this.onSave,
  });

  final String title;
  final Widget child;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
              children: [child],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: onSave,
                  child: Text(l.t('saveAction')),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

Widget _sectionLabel(BuildContext context, String text) => Padding(
      padding: const EdgeInsets.only(bottom: 10, top: 4),
      child: Text(text,
          style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: context.mm.onCard)),
    );

void _savedSnack(BuildContext context) {
  final l = AppLocalizations.of(context);
  ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(l.t('pmSaved'))));
}

// ---------------- Diet & Allergy ----------------

class DietAllergyScreen extends ConsumerStatefulWidget {
  const DietAllergyScreen({super.key});
  @override
  ConsumerState<DietAllergyScreen> createState() => _DietAllergyScreenState();
}

class _DietAllergyScreenState extends ConsumerState<DietAllergyScreen> {
  late String _diet;
  late bool _halal;
  late Set<String> _allergies;

  @override
  void initState() {
    super.initState();
    final c = ref.read(makanManaUserContextProvider);
    _diet = c.dietType;
    _halal = c.halalPreference;
    _allergies = {...c.allergies};
  }

  Future<void> _save() async {
    await ref.read(makanManaUserContextProvider.notifier).updateDietAndAllergy(
          dietType: _diet,
          halalPreference: _halal,
          allergies: _allergies.where((s) => s.trim().isNotEmpty).toSet().toList(),
        );
    if (mounted) {
      _savedSnack(context);
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return _EditorScaffold(
      title: l.t('pmDietAllergy'),
      onSave: _save,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel(context, l.t('onbDiet')),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: _kDiets
                .map((d) => AppChip(
                      label: l.t(d.$2),
                      emoji: d.$3,
                      selected: _diet == d.$1,
                      onTap: () => setState(() => _diet = d.$1),
                    ))
                .toList(),
          ),
          const SizedBox(height: 24),
          _sectionLabel(context, l.t('onbHalal')),
          Wrap(
            spacing: 10,
            children: [
              AppChip(
                label: l.t('halalYes'),
                emoji: '',
                selected: _halal,
                onTap: () => setState(() => _halal = true),
              ),
              AppChip(
                label: l.t('halalAny'),
                emoji: '',
                selected: !_halal,
                onTap: () => setState(() => _halal = false),
              ),
            ],
          ),
          const SizedBox(height: 24),
          _sectionLabel(context, l.t('onbAllergies')),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: _kAllergies
                .map((a) => AppChip(
                      label: a.$2,
                      selected: _allergies.contains(a.$1),
                      onTap: () => setState(() {
                        _allergies.contains(a.$1)
                            ? _allergies.remove(a.$1)
                            : _allergies.add(a.$1);
                      }),
                    ))
                .toList(),
          ),
        ],
      ),
    );
  }
}

// ---------------- Budget & Radius ----------------

class BudgetRadiusScreen extends ConsumerStatefulWidget {
  const BudgetRadiusScreen({super.key});
  @override
  ConsumerState<BudgetRadiusScreen> createState() =>
      _BudgetRadiusScreenState();
}

class _BudgetRadiusScreenState extends ConsumerState<BudgetRadiusScreen> {
  late RangeValues _budget;
  late double _radiusKm;

  @override
  void initState() {
    super.initState();
    final c = ref.read(makanManaUserContextProvider);
    final min = c.budgetMin.toDouble().clamp(3, 100);
    final max = c.budgetMax.toDouble().clamp(min, 100);
    _budget = RangeValues(min.toDouble(), max.toDouble());
    // Petakan radius sedia ada ke pilihan terdekat.
    _radiusKm = _kRadiusOptions.reduce((a, b) =>
        (a - c.defaultRadiusKm).abs() <= (b - c.defaultRadiusKm).abs()
            ? a
            : b);
  }

  Future<void> _save() async {
    final notifier = ref.read(makanManaUserContextProvider.notifier);
    // Validasi: min<=max sudah dijamin oleh RangeSlider.
    await notifier.updateBudgetRange(
        _budget.start.round(), _budget.end.round());
    await notifier.updateDefaultRadiusKm(_radiusKm);
    if (mounted) {
      _savedSnack(context);
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return _EditorScaffold(
      title: l.t('pmBudgetRadius'),
      onSave: _save,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel(context, l.t('onbBudget')),
          Text(
            'RM${_budget.start.round()} - RM${_budget.end.round()}',
            style: const TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w800,
                color: AppColors.primaryRed),
          ),
          RangeSlider(
            values: _budget,
            min: 3,
            max: 100,
            divisions: 97,
            activeColor: AppColors.primaryRed,
            labels: RangeLabels(
              'RM${_budget.start.round()}',
              'RM${_budget.end.round()}',
            ),
            onChanged: (v) => setState(() => _budget = v),
          ),
          const SizedBox(height: 20),
          _sectionLabel(context, l.t('pmDefaultRadius')),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: _kRadiusOptions
                .map((r) => AppChip(
                      label: '${r.round()} km',
                      emoji: '',
                      selected: _radiusKm == r,
                      onTap: () => setState(() => _radiusKm = r),
                    ))
                .toList(),
          ),
        ],
      ),
    );
  }
}

// ---------------- Favourite Cuisine ----------------

class FavouriteCuisineScreen extends ConsumerStatefulWidget {
  const FavouriteCuisineScreen({super.key});
  @override
  ConsumerState<FavouriteCuisineScreen> createState() =>
      _FavouriteCuisineScreenState();
}

class _FavouriteCuisineScreenState
    extends ConsumerState<FavouriteCuisineScreen> {
  late Set<String> _cuisines;

  @override
  void initState() {
    super.initState();
    _cuisines = {...ref.read(makanManaUserContextProvider).favoriteCuisines};
  }

  Future<void> _save() async {
    // Tiada pendua & tiada string kosong (canonical: favoriteCuisines).
    final clean = _cuisines
        .where((s) => s.trim().isNotEmpty)
        .toSet()
        .toList();
    await ref
        .read(makanManaUserContextProvider.notifier)
        .updateFavoriteCuisines(clean);
    if (mounted) {
      _savedSnack(context);
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return _EditorScaffold(
      title: l.t('pmFavCuisine'),
      onSave: _save,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel(context, l.t('onbCuisine')),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: _kCuisines
                .map((c) => AppChip(
                      label: c.$2,
                      selected: _cuisines.contains(c.$1),
                      onTap: () => setState(() {
                        _cuisines.contains(c.$1)
                            ? _cuisines.remove(c.$1)
                            : _cuisines.add(c.$1);
                      }),
                    ))
                .toList(),
          ),
        ],
      ),
    );
  }
}

// ---------------- Spice Level ----------------

class SpiceLevelScreen extends ConsumerStatefulWidget {
  const SpiceLevelScreen({super.key});
  @override
  ConsumerState<SpiceLevelScreen> createState() => _SpiceLevelScreenState();
}

class _SpiceLevelScreenState extends ConsumerState<SpiceLevelScreen> {
  late int _spicy;

  @override
  void initState() {
    super.initState();
    // Fallback selamat jika nilai luar julat 0..3.
    final v = ref.read(makanManaUserContextProvider).spicyPreference;
    _spicy = (v >= 0 && v <= 3) ? v : 2;
  }

  Future<void> _save() async {
    await ref
        .read(makanManaUserContextProvider.notifier)
        .updateSpicyPreference(_spicy);
    if (mounted) {
      _savedSnack(context);
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return _EditorScaffold(
      title: l.t('pmSpice'),
      onSave: _save,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel(context, l.t('onbSpicy')),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: List.generate(4, (i) {
              return AppChip(
                // Spec ikon: tahap pedas = ikon cili + nombor 0-3.
                label: '$i',
                icon: i == 0 ? null : MmIconType.pedas,
                selected: _spicy == i,
                onTap: () => setState(() => _spicy = i),
              );
            }),
          ),
        ],
      ),
    );
  }
}

// ---------------- Usual Meal Times ----------------

class MealTimeScreen extends ConsumerStatefulWidget {
  const MealTimeScreen({super.key});
  @override
  ConsumerState<MealTimeScreen> createState() => _MealTimeScreenState();
}

class _MealTimeScreenState extends ConsumerState<MealTimeScreen> {
  late Set<String> _times;

  @override
  void initState() {
    super.initState();
    _times = {...ref.read(makanManaUserContextProvider).usualMealTimes};
  }

  Future<void> _save() async {
    final clean =
        _times.where((s) => s.trim().isNotEmpty).toSet().toList();
    await ref
        .read(makanManaUserContextProvider.notifier)
        .updateUsualMealTimes(clean);
    if (mounted) {
      _savedSnack(context);
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return _EditorScaffold(
      title: l.t('pmMealTime'),
      onSave: _save,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel(context, l.t('onbMealTimes')),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: _kMealTimes
                .map((m) => AppChip(
                      label: m.$2,
                      selected: _times.contains(m.$1),
                      onTap: () => setState(() {
                        _times.contains(m.$1)
                            ? _times.remove(m.$1)
                            : _times.add(m.$1);
                      }),
                    ))
                .toList(),
          ),
        ],
      ),
    );
  }
}
