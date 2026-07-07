import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import 'fit_models.dart';
import 'fit_providers.dart';
import 'sport_moods_data.dart';

class FitOnboardingScreen extends ConsumerStatefulWidget {
  const FitOnboardingScreen({super.key});

  @override
  ConsumerState<FitOnboardingScreen> createState() =>
      _FitOnboardingScreenState();
}

class _FitOnboardingScreenState extends ConsumerState<FitOnboardingScreen> {
  final _height = TextEditingController(text: '170');
  final _weight = TextEditingController(text: '70');
  final _age = TextEditingController(text: '25');
  final _budgetMin = TextEditingController(text: '8');
  final _budgetMax = TextEditingController(text: '20');
  final _steps = TextEditingController(text: '8000');
  String _gender = 'male';
  String _goal = 'healthyLifestyle';
  String _level = 'beginner';
  String _mood = 'homeWorkout';
  int _days = 3;
  int _duration = 45;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final profile = ref.read(fitProfileProvider).value;
    if (profile != null) {
      _height.text = profile.heightCm.round().toString();
      _weight.text = profile.weightKg.round().toString();
      _age.text = profile.age.toString();
      _budgetMin.text = profile.budgetMin.toString();
      _budgetMax.text = profile.budgetMax.toString();
      _steps.text = profile.stepTarget.toString();
      _gender = profile.gender;
      _goal = profile.mainGoal;
      _level = profile.fitnessLevel;
      _mood = profile.selectedSportMood ?? 'homeWorkout';
      _days = profile.trainingDaysPerWeek;
      _duration = profile.sessionDurationMinutes;
    }
  }

  @override
  void dispose() {
    _height.dispose();
    _weight.dispose();
    _age.dispose();
    _budgetMin.dispose();
    _budgetMax.dispose();
    _steps.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);
    final profile = FitnessProfile(
      heightCm: double.tryParse(_height.text) ?? 170,
      weightKg: double.tryParse(_weight.text) ?? 70,
      age: int.tryParse(_age.text) ?? 25,
      gender: _gender,
      mainGoal: _goal,
      fitnessLevel: _level,
      trainingDaysPerWeek: _days,
      sessionDurationMinutes: _duration,
      budgetMin: int.tryParse(_budgetMin.text) ?? 8,
      budgetMax: int.tryParse(_budgetMax.text) ?? 20,
      stepTarget: int.tryParse(_steps.text) ?? 8000,
      waterTargetMl: 2500,
      selectedSportMood: _mood,
    );
    await ref.read(fitServiceProvider).saveProfile(profile);
    if (!mounted) return;
    setState(() => _saving = false);
    context.go('/fit/today');
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final mood = sportMoodById(_mood);
    return Scaffold(
      appBar: AppBar(title: Text(l.t('fitSetupTitle'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        children: [
          _IntroCard(l: l),
          _Section(
            title: l.t('fitBodyBasics'),
            children: [
              Row(
                children: [
                  Expanded(child: _field(_height, l.t('fitHeight'), 'cm')),
                  const SizedBox(width: 10),
                  Expanded(child: _field(_weight, l.t('fitWeight'), 'kg')),
                ],
              ),
              Row(
                children: [
                  Expanded(child: _field(_age, l.t('fitAge'), '')),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _ChoiceMenu(
                      label: l.t('fitGender'),
                      value: _gender,
                      items: [
                        ('male', l.t('fitMale')),
                        ('female', l.t('fitFemale')),
                      ],
                      onChanged: (v) => setState(() => _gender = v),
                    ),
                  ),
                ],
              ),
            ],
          ),
          _Section(
            title: l.t('fitGoalTitle'),
            children: [
              _ChoiceWrap(
                value: _goal,
                options: [
                  ('healthyLifestyle', l.t('fitGoalHealthy')),
                  ('fatLoss', l.t('fitGoalFatLoss')),
                  ('leanBody', l.t('fitGoalLean')),
                  ('bodyRecomp', l.t('fitGoalRecomp')),
                  ('muscleGain', l.t('fitGoalMuscle')),
                  ('sportPerformance', l.t('fitGoalSport')),
                ],
                onChanged: (v) => setState(() => _goal = v),
              ),
              const SizedBox(height: 12),
              _ChoiceMenu(
                label: l.t('fitLevel'),
                value: _level,
                items: [
                  ('beginner', l.t('fitLevelBeginner')),
                  ('intermediate', l.t('fitLevelIntermediate')),
                  ('advanced', l.t('fitLevelAdvanced')),
                  ('athlete', l.t('fitLevelAthlete')),
                ],
                onChanged: (v) => setState(() => _level = v),
              ),
            ],
          ),
          _Section(
            title: l.t('fitTrainingPref'),
            children: [
              Text(l.t('fitDaysPerWeek'),
                  style: const TextStyle(fontWeight: FontWeight.w700)),
              Slider(
                value: _days.toDouble(),
                min: 1,
                max: 6,
                divisions: 5,
                label: '$_days',
                activeColor: AppColors.primaryRed,
                onChanged: (v) => setState(() => _days = v.round()),
              ),
              Text(l.t('fitSessionDuration'),
                  style: const TextStyle(fontWeight: FontWeight.w700)),
              Slider(
                value: _duration.toDouble(),
                min: 20,
                max: 90,
                divisions: 7,
                label: '$_duration min',
                activeColor: AppColors.primaryRed,
                onChanged: (v) => setState(() => _duration = v.round()),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(mood.icon, color: AppColors.primaryRed),
                title: Text(mood.name,
                    style: const TextStyle(fontWeight: FontWeight.w800)),
                subtitle: Text(mood.purpose),
                trailing: const Icon(Icons.chevron_right),
                onTap: () async {
                  final picked = await context.push<String>('/fit/sport-moods');
                  if (picked != null) setState(() => _mood = picked);
                },
              ),
            ],
          ),
          _Section(
            title: l.t('fitTargets'),
            children: [
              Row(
                children: [
                  Expanded(
                      child: _field(_budgetMin, l.t('fitBudgetMin'), 'RM')),
                  const SizedBox(width: 10),
                  Expanded(
                      child: _field(_budgetMax, l.t('fitBudgetMax'), 'RM')),
                ],
              ),
              _field(_steps, l.t('fitStepTarget'), l.t('fitStepsUnit')),
            ],
          ),
          FilledButton(
            onPressed: _saving ? null : _save,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primaryRed,
              minimumSize: const Size(0, 52),
            ),
            child: Text(
              _saving ? l.t('spinning') : l.t('fitSaveProfile'),
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
    );
  }

  Widget _field(TextEditingController c, String label, String suffix) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextField(
        controller: c,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: InputDecoration(
          labelText: label,
          suffixText: suffix.isEmpty ? null : suffix,
          filled: true,
          fillColor: AppColors.cardWhite,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: AppColors.softBorder),
          ),
        ),
      ),
    );
  }
}

