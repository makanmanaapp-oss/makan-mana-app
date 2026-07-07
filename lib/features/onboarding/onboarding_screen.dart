import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';
import '../../core/widgets/app_chip.dart';
import '../../core/widgets/primary_cta_button.dart';
import '../../models/user_profile.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _pageController = PageController();
  int _step = 0;
  bool _saving = false;

  // Jawapan
  String _dietType = 'none';
  bool _halal = true;
  final Set<String> _allergies = {};
  RangeValues _budget = const RangeValues(8, 30);
  final Set<String> _cuisines = {};
  int _spicy = 2;
  final Set<String> _mealTimes = {'lunch', 'dinner'};

  static const _allergyOptions = [
    ('kacang', 'Kacang 🥜'),
    ('seafood', 'Seafood 🦐'),
    ('telur', 'Telur 🥚'),
    ('susu', 'Susu / Dairy 🥛'),
    ('gluten', 'Gluten 🍞'),
  ];

  static const _cuisineOptions = [
    ('melayu', 'Melayu 🍛'),
    ('mamak', 'Mamak 🫓'),
    ('cina', 'Cina 🥢'),
    ('india', 'India 🍃'),
    ('thai', 'Thai 🍲'),
    ('western', 'Western 🍔'),
    ('jepun', 'Jepun 🍣'),
    ('korea', 'Korea 🍜'),
    ('cafe', 'Cafe ☕'),
  ];

  static const _mealTimeOptions = [
    ('breakfast', 'Sarapan 🌅'),
    ('lunch', 'Lunch ☀️'),
    ('dinner', 'Dinner 🌇'),
    ('supper', 'Supper 🌙'),
  ];

  static const _totalSteps = 5;

  void _next() {
    if (_step < _totalSteps - 1) {
      _pageController.nextPage(
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    } else {
      _finish();
    }
  }

  void _back() {
    if (_step > 0) {
      _pageController.previousPage(
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    }
  }

  Future<void> _finish() async {
    setState(() => _saving = true);
    final auth = ref.read(authRepositoryProvider);
    final uid = auth.currentUser?.uid ?? '';

    final profile = UserProfile(
      uid: uid,
      dietType: _dietType,
      halalPreference: _halal,
      allergies: _allergies.toList(),
      budgetMin: _budget.start.round(),
      budgetMax: _budget.end.round(),
      favoriteCuisines: _cuisines.toList(),
      spicyPreference: _spicy,
      usualMealTimes: _mealTimes.toList(),
    );

    // Simpan ke Firestore (user_profiles/{uid}) + salinan tempatan.
    await ref.read(profileRepositoryProvider).saveProfile(profile);
    await ref.read(appPrefsProvider).setOnboardingDone(true);

    if (mounted) context.go(RoutePaths.home);
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
                  Text(
                    l.t('onbTitle'),
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                      color: AppColors.darkText,
                    ),
                  ),
                  const SizedBox(height: 14),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: LinearProgressIndicator(
                      value: (_step + 1) / _totalSteps,
                      minHeight: 8,
                      backgroundColor: AppColors.softYellow,
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
                  _stepDietHalal(l),
                  _stepAllergies(l),
                  _stepBudget(l),
                  _stepCuisines(l),
                  _stepSpicyMealTimes(l),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: Row(
                children: [
                  if (_step > 0)
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _back,
                        child: Text(l.t('back')),
                      ),
                    ),
                  if (_step > 0) const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: PrimaryCtaButton(
                      label: _step == _totalSteps - 1
                          ? l.t('finish')
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

  Widget _sectionTitle(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Text(
          text,
          style: const TextStyle(
            fontSize: 19,
            fontWeight: FontWeight.w700,
            color: AppColors.darkText,
          ),
        ),
      );

  Widget _stepDietHalal(AppLocalizations l) {
    final diets = [
      ('none', l.t('dietNone'), '🍽️'),
      ('vegetarian', l.t('dietVegetarian'), '🥕'),
      ('vegan', l.t('dietVegan'), '🌱'),
      ('pescatarian', l.t('dietPescatarian'), '🐟'),
    ];
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        _sectionTitle(l.t('onbDiet')),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: diets
              .map((d) => AppChip(
                    label: d.$2,
                    emoji: d.$3,
                    selected: _dietType == d.$1,
                    onTap: () => setState(() => _dietType = d.$1),
                  ))
              .toList(),
        ),
        const SizedBox(height: 32),
        _sectionTitle(l.t('onbHalal')),
        Wrap(
          spacing: 10,
          children: [
            AppChip(
              label: l.t('halalYes'),
              emoji: '☪️',
              selected: _halal,
              onTap: () => setState(() => _halal = true),
            ),
            AppChip(
              label: l.t('halalAny'),
              emoji: '🤷',
              selected: !_halal,
              onTap: () => setState(() => _halal = false),
            ),
          ],
        ),
      ],
    );
  }

  Widget _stepAllergies(AppLocalizations l) {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        _sectionTitle(l.t('onbAllergies')),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: _allergyOptions
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
    );
  }

  Widget _stepBudget(AppLocalizations l) {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        _sectionTitle(l.t('onbBudget')),
        Text(
          'RM${_budget.start.round()} - RM${_budget.end.round()}',
          style: const TextStyle(
            fontSize: 30,
            fontWeight: FontWeight.w800,
            color: AppColors.primaryRed,
          ),
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
      ],
    );
  }

  Widget _stepCuisines(AppLocalizations l) {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        _sectionTitle(l.t('onbCuisine')),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: _cuisineOptions
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
    );
  }

  Widget _stepSpicyMealTimes(AppLocalizations l) {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        _sectionTitle(l.t('onbSpicy')),
        Row(
          children: List.generate(4, (i) {
            final selected = _spicy == i;
            return Padding(
              padding: const EdgeInsets.only(right: 10),
              child: AppChip(
                label: i == 0 ? '0' : '🌶️' * i,
                selected: selected,
                onTap: () => setState(() => _spicy = i),
              ),
            );
          }),
        ),
        const SizedBox(height: 32),
        _sectionTitle(l.t('onbMealTimes')),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: _mealTimeOptions
              .map((m) => AppChip(
                    label: m.$2,
                    selected: _mealTimes.contains(m.$1),
                    onTap: () => setState(() {
                      _mealTimes.contains(m.$1)
                          ? _mealTimes.remove(m.$1)
                          : _mealTimes.add(m.$1);
                    }),
                  ))
              .toList(),
        ),
      ],
    );
  }
}
