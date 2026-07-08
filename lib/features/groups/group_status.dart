import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../social/social_providers.dart';
import 'group_providers.dart';

/// Sheet kongsi status makan dalam grup.
/// Status kesihatan/fitness peribadi - hanya dikongsi jika ditogol ON.
Future<void> showShareStatusSheet(BuildContext context, String groupId) {
  return Navigator.of(context).push(MaterialPageRoute<void>(
    fullscreenDialog: true,
    builder: (ctx) => _ShareStatusSheet(groupId: groupId),
  ));
}

const _hungerLevels = ['😋 Boleh tahan', '😐 Sederhana', '🤤 Lapar gila'];
const _budgetLevels = ['💸 Jimat', '💵 Sederhana', '🤑 Belanja best'];

class _ShareStatusSheet extends ConsumerStatefulWidget {
  const _ShareStatusSheet({required this.groupId});
  final String groupId;

  @override
  ConsumerState<_ShareStatusSheet> createState() => _ShareStatusSheetState();
}

class _ShareStatusSheetState extends ConsumerState<_ShareStatusSheet> {
  String? _hunger;
  String? _budget;
  final _mood = TextEditingController();
  final _cuisine = TextEditingController();
  final _allergy = TextEditingController();
  final _area = TextEditingController();
  final _fitness = TextEditingController();
  bool _shareFitness = false;
  bool _sending = false;

  @override
  void dispose() {
    for (final c in [_mood, _cuisine, _allergy, _area, _fitness]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _sending = true);
    try {
      await ref.read(socialServiceProvider).setGroupStatus(widget.groupId, {
        'hungerLevel': _hunger,
        'budget': _budget,
        'mood': _mood.text.trim(),
        'cuisine': _cuisine.text.trim(),
        'allergyWarning': _allergy.text.trim(),
        'locationArea': _area.text.trim(),
        'fitnessGoal': _shareFitness ? _fitness.text.trim() : '',
      });
      if (mounted) Navigator.pop(context);
    } catch (_) {
      if (mounted) setState(() => _sending = false);
    }
  }

  Widget _field(String label, TextEditingController c, String hint) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          const SizedBox(height: 6),
          TextField(
            controller: c,
            maxLength: 40,
            decoration: InputDecoration(
              counterText: '',
              hintText: hint,
              filled: true,
              fillColor: AppColors.cardWhite,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          const SizedBox(height: 10),
        ],
      );

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.creamBackground,
      appBar: AppBar(
        backgroundColor: AppColors.creamBackground,
        title: Text(l.t('shareStatus')),
      ),
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 8),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                    Text(l.t('shareStatusDesc'),
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.mutedText)),
                    const SizedBox(height: 14),
                    Text(l.t('hungerLevel'),
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 13)),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      children: [
                        for (final h in _hungerLevels)
                          ChoiceChip(
                            selected: _hunger == h,
                            label: Text(h),
                            selectedColor: AppColors.softYellow,
                            onSelected: (_) => setState(() => _hunger = h),
                          ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(l.t('pollBudget'),
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 13)),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      children: [
                        for (final b in _budgetLevels)
                          ChoiceChip(
                            selected: _budget == b,
                            label: Text(b),
                            selectedColor: AppColors.softYellow,
                            onSelected: (_) => setState(() => _budget = b),
                          ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    _field(l.t('foodMoodLabel'), _mood, l.t('statusMoodHint')),
                    _field(l.t('favCuisineLabel'), _cuisine,
                        l.t('statusCuisineHint')),
                    _field(l.t('allergyWarning'), _allergy,
                        l.t('statusAllergyHint')),
                    _field(l.t('locationArea'), _area, l.t('statusAreaHint')),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      value: _shareFitness,
                      activeThumbColor: AppColors.primaryRed,
                      title: Text(l.t('shareFitnessGoal'),
                          style: const TextStyle(fontSize: 13.5)),
                      subtitle: Text(l.t('fitnessPrivateNote'),
                          style: const TextStyle(fontSize: 11.5)),
                      onChanged: (v) => setState(() => _shareFitness = v),
                    ),
                    if (_shareFitness)
                      _field(l.t('fitnessGoalLabel'), _fitness,
                          l.t('statusFitnessHint')),
                  ],
                ),
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _sending ? null : _save,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primaryRed,
                      minimumSize: const Size(0, 50),
                    ),
                    child: _sending
                        ? const SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                        : Text(l.t('shareStatus'),
                            style: const TextStyle(
                                fontWeight: FontWeight.w800, fontSize: 15)),
                  ),
                ),
              ),
            ),
          ],
        ),
      );
  }
}

/// Jalur status ahli grup (mendatar).
class GroupStatusStrip extends ConsumerWidget {
  const GroupStatusStrip({super.key, required this.groupId});

  final String groupId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final statuses = ref.watch(groupStatusProvider(groupId)).value ?? const [];
    final active = statuses.where(_hasAny).toList();
    if (active.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(l.t('groupStatusTitle'),
            style: const TextStyle(
                color: AppColors.threadsMuted,
                fontWeight: FontWeight.w800,
                fontSize: 12)),
        const SizedBox(height: 8),
        SizedBox(
          height: 92,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: active.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (context, i) => _statusChip(active[i]),
          ),
        ),
        const SizedBox(height: 12),
      ],
    );
  }

  bool _hasAny(Map<String, dynamic> s) =>
      [s['hungerLevel'], s['budget'], s['mood'], s['cuisine'],
              s['allergyWarning'], s['locationArea'], s['fitnessGoal']]
          .any((v) => v is String && v.isNotEmpty);

  Widget _statusChip(Map<String, dynamic> s) {
    final bits = <String>[
      for (final k in [
        'hungerLevel',
        'budget',
        'mood',
        'cuisine',
        'allergyWarning',
        'locationArea',
        'fitnessGoal'
      ])
        if (s[k] is String && (s[k] as String).isNotEmpty) s[k] as String,
    ];
    return Container(
      width: 160,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.threadsSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.threadsBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(s['displayName'] as String? ?? 'Foodie',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  color: AppColors.threadsText,
                  fontWeight: FontWeight.w800,
                  fontSize: 13)),
          const SizedBox(height: 4),
          Expanded(
            child: Text(bits.take(3).join(' • '),
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    color: AppColors.threadsMuted, fontSize: 11.5)),
          ),
        ],
      ),
    );
  }
}
