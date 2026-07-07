import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/widgets/place_image.dart';
import '../fit/fit_charts.dart';
import '../fit/fit_widgets.dart';
import 'wallet_models.dart';
import 'wallet_providers.dart';

String _rm(num v) => 'RM${v.toStringAsFixed(2)}';

/// Label jenis item mengikut bahasa semasa.
String itemTypeLabel(AppLocalizations l, String type) => switch (type) {
      'drink' => l.t('itemDrink'),
      'dessert' => l.t('itemDessert'),
      'add_on' => l.t('itemAddon'),
      'service' => l.t('itemService'),
      'delivery' => l.t('itemDelivery'),
      _ => l.t('itemFood'),
    };

/// /meal-wallet - dashboard Meal Wallet.
class MealWalletScreen extends ConsumerWidget {
  const MealWalletScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final access = ref.watch(walletAccessProvider);
    final summary = ref.watch(spendSummaryProvider);
    final budget =
        ref.watch(budgetProfileProvider).value ?? const BudgetProfile();
    final expenses = ref.watch(monthExpensesProvider).value ?? const [];
    final insights = ref.watch(coachInsightsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l.t('mealWalletTitle')),
        actions: [
          IconButton(
            tooltip: l.t('walletBudgetTip'),
            onPressed: () => context.push('/meal-wallet/budget'),
            icon: const Icon(Icons.tune),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/meal-wallet/add'),
        backgroundColor: AppColors.primaryRed,
        icon: const Icon(Icons.add, color: Colors.white),
        label: Text(l.t('walletLogMeal'),
            style: const TextStyle(
                color: Colors.white, fontWeight: FontWeight.w800)),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 100),
        children: [
          // Ringkasan hari/minggu/bulan.
          Container(
            margin: const EdgeInsets.only(bottom: 14),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppColors.primaryRed, Color(0xFFFF6B45)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l.t('walletTotalToday'),
                    style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(
                  '${_rm(summary.today)} / RM${budget.dailyBudget.round()}',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 26,
                      fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    _headStat(l.t('walletThisWeek'),
                        '${_rm(summary.week)} / RM${budget.weeklyBudget.round()}'),
                    const SizedBox(width: 18),
                    _headStat(l.t('walletThisMonth'),
                        '${_rm(summary.month)} / RM${budget.monthlyBudget.round()}'),
                  ],
                ),
              ],
            ),
          ),

          // Budget Coach (Pro; preview terkunci untuk lain).
          if (access == WalletAccess.pro)
            ...insights.map((t) => CoachInsightCard(text: t))
          else
            LockedProOverlay(
              locked: true,
              child: CoachInsightCard(text: l.t('walletBudgetSample')),
            ),

          // Bar bajet.
          FitSectionCard(
            title: l.t('walletRemaining'),
            child: Column(
              children: [
                TargetBar(
                    label: l.t('walletToday'),
                    value: summary.today,
                    target: budget.dailyBudget,
                    unit: '',
                    color: AppColors.primaryRed),
                TargetBar(
                    label: l.t('walletWeek'),
                    value: summary.week,
                    target: budget.weeklyBudget,
                    unit: '',
                    color: AppColors.warningOrange),
                TargetBar(
                    label: l.t('walletMonth'),
                    value: summary.month,
                    target: budget.monthlyBudget,
                    unit: '',
                    color: const Color(0xFF7C3AED)),
              ],
            ),
          ),

          // Statistik pantas.
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.6,
            children: [
              MetricCard(
                icon: Icons.receipt_long_outlined,
                value: '${summary.mealCount}',
                label: l.t('walletLogCount'),
              ),
              MetricCard(
                icon: Icons.local_cafe_outlined,
                value: _rm(summary.drinkSpend),
                label: l.t('walletDrinkSpend'),
                color: const Color(0xFF0EA5E9),
              ),
              MetricCard(
                icon: Icons.trending_up,
                value: _rm(summary.avgPerMeal),
                label: l.t('walletAvgMeal'),
                color: AppColors.healthyGreen,
              ),
              MetricCard(
                icon: Icons.storefront_outlined,
                value: summary.topPlace ?? '-',
                label: l.t('walletTopPlace'),
                color: AppColors.warningOrange,
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Timeline log.
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(l.t('walletRecentLog'),
                style: const TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w800)),
          ),
          if (expenses.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: Text(l.t('walletNoLog'),
                    style: const TextStyle(
                        color: AppColors.mutedText,
                        fontWeight: FontWeight.w600)),
              ),
            )
          else
            ...expenses.take(30).map((e) => _ExpenseTile(expense: e)),
        ],
      ),
    );
  }

  Widget _headStat(String label, String value) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700)),
            Text(value,
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800)),
          ],
        ),
      );
}

