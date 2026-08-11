import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/utils/time_slot_utils.dart';
import 'fit_models.dart';
import 'fit_providers.dart';

/// Quick Log: hidangan Malaysia biasa dengan anggaran makro siap.
const List<Map<String, dynamic>> kQuickMeals = [
  {
    'n': 'Nasi campur (ayam + sayur)',
    'e': '🍛',
    'c': 650,
    'p': 38,
    'cb': 78,
    'f': 18,
    'h': true,
    's': false
  },
  {
    'n': 'Nasi lemak biasa',
    'e': '🥥',
    'c': 680,
    'p': 18,
    'cb': 82,
    'f': 30,
    'h': false,
    's': false
  },
  {
    'n': 'Nasi ayam',
    'e': '🍗',
    'c': 620,
    'p': 42,
    'cb': 72,
    'f': 16,
    'h': true,
    's': false
  },
  {
    'n': 'Mee goreng mamak',
    'e': '🍜',
    'c': 750,
    'p': 22,
    'cb': 92,
    'f': 30,
    'h': false,
    's': false
  },
  {
    'n': 'Roti telur + dhal',
    'e': '🫓',
    'c': 480,
    'p': 16,
    'cb': 58,
    'f': 20,
    'h': false,
    's': false
  },
  {
    'n': 'Ayam goreng + nasi',
    'e': '🍖',
    'c': 760,
    'p': 35,
    'cb': 74,
    'f': 34,
    'h': false,
    's': false
  },
  {
    'n': 'Sup ayam + nasi separuh',
    'e': '🍲',
    'c': 430,
    'p': 32,
    'cb': 45,
    'f': 10,
    'h': true,
    's': false
  },
  {
    'n': 'Salad / bowl sihat',
    'e': '🥗',
    'c': 420,
    'p': 38,
    'cb': 24,
    'f': 18,
    'h': true,
    's': false
  },
  {
    'n': 'Teh tarik / teh ais',
    'e': '🧋',
    'c': 180,
    'p': 4,
    'cb': 32,
    'f': 4,
    'h': false,
    's': true
  },
  {
    'n': 'Kopi O / air kosong',
    'e': '☕',
    'c': 5,
    'p': 0,
    'cb': 1,
    'f': 0,
    'h': true,
    's': false
  },
  {
    'n': 'Milo ais',
    'e': '🥤',
    'c': 230,
    'p': 5,
    'cb': 40,
    'f': 6,
    'h': false,
    's': true
  },
  {
    'n': 'Buah potong',
    'e': '🍉',
    'c': 90,
    'p': 1,
    'cb': 22,
    'f': 0,
    'h': true,
    's': false
  },
];

/// Sheet log makanan: tab Quick Log + Manual makro.
Future<void> showMealLogSheet(BuildContext context, WidgetRef ref) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.mm.appBackground,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (sheetContext) => Padding(
      padding: EdgeInsets.only(
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom),
      child: _MealLogSheet(ref: ref),
    ),
  );
}

class _MealLogSheet extends StatefulWidget {
  const _MealLogSheet({required this.ref});

  final WidgetRef ref;

  @override
  State<_MealLogSheet> createState() => _MealLogSheetState();
}

class _MealLogSheetState extends State<_MealLogSheet> {
  bool manual = false;
  final _name = TextEditingController();
  final _cal = TextEditingController();
  final _protein = TextEditingController();
  final _carbs = TextEditingController();
  final _fat = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    _cal.dispose();
    _protein.dispose();
    _carbs.dispose();
    _fat.dispose();
    super.dispose();
  }

  void _logQuick(Map<String, dynamic> m) {
    widget.ref.read(fitServiceProvider).logMeal(
          menuName: m['n'] as String,
          calories: m['c'] as int,
          proteinG: m['p'] as int,
          carbsG: m['cb'] as int,
          fatG: m['f'] as int,
          source: 'quick_log',
          isHealthy: m['h'] as bool,
          sugaryDrink: m['s'] as bool,
          mealTime: TimeSlotUtils.now(),
        );
    Navigator.pop(context);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(
          '${m['e']} ${m['n']} · ${m['c']} kcal ${AppLocalizations.of(context).t('fitLogged')}'),
      duration: const Duration(seconds: 2),
    ));
  }

  void _logManual() {
    final name = _name.text.trim();
    final cal = int.tryParse(_cal.text) ?? 0;
    if (name.isEmpty || cal <= 0) return;
    widget.ref.read(fitServiceProvider).logMeal(
          menuName: name,
          calories: cal,
          proteinG: int.tryParse(_protein.text) ?? 0,
          carbsG: int.tryParse(_carbs.text) ?? 0,
          fatG: int.tryParse(_fat.text) ?? 0,
          source: 'manual',
          isHealthy: true,
          mealTime: TimeSlotUtils.now(),
        );
    Navigator.pop(context);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(
          '$name · $cal kcal ${AppLocalizations.of(context).t('fitLogged')}'),
      duration: const Duration(seconds: 2),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    l.t('fitLogMealTitle'),
                    style: const TextStyle(
                        fontSize: 17, fontWeight: FontWeight.w800),
                  ),
                ),
                // Suis Quick <-> Manual.
                TextButton.icon(
                  onPressed: () => setState(() => manual = !manual),
                  style: TextButton.styleFrom(
                    minimumSize: const Size(88, 36),
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                  ),
                  icon: Icon(manual ? Icons.grid_view : Icons.edit_note,
                      size: 18),
                  label: Text(
                    manual ? l.t('fitQuickLog') : l.t('fitManualLog'),
                    style: const TextStyle(
                        fontSize: 12.5, fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            if (!manual)
              Flexible(
                child: SingleChildScrollView(
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: kQuickMeals
                        .map((m) => ActionChip(
                              onPressed: () => _logQuick(m),
                              backgroundColor: context.mm.card,
                              side:
                                  BorderSide(color: context.mm.border),
                              label: Text(
                                '${m['e']} ${m['n']} · ${m['c']}',
                                style: const TextStyle(
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w600),
                              ),
                            ))
                        .toList(),
                  ),
                ),
              )
            else ...[
              _field(_name, l.t('fitMealName'), text: true),
              Row(
                children: [
                  Expanded(child: _field(_cal, 'kcal')),
                  const SizedBox(width: 8),
                  Expanded(child: _field(_protein, 'Protein g')),
                ],
              ),
              Row(
                children: [
                  Expanded(child: _field(_carbs, 'Karbo g')),
                  const SizedBox(width: 8),
                  Expanded(child: _field(_fat, 'Lemak g')),
                ],
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _logManual,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primaryRed,
                    minimumSize: const Size(0, 48),
                  ),
                  child: Text(l.t('fitSaveLog'),
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _field(TextEditingController c, String hint, {bool text = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: TextField(
        controller: c,
        keyboardType: text ? TextInputType.text : TextInputType.number,
        decoration: InputDecoration(
          hintText: hint,
          isDense: true,
          filled: true,
          fillColor: context.mm.card,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: context.mm.border),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: context.mm.border),
          ),
        ),
      ),
    );
  }
}

