import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers.dart';
import '../fit/fit_widgets.dart';
import '../social/social_providers.dart';
import '../wallet/wallet_models.dart';
import '../wallet/wallet_providers.dart';
import 'tongtong_service.dart';

String _rm(num v) => 'RM${v.toStringAsFixed(2)}';

/// /tong-tong - senarai bil Tong-Tong.
class TongTongListScreen extends ConsumerWidget {
  const TongTongListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final bills = ref.watch(myBillsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l.t('tongTongTitle'))),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/tong-tong/create'),
        backgroundColor: AppColors.primaryRed,
        icon: const Icon(Icons.add, color: Colors.white),
        label: Text(l.t('ttBillNew'),
            style: const TextStyle(
                color: Colors.white, fontWeight: FontWeight.w800)),
      ),
      body: bills.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, st) => Center(child: Text('😕 $e')),
        data: (list) {
          if (list.isEmpty) {
            return const _EmptyBills();
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 100),
            children: [
              Container(
                margin: const EdgeInsets.only(bottom: 14),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.softYellow,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  l.t('ttListIntro'),
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, height: 1.4, fontSize: 13),
                ),
              ),
              ...list.map((b) => _BillCard(billId: b.$1, data: b.$2)),
            ],
          );
        },
      ),
    );
  }
}

class _EmptyBills extends StatelessWidget {
  const _EmptyBills();

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.groups_outlined,
                size: 60, color: AppColors.primaryRed),
            const SizedBox(height: 14),
            Text(l.t('ttNoBills'),
                style: const TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text(
              l.t('ttEmptyDesc'),
              textAlign: TextAlign.center,
              style: const TextStyle(
                  color: AppColors.mutedText, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => context.push('/tong-tong/create'),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primaryRed,
                minimumSize: const Size(220, 48),
              ),
              child: Text(l.t('ttMakeBill'),
                  style: const TextStyle(fontWeight: FontWeight.w800)),
            ),
          ],
        ),
      ),
    );
  }
}

class _BillCard extends StatelessWidget {
  const _BillCard({required this.billId, required this.data});

  final String billId;
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final status = data['status'] as String? ?? 'active';
    final parts = ((data['participants'] as List?) ?? const [])
        .map((e) => TtParticipant.fromMap(Map<String, dynamic>.from(e as Map)))
        .toList();
    final unpaid =
        parts.where((p) => p.paymentStatus == 'unpaid').length;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        onTap: () => context.push('/tong-tong/$billId'),
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.cardWhite,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.softBorder),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      data['placeNameSnapshot'] as String? ?? l.t('ttBillFallback'),
                      style: const TextStyle(
                          fontSize: 15.5, fontWeight: FontWeight.w800),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  _StatusChip(status: status),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                '${_rm((data['totalAmount'] as num?)?.toDouble() ?? 0)} • '
                '${parts.length} ${l.t('ttPeople')}'
                '${unpaid > 0 ? ' • $unpaid ${l.t('ttUnpaidSuffix')}' : ' • ${l.t('ttAllDone')}'}',
                style: const TextStyle(
                    fontSize: 12.5,
                    color: AppColors.mutedText,
                    fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final (label, color) = switch (status) {
      'settled' => (l.t('billSettled'), AppColors.healthyGreen),
      'cancelled' => (l.t('ttStatusCancelled'), AppColors.mutedText),
      _ => (l.t('billActive'), AppColors.warningOrange),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.13),
        borderRadius: BorderRadius.circular(9),
      ),
      child: Text(label,
          style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: Color.lerp(color, Colors.black, 0.25))),
    );
  }
}

/// /tong-tong/create - buat bil.
class CreateBillScreen extends ConsumerStatefulWidget {
  const CreateBillScreen({super.key, this.seed});

  final MealExpense? seed;

  @override
  ConsumerState<CreateBillScreen> createState() => _CreateBillScreenState();
}

class _CreateBillScreenState extends ConsumerState<CreateBillScreen> {
  final _place = TextEditingController();
  final _total = TextEditingController();
  final List<TtParticipant> _participants = [];
  final List<TtItem> _items = [];
  String _method = 'equal';
  String _payer = '';