class _ExpenseTile extends ConsumerWidget {
  const _ExpenseTile({required this.expense});

  final MealExpense expense;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final e = expense;
    final name = e.placeNameSnapshot.isNotEmpty
        ? e.placeNameSnapshot
        : (e.items.isNotEmpty ? e.items.first.itemName : l.t('walletMealFallback'));
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        onTap: () => _showDetail(context, ref),
        tileColor: AppColors.cardWhite,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.softBorder),
        ),
        leading: PlaceImage(
          name: name,
          photoUrl: e.foodPhotoUrl,
          height: 46,
          width: 46,
          borderRadius: 13,
          monogramFontSize: 15,
        ),
        title: Text(name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(
          '${_dateLabel(e.dateKey)} • ${e.mealType}'
          '${e.isGroupMeal ? ' • Tong-Tong' : ''}',
          style: const TextStyle(fontSize: 12),
        ),
        trailing: Text(_rm(e.totalSpend),
            style: const TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 14.5,
                color: AppColors.darkText)),
      ),
    );
  }

  static String _dateLabel(String k) => k.length == 8
      ? '${int.parse(k.substring(6))}/${int.parse(k.substring(4, 6))}'
      : k;

  void _showDetail(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final e = expense;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.creamBackground,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      e.placeNameSnapshot.isNotEmpty
                          ? e.placeNameSnapshot
                          : l.t('walletLogFallback'),
                      style: const TextStyle(
                          fontSize: 17, fontWeight: FontWeight.w800),
                    ),
                  ),
                  Text(_rm(e.totalSpend),
                      style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: AppColors.primaryRed)),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                '${_dateLabel(e.dateKey)} • ${e.mealType} • '
                '${e.paymentMethod}${e.notes != null ? '\n${e.notes}' : ''}',
                style: const TextStyle(
                    color: AppColors.mutedText,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 10),
              ...e.items.map((i) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(
                      children: [
                        Icon(
                          i.itemType == 'drink'
                              ? Icons.local_cafe_outlined
                              : Icons.restaurant,
                          size: 15,
                          color: AppColors.mutedText,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '${i.itemName}'
                            '${i.quantity > 1 ? ' x${i.quantity}' : ''}',
                            style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600),
                          ),
                        ),
                        Text(_rm(i.lineTotal),
                            style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700)),
                      ],
                    ),
                  )),
              if (e.receiptPhotoUrl != null || e.foodPhotoUrl != null) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    if (e.foodPhotoUrl != null)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: PlaceImage(
                            name: 'F',
                            photoUrl: e.foodPhotoUrl,
                            height: 84,
                            width: 84,
                            borderRadius: 14),
                      ),
                    if (e.receiptPhotoUrl != null)
                      PlaceImage(
                          name: 'R',
                          photoUrl: e.receiptPhotoUrl,
                          height: 84,
                          width: 84,
                          borderRadius: 14),
                  ],
                ),
              ],
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () {
                        ref
                            .read(walletServiceProvider)
                            .deleteExpense(e.id);
                        Navigator.pop(sheetContext);
                      },
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 44),
                        foregroundColor: AppColors.primaryRed,
                      ),
                      icon: const Icon(Icons.delete_outline, size: 18),
                      label: Text(l.t('walletDelete'),
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: () {
                        Navigator.pop(sheetContext);
                        context.push('/tong-tong/create', extra: e);
                      },
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primaryRed,
                        minimumSize: const Size(0, 44),
                      ),
                      icon: const Icon(Icons.groups_outlined, size: 18),
                      label: const Text('Tong-Tong',
                          style: TextStyle(fontWeight: FontWeight.w800)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// /meal-wallet/budget - tetapan bajet (Plus+).
class BudgetSettingsScreen extends ConsumerStatefulWidget {
  const BudgetSettingsScreen({super.key});

  @override
  ConsumerState<BudgetSettingsScreen> createState() =>
      _BudgetSettingsScreenState();
}

class _BudgetSettingsScreenState
    extends ConsumerState<BudgetSettingsScreen> {
  final _daily = TextEditingController();
  final _weekly = TextEditingController();
  final _monthly = TextEditingController();
  String _mode = 'balanced';
  bool _loaded = false;

  @override
  void dispose() {
    _daily.dispose();
    _weekly.dispose();
    _monthly.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final access = ref.watch(walletAccessProvider);
    final budget =
        ref.watch(budgetProfileProvider).value ?? const BudgetProfile();
    if (!_loaded) {
      _daily.text = budget.dailyBudget.round().toString();
      _weekly.text = budget.weeklyBudget.round().toString();
      _monthly.text = budget.monthlyBudget.round().toString();
      _mode = budget.budgetMode;
      _loaded = true;
    }

    final body = ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        FitSectionCard(
          title: l.t('walletBudgetLimit'),
          child: Column(
            children: [
              _field(_daily, l.t('walletDaily')),
              _field(_weekly, l.t('walletWeekly')),
              _field(_monthly, l.t('walletMonthly')),
            ],
          ),
        ),
        FitSectionCard(
          title: l.t('walletBudgetStyle'),
          child: Wrap(
            spacing: 8,
            children: [
              ('relaxed', l.t('walletModeRelaxed')),
              ('balanced', l.t('walletModeBalanced')),
              ('strict', l.t('walletModeStrict')),
            ]
                .map((m) => ChoiceChip(
                      selected: _mode == m.$1,
                      label: Text(m.$2),
                      selectedColor: AppColors.softYellow,
                      onSelected: (v) => setState(() => _mode = m.$1),
                    ))
                .toList(),
          ),
        ),
        FilledButton(
          onPressed: () {
            ref.read(walletServiceProvider).saveBudget(BudgetProfile(
                  dailyBudget: double.tryParse(_daily.text) ?? 40,
                  weeklyBudget: double.tryParse(_weekly.text) ?? 250,
                  monthlyBudget: double.tryParse(_monthly.text) ?? 900,
                  budgetMode: _mode,
                ));
            ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(l.t('walletBudgetSaved'))));
            context.pop();
          },
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.primaryRed,
            minimumSize: const Size(0, 52),
          ),
          child: Text(l.t('walletSaveBudget'),
              style: const TextStyle(fontWeight: FontWeight.w800)),
        ),
      ],
    );

    return Scaffold(
      appBar: AppBar(title: const Text('Budget Coach')),
      body: access == WalletAccess.free
          ? LockedProOverlay(locked: true, child: body)
          : body,
    );
  }

  Widget _field(TextEditingController c, String label) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextField(
          controller: c,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(
            labelText: label,
            prefixText: 'RM ',
            filled: true,
            fillColor: AppColors.creamBackground,
            border:
                OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
          ),
        ),
      );
}