/// Sheet nombor generik (langkah / air / berat).
Future<void> showNumberSheet(
  BuildContext context, {
  required String title,
  required String unit,
  required void Function(double value) onSave,
  List<int> quickValues = const [],
}) {
  final controller = TextEditingController();
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.mm.appBackground,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (sheetContext) => Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 16,
        bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style:
                  const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          if (quickValues.isNotEmpty) ...[
            Wrap(
              spacing: 8,
              children: quickValues
                  .map((v) => ActionChip(
                        onPressed: () {
                          Navigator.pop(sheetContext);
                          onSave(v.toDouble());
                        },
                        backgroundColor: context.mm.card,
                        side: BorderSide(color: context.mm.border),
                        label: Text('+$v $unit',
                            style: const TextStyle(
                                fontSize: 13, fontWeight: FontWeight.w700)),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 12),
          ],
          TextField(
            controller: controller,
            autofocus: quickValues.isEmpty,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              hintText: unit,
              isDense: true,
              filled: true,
              fillColor: context.mm.card,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: context.mm.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: context.mm.border),
              ),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () {
                final v = double.tryParse(controller.text);
                if (v == null || v <= 0) return;
                Navigator.pop(sheetContext);
                onSave(v);
              },
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primaryRed,
                minimumSize: const Size(0, 48),
              ),
              child: Text(AppLocalizations.of(context).t('fitSaveLog'),
                  style: const TextStyle(fontWeight: FontWeight.w800)),
            ),
          ),
        ],
      ),
    ),
  );
}

/// Sheet maklum balas selepas workout.
Future<void> showWorkoutFeedbackSheet(
  BuildContext context,
  WidgetRef ref,
  DailyPlan plan,
) {
  final l = AppLocalizations.of(context);
  final options = [
    (
      'done',
      l.t('fitFbDone'),
      Icons.check_circle_outline,
      AppColors.healthyGreen,
      'completed'
    ),
    (
      'tooEasy',
      l.t('fitFbEasy'),
      Icons.trending_up,
      AppColors.warmYellow,
      'completed'
    ),
    (
      'tooHard',
      l.t('fitFbHard'),
      Icons.trending_down,
      AppColors.warningOrange,
      'completed'
    ),
    (
      'noTime',
      l.t('fitFbNoTime'),
      Icons.schedule,
      context.mm.onCardMuted,
      'skipped'
    ),
    ('pain', l.t('fitFbPain'), Icons.healing, AppColors.primaryRed, 'skipped'),
  ];
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: context.mm.appBackground,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (sheetContext) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l.t('fitFbTitle'),
                style:
                    const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            ...options.map((o) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    onTap: () {
                      ref.read(fitServiceProvider).logWorkout(
                            plan_: plan,
                            status: o.$5,
                            feedback: o.$1,
                          );
                      Navigator.pop(sheetContext);
                      final isPain = o.$1 == 'pain';
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                        duration: Duration(seconds: isPain ? 5 : 2),
                        content: Text(isPain
                            ? l.t('fitPainWarning')
                            : l.t('fitFbThanks')),
                      ));
                    },
                    tileColor: context.mm.card,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                      side: BorderSide(color: context.mm.border),
                    ),
                    leading: Icon(o.$3, color: o.$4),
                    title: Text(o.$2,
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 14)),
                  ),
                )),
          ],
        ),
      ),
    ),
  );
}
