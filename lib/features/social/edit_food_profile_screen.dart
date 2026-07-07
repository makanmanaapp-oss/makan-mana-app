import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers.dart';
import 'food_profile.dart';
import 'social_providers.dart';

/// Edit profil makanan awam: bio, kegemaran, diet/bajet (pilihan + privasi).
class EditFoodProfileScreen extends ConsumerStatefulWidget {
  const EditFoodProfileScreen({super.key});

  @override
  ConsumerState<EditFoodProfileScreen> createState() =>
      _EditFoodProfileScreenState();
}

class _EditFoodProfileScreenState
    extends ConsumerState<EditFoodProfileScreen> {
  final _bio = TextEditingController();
  final _food = TextEditingController();
  final _cuisine = TextEditingController();
  final _mood = TextEditingController();
  final _diet = TextEditingController();
  final _budget = TextEditingController();
  bool _showDiet = false;
  bool _showBudget = false;
  bool _loaded = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
      final p = ref.read(publicProfileProvider(uid)).value;
      if (p != null) {
        _bio.text = p.bio;
        _food.text = p.favouriteFood;
        _cuisine.text = p.favouriteCuisine;
        _mood.text = p.foodMood;
        _diet.text = p.dietPreference;
        _budget.text = p.budgetRange;
        _showDiet = p.showDiet;
        _showBudget = p.showBudget;
      }
      setState(() => _loaded = true);
    });
  }

  @override
  void dispose() {
    for (final c in [_bio, _food, _cuisine, _mood, _diet, _budget]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final l = AppLocalizations.of(context);
    setState(() => _saving = true);
    try {
      await ref.read(socialServiceProvider).updateFoodProfile({
        'bio': _bio.text.trim(),
        'favouriteFood': _food.text.trim(),
        'favouriteCuisine': _cuisine.text.trim(),
        'foodMood': _mood.text.trim(),
        'dietPreference': _diet.text.trim(),
        'budgetRange': _budget.text.trim(),
        'showDiet': _showDiet,
        'showBudget': _showBudget,
      });
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(l.t('profileSaved'))));
      }
    } catch (_) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(l.t('postFailed'))));
      }
    }
  }

  Widget _field(String label, TextEditingController c,
      {int maxLen = 40, int maxLines = 1, String? hint}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
        const SizedBox(height: 6),
        TextField(
          controller: c,
          maxLength: maxLen,
          maxLines: maxLines,
          decoration: InputDecoration(
            hintText: hint,
            filled: true,
            fillColor: AppColors.cardWhite,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.softBorder),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.softBorder),
            ),
          ),
        ),
        const SizedBox(height: 8),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.t('editFoodProfile'))),
      body: !_loaded
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
              children: [
                _field(l.t('bioLabel'), _bio, maxLen: 160, maxLines: 3,
                    hint: l.t('bioHint')),
                _field(l.t('favFoodLabel'), _food),
                _field(l.t('favCuisineLabel'), _cuisine),
                _field(l.t('foodMoodLabel'), _mood),
                const Divider(height: 28),
                Text(l.t('optionalPrivacyNote'),
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.mutedText)),
                const SizedBox(height: 10),
                _field(l.t('dietPrefLabel'), _diet),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _showDiet,
                  activeThumbColor: AppColors.primaryRed,
                  title: Text(l.t('showDietPublic'),
                      style: const TextStyle(fontSize: 13.5)),
                  onChanged: (v) => setState(() => _showDiet = v),
                ),
                _field(l.t('budgetRangeLabel'), _budget),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _showBudget,
                  activeThumbColor: AppColors.primaryRed,
                  title: Text(l.t('showBudgetPublic'),
                      style: const TextStyle(fontSize: 13.5)),
                  onChanged: (v) => setState(() => _showBudget = v),
                ),
                const SizedBox(height: 8),
                Text(l.t('privateNote'),
                    style: const TextStyle(
                        fontSize: 11.5, color: AppColors.mutedText)),
                const SizedBox(height: 18),
                ElevatedButton(
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : Text(l.t('saveAction')),
                ),
              ],
            ),
    );
  }
}