class _IntroCard extends StatelessWidget {
  const _IntroCard({required this.l});

  final AppLocalizations l;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF0F766E), Color(0xFF16A34A)],
        ),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.monitor_heart_outlined,
              color: Colors.white, size: 32),
          const SizedBox(height: 10),
          Text(
            l.t('fitCoachTitle'),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            l.t('fitSetupBody'),
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.9),
              height: 1.4,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardWhite,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.softBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style:
                  const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }
}

class _ChoiceMenu extends StatelessWidget {
  const _ChoiceMenu({
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
  });

  final String label;
  final String value;
  final List<(String, String)> items;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      initialValue: value,
      decoration: InputDecoration(
        labelText: label,
        filled: true,
        fillColor: AppColors.cardWhite,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.softBorder),
        ),
      ),
      items: items
          .map((e) => DropdownMenuItem(value: e.$1, child: Text(e.$2)))
          .toList(),
      onChanged: (v) {
        if (v != null) onChanged(v);
      },
    );
  }
}

class _ChoiceWrap extends StatelessWidget {
  const _ChoiceWrap({
    required this.value,
    required this.options,
    required this.onChanged,
  });

  final String value;
  final List<(String, String)> options;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: options
          .map((o) => ChoiceChip(
                selected: value == o.$1,
                label: Text(o.$2),
                selectedColor: AppColors.softYellow,
                side: const BorderSide(color: AppColors.softBorder),
                onSelected: (_) => onChanged(o.$1),
              ))
          .toList(),
    );
  }
}