  @override
  void initState() {
    super.initState();
    final seed = widget.seed;
    if (seed != null) {
      _place.text = seed.placeNameSnapshot;
      _total.text = seed.totalSpend.toStringAsFixed(2);
      for (final i in seed.items) {
        _items.add(TtItem(itemName: i.itemName, price: i.price));
      }
    }
    // Peserta pertama = saya.
    final myName = ref.read(myDisplayNameProvider).value ?? 'Saya';
    final myUid = ref.read(authRepositoryProvider).currentUser?.uid;
    _participants.add(TtParticipant(name: myName, uid: myUid));
    _payer = myName;
  }

  @override
  void dispose() {
    _place.dispose();
    _total.dispose();
    super.dispose();
  }

  double get _itemsTotal => _items.fold(0.0, (s, i) => s + i.lineTotal);

  void _addParticipant() {
    final l = AppLocalizations.of(context);
    final name = TextEditingController();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.creamBackground,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => Padding(
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
            Text(l.t('ttAddParticipant'),
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            TextField(
              controller: name,
              autofocus: true,
              textCapitalization: TextCapitalization.words,
              decoration: InputDecoration(
                hintText: l.t('ttFriendName'),
                filled: true,
                fillColor: AppColors.cardWhite,
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () {
                final n = name.text.trim();
                if (n.isEmpty ||
                    _participants.any((p) => p.name == n)) {
                  Navigator.pop(sheetContext);
                  return;
                }
                setState(() => _participants.add(TtParticipant(name: n)));
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
    );
  }

  void _addItem() {
    final l = AppLocalizations.of(context);
    final name = TextEditingController();
    final price = TextEditingController();
    final assigned = <String>{};
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
                  hintText: l.t('ttItemName'),
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
              if (_method == 'by_item') ...[
                const SizedBox(height: 10),
                Text(l.t('ttWhoEats'),
                    style: const TextStyle(
                        fontSize: 12.5, fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: _participants
                      .map((p) => FilterChip(
                            selected: assigned.contains(p.name),
                            label: Text(p.name,
                                style: const TextStyle(fontSize: 12)),
                            selectedColor: AppColors.softYellow,
                            onSelected: (v) => setSheet(() {
                              v
                                  ? assigned.add(p.name)
                                  : assigned.remove(p.name);
                            }),
                          ))
                      .toList(),
                ),
              ],
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () {
                  final p = double.tryParse(price.text) ?? 0;
                  if (name.text.trim().isEmpty || p <= 0) return;
                  setState(() {
                    _items.add(TtItem(
                      itemName: name.text.trim(),
                      price: p,
                      assignedTo: assigned.toList(),
                    ));
                    _total.text = _itemsTotal.toStringAsFixed(2);
                  });
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

  Future<void> _create() async {
    final l = AppLocalizations.of(context);
    final total = double.tryParse(_total.text) ??
        (_itemsTotal > 0 ? _itemsTotal : 0);
    if (total <= 0 || _participants.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l.t('ttNeedTotal2'))));
      return;
    }
    final id = await ref.read(tongTongServiceProvider).createBill(
          placeName: _place.text.trim().isEmpty
              ? l.t('ttBillFallback')
              : _place.text.trim(),
          total: total,
          method: _method,
          payerName: _payer,
          participants: _participants,
          items: _items,
        );
    if (!mounted) return;
    if (id != null) {
      context.pushReplacement('/tong-tong/$id');
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final access = ref.watch(walletAccessProvider);
    // Free: hanya equal split.
    final methods = access == WalletAccess.free
        ? [('equal', l.t('splitEqual'))]
        : [
            ('equal', l.t('splitEqual')),
            ('by_item', l.t('ttSplitByItem')),
            ('custom', l.t('ttSplitCustom')),
            ('sponsor', l.t('splitSponsor')),
          ];

    return Scaffold(
      appBar: AppBar(title: Text(l.t('ttBillNew'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          TextField(
            controller: _place,
            decoration: InputDecoration(
              labelText: l.t('ttPlaceEat'),
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
                fontSize: 20, fontWeight: FontWeight.w800),
            decoration: InputDecoration(
              labelText: l.t('ttTotalBill'),
              filled: true,
              fillColor: AppColors.cardWhite,
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14)),
            ),
          ),
          const SizedBox(height: 12),

          // Kaedah split.
          FitSectionCard(
            title: l.t('ttSplitWay'),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: methods
                  .map((m) => ChoiceChip(
                        selected: _method == m.$1,
                        label: Text(m.$2),
                        selectedColor: AppColors.softYellow,
                        onSelected: (v) => setState(() => _method = m.$1),
                      ))
                  .toList(),
            ),
          ),

          // Peserta.
          FitSectionCard(
            title: '${l.t('ttParticipantsLabel')} (${_participants.length})',
            trailing: TextButton.icon(
              onPressed: _addParticipant,
              style: TextButton.styleFrom(
                minimumSize: const Size(60, 32),
                padding: const EdgeInsets.symmetric(horizontal: 8),
              ),
              icon: const Icon(Icons.person_add_alt, size: 16),
              label: Text(l.t('walletAdd'),
                  style: const TextStyle(
                      fontSize: 12.5, fontWeight: FontWeight.w800)),
            ),
            child: Column(
              children: _participants
                  .asMap()
                  .entries
                  .map((entry) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          children: [
                            GestureDetector(
                              onTap: () => setState(
                                  () => _payer = entry.value.name),
                              child: Icon(
                                _payer == entry.value.name
                                    ? Icons.check_circle
                                    : Icons.radio_button_off,
                                size: 20,
                                color: _payer == entry.value.name
                                    ? AppColors.healthyGreen
                                    : AppColors.mutedText,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                '${entry.value.name}'
                                '${_payer == entry.value.name ? ' (${l.t('ttPayFirstLower')})' : ''}',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13.5),
                              ),
                            ),
                            if (_method == 'custom')
                              SizedBox(
                                width: 80,
                                child: TextField(
                                  keyboardType: const TextInputType
                                      .numberWithOptions(decimal: true),
                                  textAlign: TextAlign.right,
                                  decoration: const InputDecoration(
                                    prefixText: 'RM',
                                    isDense: true,
                                  ),
                                  onChanged: (v) => entry.value.amountOwed =
                                      double.tryParse(v) ?? 0,
                                ),
                              )
                            else if (entry.key != 0)
                              IconButton(
                                onPressed: () => setState(() {
                                  if (_payer == entry.value.name) {
                                    _payer = _participants.first.name;
                                  }
                                  _participants.removeAt(entry.key);
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

          // Item (untuk by_item).
          if (_method == 'by_item' || _items.isNotEmpty)
            FitSectionCard(
              title: '${l.t('walletItem')} (${_items.length})',
              trailing: TextButton.icon(
                onPressed: _addItem,
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
                  ? Text(l.t('ttAddItemHint'),
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
                                      child: Text(
                                        '${entry.value.itemName}'
                                        '${entry.value.assignedTo.isEmpty ? '' : ' (${entry.value.assignedTo.join(", ")})'}',
                                        style: const TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w600),
                                      ),
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

          const SizedBox(height: 8),
          FilledButton(
            onPressed: _create,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primaryRed,
              minimumSize: const Size(0, 52),
            ),
            child: Text(l.t('ttCalcMake'),
                style: const TextStyle(
                    fontWeight: FontWeight.w800, fontSize: 15)),
          ),
        ],
      ),
    );
  }
}

/// /tong-tong/:id - detail bil dengan status bayaran.
class BillDetailScreen extends ConsumerWidget {
  const BillDetailScreen({super.key, required this.billId});

  final String billId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final billAsync = ref.watch(billProvider(billId));
    return Scaffold(
      appBar: AppBar(
        title: Text(l.t('tongTongTitle')),
        actions: [
          IconButton(
            tooltip: l.t('shareAction'),
            onPressed: () => _share(context, ref),
            icon: const Icon(Icons.share_outlined),
          ),
        ],
      ),
      body: billAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, st) => Center(child: Text('😕 $e')),
        data: (data) {
          if (data == null) {
            return Center(child: Text(l.t('ttNotFound')));
          }
          final total = (data['totalAmount'] as num?)?.toDouble() ?? 0;
          final payer = data['payerName'] as String? ?? '';
          final status = data['status'] as String? ?? 'active';
          final parts = ((data['participants'] as List?) ?? const [])
              .map((e) =>
                  TtParticipant.fromMap(Map<String, dynamic>.from(e as Map)))
              .toList();
          final isHost =
              data['hostId'] == ref.read(authRepositoryProvider).currentUser?.uid;

          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              // Kepala bil.
              Container(
                margin: const EdgeInsets.only(bottom: 14),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppColors.primaryRed, Color(0xFFFF6B45)],
                  ),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(data['placeNameSnapshot'] as String? ?? l.t('ttBillShort'),
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 17,
                            fontWeight: FontWeight.w800)),
                    const SizedBox(height: 2),
                    Text(
                        '${l.t('ttTotalWord')} ${_rm(total)} • $payer ${l.t('ttPayFirstLower')}',
                        style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    _StatusChip(status: status),
                  ],
                ),
              ),

              // Siapa hutang siapa.
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(l.t('ttWhoPaysWho'),
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w800)),
              ),
              ...parts.map((p) => _ParticipantRow(
                    billId: billId,
                    participant: p,
                    all: parts,
                    payer: payer,
                    isHost: isHost,
                  )),

              const SizedBox(height: 14),
              OutlinedButton.icon(
                onPressed: () => _share(context, ref),
                style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 48)),
                icon: const Icon(Icons.send, size: 18),
                label: Text(l.t('ttShareWhatsapp'),
                    style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
            ],
          );
        },
      ),
    );
  }

  void _share(BuildContext context, WidgetRef ref) {
    final data = ref.read(billProvider(billId)).value;
    if (data == null) return;
    final parts = ((data['participants'] as List?) ?? const [])
        .map((e) => TtParticipant.fromMap(Map<String, dynamic>.from(e as Map)))
        .toList();
    final text = TongTongService.shareText(
      placeName: data['placeNameSnapshot'] as String? ?? 'MakanMana',
      total: (data['totalAmount'] as num?)?.toDouble() ?? 0,
      payerName: data['payerName'] as String? ?? '',
      participants: parts,
    );
    Clipboard.setData(ClipboardData(text: text));
    SharePlus.instance.share(ShareParams(text: text));
  }
}

