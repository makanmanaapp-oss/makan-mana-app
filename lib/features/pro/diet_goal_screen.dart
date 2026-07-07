import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers.dart';

/// 🎯 Diet Goal (Pro): matlamat yang MENGUBAH algoritma cadangan —
/// disimpan di user_profiles.dietGoal, dibaca oleh getSuggestions.
class DietGoalScreen extends ConsumerStatefulWidget {
  const DietGoalScreen({super.key});

  @override
  ConsumerState<DietGoalScreen> createState() => _DietGoalScreenState();
}

class _DietGoalScreenState extends ConsumerState<DietGoalScreen> {
  String? _current;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    if (uid.isEmpty) {
      setState(() => _loaded = true);
      return;
    }
    try {
      final doc = await FirebaseFirestore.instance
          .collection('user_profiles')
          .doc(uid)
          .get()
          .timeout(const Duration(seconds: 8));
      if (mounted) {
        setState(() {
          _current = doc.data()?['dietGoal'] as String?;
          _loaded = true;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loaded = true);
    }
  }

  Future<void> _select(String goal) async {
    final l = AppLocalizations.of(context);
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    setState(() => _current = goal);
    await FirebaseFirestore.instance
        .collection('user_profiles')
        .doc(uid)
        .set({'dietGoal': goal}, SetOptions(merge: true));
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.t('goalSaved'))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final goals = [
      ('sihat', '🥗', l.t('goalSihat'), l.t('goalSihatDesc')),
      ('jimat', '💸', l.t('goalJimat'), l.t('goalJimatDesc')),
      ('seimbang', '⚖️', l.t('goalSeimbang'), l.t('goalSeimbangDesc')),
    ];

    return Scaffold(
      appBar: AppBar(title: Text(l.t('proGoalTitle'))),
      body: !_loaded
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                Text(
                  l.t('goalIntro'),
                  style: const TextStyle(
                    color: AppColors.mutedText,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 16),
                ...goals.map((g) {
                  final selected = _current == g.$1;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: InkWell(
                      onTap: () => _select(g.$1),
                      borderRadius: BorderRadius.circular(18),
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: selected
                              ? AppColors.softYellow
                              : AppColors.cardWhite,
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(
                            color: selected
                                ? AppColors.warmYellow
                                : AppColors.softBorder,
                            width: selected ? 2 : 1,
                          ),
                        ),
                        child: Row(
                          children: [
                            Text(g.$2,
                                style: const TextStyle(fontSize: 30)),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment:
                                    CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    g.$3,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 16,
                                      color: AppColors.darkText,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    g.$4,
                                    style: const TextStyle(
                                      color: AppColors.mutedText,
                                      fontSize: 12.5,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            if (selected)
                              const Icon(Icons.check_circle,
                                  color: AppColors.primaryRed),
                          ],
                        ),
                      ),
                    ),
                  );
                }),
              ],
            ),
    );
  }
}