/// /meal-wallet/add - borang log belanja (minimum: total + tarikh).
class AddExpenseScreen extends ConsumerStatefulWidget {
  const AddExpenseScreen({super.key, this.placeId, this.placeName});

  final String? placeId;
  final String? placeName;

  @override
  ConsumerState<AddExpenseScreen> createState() =>
      _AddExpenseScreenState();
}

class _AddExpenseScreenState extends ConsumerState<AddExpenseScreen> {
  final _place = TextEditingController();
  final _total = TextEditingController();
  final _notes = TextEditingController();
  final List<MealItem> _items = [];
  String _mealType = 'lunch';
  String _payment = 'cash';
  File? _foodPhoto;
  File? _receiptPhoto;
  bool _saving = false;
  int _rating = 0;

  @override
  void initState() {
    super.initState();
    _place.text = widget.placeName ?? '';
  }

  @override
  void dispose() {
    _place.dispose();
    _total.dispose();
    _notes.dispose();
    super.dispose();
  }

  double get _itemsTotal =>
      _items.fold(0.0, (s, i) => s + i.lineTotal);

  Future<void> _pickPhoto(bool receipt) async {
    final picked = await ImagePicker().pickImage(
        source: ImageSource.gallery, maxWidth: 1280, imageQuality: 75);
    if (picked != null && mounted) {
      setState(() {
        if (receipt) {
          _receiptPhoto = File(picked.path);
        } else {
          _foodPhoto = File(picked.path);
        }
      });
    }
  }