class _ParticipantRow extends ConsumerWidget {
  const _ParticipantRow({
    required this.billId,
    required this.participant,
    required this.all,
    required this.payer,
    required this.isHost,
  });

  final String billId;
  final TtParticipant participant;
  final List<TtParticipant> all;
  final String payer;
  final bool isHost;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final p = participant;
    final isPayer = p.name == payer;
    final (label, color) = switch (p.paymentStatus) {
      'paid' => (l.t('ttPaid'), AppColors.healthyGreen),
      'pending_confirmation' => (l.t('ttPending'), AppColors.warningOrange),
      'waived' => (l.t('ttWaived'), AppColors.mutedText),
      _ => (l.t('ttUnpaid'), AppColors.primaryRed),
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.cardWhite,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.softBorder),
        ),
        child: Row(
          children: [
            Container(
              height: 40,
              width: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: AppColors.primaryRed.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Text(
                p.name.isNotEmpty ? p.name[0].toUpperCase() : '?',
                style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    color: AppColors.primaryRed),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(p.name,
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 14)),
                  Text(
                    isPayer
                        ? l.t('ttPayFirst')
                        : (p.amountOwed > 0
                            ? '${l.t('ttOwes')} $payer: ${_rm(p.amountOwed)}'
                            : l.t('ttNoDebt')),
                    style: const TextStyle(
                        fontSize: 12.5,
                        color: AppColors.mutedText,
                        fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
            if (isPayer || p.amountOwed == 0)
              _badge(label, color)
            else if (p.paymentStatus == 'paid')
              _badge(label, color)
            else
              TextButton(
                onPressed: () => ref
                    .read(tongTongServiceProvider)
                    .setPaymentStatus(billId, all, p.name, 'paid'),
                style: TextButton.styleFrom(
                  minimumSize: const Size(60, 34),
                  backgroundColor:
                      AppColors.primaryRed.withValues(alpha: 0.1),
                ),
                child: Text(l.t('ttMarkPaid'),
                    style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: AppColors.primaryRed)),
              ),
          ],
        ),
      ),
    );
  }

  Widget _badge(String label, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.13),
          borderRadius: BorderRadius.circular(9),
        ),
        child: Text(label,
            style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                color: Color.lerp(color, Colors.black, 0.25))),
      );
}