  Future<void> _save() async {
    final total = double.tryParse(_total.text) ??
        (_itemsTotal > 0 ? _itemsTotal : 0);
    if (total <= 0 || _saving) return;
    setState(() => _saving = true);
    final service = ref.read(walletServiceProvider);
    String? foodUrl;
    String? receiptUrl;
    if (_foodPhoto != null) {
      foodUrl = await service.uploadPhoto(_foodPhoto!, 'food');
    }
    if (_receiptPhoto != null) {
      receiptUrl = await service.uploadPhoto(_receiptPhoto!, 'receipt');
    }
    await service.addExpense(
      totalSpend: total,
      date: DateTime.now(),
      placeId: widget.placeId,
      placeName: _place.text.trim(),
      mealType: _mealType,
      paymentMethod: _payment,
      items: _items,
      foodPhotoUrl: foodUrl,
      receiptPhotoUrl: receiptUrl,
      notes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
      satisfactionRating: _rating == 0 ? null : _rating,
      source: widget.placeId != null ? 'restaurant_detail' : 'manual',
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('${_rm(total)} ${AppLocalizations.of(context).t('walletRecorded')}')));
    context.pop();
  }

  void _addItemSheet() {
    final l = AppLocalizations.of(context);
    final name = TextEditingController();
    final price = TextEditingController();
    var type = 'food';
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.creamBackground,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (builderContext, setSheet) => Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 18,
            bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l.t('walletAddItem'),
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              TextField(
                controller: name,
                autofocus: true,
                decoration: InputDecoration(
                  hintText: l.t('walletItemNameHint'),
                  filled: true,
                  fillColor: AppColors.cardWhite,
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: price,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(
                  hintText: l.t('walletPriceHint'),
                  filled: true,
                  fillColor: AppColors.cardWhite,
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                children: [
                  ('food', l.t('itemFood')),
                  ('drink', l.t('itemDrink')),
                  ('dessert', l.t('itemDessert')),
                  ('add_on', l.t('itemAddon')),
                  ('service', l.t('itemService')),
                  ('delivery', l.t('itemDelivery')),
                ]
                    .map((t) => ChoiceChip(
                          selected: type == t.$1,
                          label: Text(t.$2,
                              style: const TextStyle(fontSize: 12)),
                          selectedColor: AppColors.softYellow,
                          onSelected: (v) =>
                              setSheet(() => type = t.$1),
                        ))
                    .toList(),
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () {
                  final p = double.tryParse(price.text) ?? 0;
                  if (name.text.trim().isEmpty || p <= 0) return;
                  setState(() {
                    _items.add(MealItem(
                        itemName: name.text.trim(),
                        itemType: type,
                        price: p));
                    _total.text =
                        _itemsTotal.toStringAsFixed(2);
                  });
                  ref
                      .read(walletServiceProvider)
                      .logEvent('meal_item_added');
                  Navigator.pop(sheetContext);
                },
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primaryRed,
                  minimumSize: const Size.fromHeight(48),
                ),
                child: Text(l.t('walletAdd'),
                    style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final access = ref.watch(walletAccessProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l.t('walletLogMeal'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          TextField(
            controller: _place,
            decoration: InputDecoration(
              labelText: l.t('walletPlaceOptional'),
              filled: true,
              fillColor: AppColors.cardWhite,
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14)),
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _total,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            style: const TextStyle(
                fontSize: 22, fontWeight: FontWeight.w800),
            decoration: InputDecoration(
              labelText: l.t('walletTotalRequired'),
              filled: true,
              fillColor: AppColors.cardWhite,
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14)),
            ),
          ),
          const SizedBox(height: 12),

          // Item (pilihan).
          FitSectionCard(
            title: l.t('walletItemOptional'),
            trailing: TextButton.icon(
              onPressed: _addItemSheet,
              style: TextButton.styleFrom(
                minimumSize: const Size(60, 32),
                padding: const EdgeInsets.symmetric(horizontal: 8),
              ),
              icon: const Icon(Icons.add, size: 16),
              label: Text(l.t('walletItem'),
                  style: const TextStyle(
                      fontSize: 12.5, fontWeight: FontWeight.w800)),
            ),
            child: _items.isEmpty
                ? Text(
                    l.t('walletItemHint'),
                    style: const TextStyle(
                        color: AppColors.mutedText,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600))
                : Column(
                    children: _items
                        .asMap()
                        .entries
                        .map((entry) => Padding(
                              padding: const EdgeInsets.symmetric(
                                  vertical: 3),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(entry.value.itemName,
                                        style: const TextStyle(
                                            fontSize: 13.5,
                                            fontWeight:
                                                FontWeight.w600)),
                                  ),
                                  Text(_rm(entry.value.lineTotal),
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w700)),
                                  IconButton(
                                    onPressed: () => setState(() {
                                      _items.removeAt(entry.key);
                                      _total.text = _itemsTotal
                                          .toStringAsFixed(2);
                                    }),
                                    icon: const Icon(Icons.close,
                                        size: 16,
                                        color: AppColors.mutedText),
                                  ),
                                ],
                              ),
                            ))
                        .toList(),
                  ),
          ),

          // Jenis makan + bayaran.
          FitSectionCard(
            title: l.t('walletDetails'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    'breakfast',
                    'lunch',
                    'tea',
                    'dinner',
                    'supper',
                    'snack',
                  ]
                      .map((t) => ChoiceChip(
                            selected: _mealType == t,
                            label: Text(t,
                                style: const TextStyle(fontSize: 12)),
                            selectedColor: AppColors.softYellow,
                            onSelected: (v) =>
                                setState(() => _mealType = t),
                          ))
                      .toList(),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    'cash',
                    'duitnow',
                    'tng',
                    'card',
                    'grabpay',
                    'boost',
                    'shopeepay',
                  ]
                      .map((t) => ChoiceChip(
                            selected: _payment == t,
                            label: Text(t,
                                style: const TextStyle(fontSize: 12)),
                            selectedColor: AppColors.softYellow,
                            onSelected: (v) =>
                                setState(() => _payment = t),
                          ))
                      .toList(),
                ),
                const SizedBox(height: 10),
                Row(
                  children: List.generate(
                    5,
                    (i) => IconButton(
                      onPressed: () =>
                          setState(() => _rating = i + 1),
                      icon: Icon(
                        i < _rating
                            ? Icons.star
                            : Icons.star_border,
                        color: AppColors.warmYellow,
                        size: 26,
                      ),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(
                          minWidth: 34, minHeight: 34),
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Foto (Plus+).
          FitSectionCard(
            title: l.t('walletPhotoTitle'),
            child: access == WalletAccess.free
                ? Text(
                    l.t('walletPhotoUpsell'),
                    style: const TextStyle(
                        color: AppColors.mutedText,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600))
                : Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => _pickPhoto(false),
                          style: OutlinedButton.styleFrom(
                              minimumSize: const Size(0, 44)),
                          icon: Icon(
                              _foodPhoto == null
                                  ? Icons.restaurant
                                  : Icons.check_circle,
                              size: 17,
                              color: _foodPhoto == null
                                  ? null
                                  : AppColors.healthyGreen),
                          label: Text(l.t('itemFood'),
                              style: const TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w700)),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => _pickPhoto(true),
                          style: OutlinedButton.styleFrom(
                              minimumSize: const Size(0, 44)),
                          icon: Icon(
                              _receiptPhoto == null
                                  ? Icons.receipt_long_outlined
                                  : Icons.check_circle,
                              size: 17,
                              color: _receiptPhoto == null
                                  ? null
                                  : AppColors.healthyGreen),
                          label: Text(l.t('walletReceipt'),
                              style: const TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w700)),
                        ),
                      ),
                    ],
                  ),
          ),
          TextField(
            controller: _notes,
            decoration: InputDecoration(
              labelText: l.t('walletNoteOptional'),
              filled: true,
              fillColor: AppColors.cardWhite,
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14)),
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _saving ? null : _save,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primaryRed,
              minimumSize: const Size(0, 52),
            ),
            child: Text(_saving ? l.t('walletSaving') : l.t('walletSaveToWallet'),
                style: const TextStyle(
                    fontWeight: FontWeight.w800, fontSize: 15)),
          ),
        ],
      ),
    );
  }
}
