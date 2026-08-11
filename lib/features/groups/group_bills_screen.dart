import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/events/event_types.dart';
import '../../core/providers.dart';
import '../tongtong/tongtong_service.dart';
import 'group_providers.dart';

String _rm(num v) => 'RM${v.toStringAsFixed(2)}';

/// Tab bil Tong-Tong dalam Group Hub (SP5: seksyen Aktif/Selesai +
/// kiraan peserta/belum bayar — butiran individu kekal dalam bil).
class GroupBillsTab extends ConsumerWidget {
  const GroupBillsTab({super.key, required this.groupId, required this.canCreate});

  final String groupId;
  final bool canCreate;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final billsAsync = ref.watch(groupBillsProvider(groupId));
    final bills = billsAsync.value ?? const [];
    final active =
        bills.where((b) => (b.$2['status'] as String?) != 'settled').toList();
    final settled =
        bills.where((b) => (b.$2['status'] as String?) == 'settled').toList();

    if (billsAsync.isLoading && bills.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: canCreate
          ? FloatingActionButton.extended(
              heroTag: 'createGroupBill',
              onPressed: () {
                ref.read(eventLoggerProvider).logEvent(
                      EventType.groupBillCreateTapped,
                      sourceScreen: 'group_bills',
                      metadata: {'groupId': groupId},
                    );
                context.push('/groups/$groupId/bills/create');
              },
              backgroundColor: AppColors.primaryRed,
              icon: const Icon(Icons.receipt_long, color: Colors.white),
              label: Text(l.t('newBill'),
                  style: const TextStyle(color: Colors.white)),
            )
          : null,
      body: bills.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.receipt_long_outlined,
                        size: 52, color: AppColors.threadsMuted),
                    const SizedBox(height: 14),
                    Text(l.t('noBills'),
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            color: AppColors.threadsMuted,
                            fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 120),
              children: [
                if (active.isNotEmpty) ...[
                  _sectionLabel(l.t('billsActiveSection')),
                  ...active.map((b) => _billTile(context, ref, l, b)),
                ],
                if (settled.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  _sectionLabel(l.t('billsSettledSection')),
                  ...settled.map((b) => _billTile(context, ref, l, b)),
                ],
              ],
            ),
    );
  }

  Widget _sectionLabel(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8, top: 4),
        child: Text(text,
            style: TextStyle(
                color: AppColors.threadsMuted,
                fontWeight: FontWeight.w800,
                fontSize: 12.5)),
      );

  Widget _billTile(BuildContext context, WidgetRef ref, AppLocalizations l,
      (String, Map<String, dynamic>) bill) {
    final (id, data) = bill;
    final total = (data['totalAmount'] as num?)?.toDouble() ?? 0;
    final settled = (data['status'] as String?) == 'settled';
    final participants = ((data['participants'] as List?) ?? const [])
        .whereType<Map>()
        .toList();
    final paid = participants
        .where((p) =>
            p['paymentStatus'] == 'paid' || p['paymentStatus'] == 'waived')
        .length;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        onTap: () {
          ref.read(eventLoggerProvider).logEvent(
                EventType.groupBillViewed,
                sourceScreen: 'group_bills',
                metadata: {'groupId': groupId},
              );
          context.push('/tong-tong/$id');
        },
        tileColor: AppColors.threadsSurface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: AppColors.threadsBorder),
        ),
        leading: Icon(
            settled ? Icons.check_circle_outline : Icons.receipt_long_outlined,
            size: 26,
            color: settled ? AppColors.openGreen : AppColors.warmYellow),
        title: Text(data['placeNameSnapshot'] as String? ?? '-',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
                color: AppColors.threadsText, fontWeight: FontWeight.w700)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
                '${_rm(total)} • ${settled ? l.t('billSettled') : l.t('billActive')}'
                '${participants.isNotEmpty ? ' • $paid/${participants.length} ${l.t('paidOfLabel')}' : ''}',
                style: TextStyle(
                    color: AppColors.threadsMuted, fontSize: 12.5)),
            // SP6: penanda post/check-in berkaitan. Deep link ke satu
            // post belum wujud — arahkan ke tab Feed (jujur, tiada rosak).
            if (data['linkedPostId'] != null)
              InkWell(
                onTap: () {
                  ref.read(eventLoggerProvider).logEvent(
                        EventType.billLinkedPostOpened,
                        sourceScreen: 'group_bills',
                        metadata: {'groupId': groupId},
                      );
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                      content: Text(l.t('billLinkedGoFeed'))));
                },
                child: Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(l.t('billLinkedBadge'),
                      style: const TextStyle(
                          color: AppColors.warmYellow,
                          fontSize: 11.5,
                          fontWeight: FontWeight.w700)),
                ),
              ),
          ],
        ),
        trailing:
            Icon(Icons.chevron_right, color: AppColors.threadsMuted),
      ),
    );
  }
}

/// Cipta bil grup - peserta auto diisi daripada ahli grup.
/// SP6: boleh dibuka dari check-in/post grup dengan prefill
/// (placeName/total dari check-in, sourcePostId untuk pautan).
class GroupCreateBillScreen extends ConsumerStatefulWidget {
  const GroupCreateBillScreen({
    super.key,
    required this.groupId,
    this.prefillPlaceName,
    this.prefillTotal,
    this.sourcePostId,
  });
  final String groupId;
  final String? prefillPlaceName;
  final double? prefillTotal;
  final String? sourcePostId;

  @override
  ConsumerState<GroupCreateBillScreen> createState() =>
      _GroupCreateBillScreenState();
}

class _GroupCreateBillScreenState
    extends ConsumerState<GroupCreateBillScreen> {
  final _place = TextEditingController();
  final _total = TextEditingController();
  String _method = 'equal';
  String? _payerName;
  final _selected = <String>{}; // uid ahli yang termasuk
  bool _saving = false;
  bool _seeded = false;

  @override
  void initState() {
    super.initState();
    // Prefill dari check-in — pengguna bebas edit (tidak overwrite).
    if (widget.prefillPlaceName != null &&
        widget.prefillPlaceName!.isNotEmpty) {
      _place.text = widget.prefillPlaceName!;
    }
    if (widget.prefillTotal != null && widget.prefillTotal! > 0) {
      _total.text = widget.prefillTotal!.toStringAsFixed(2);
    }
  }

  @override
  void dispose() {
    _place.dispose();
    _total.dispose();
    super.dispose();
  }

  Future<void> _create(List<Map<String, dynamic>> members) async {
    final l = AppLocalizations.of(context);
    final total = double.tryParse(_total.text.trim()) ?? 0;
    if (_place.text.trim().isEmpty || total <= 0 || _selected.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(l.t('fillBillFields'))));
      return;
    }
    final chosen =
        members.where((m) => _selected.contains(m['uid'])).toList();
    final participants = chosen
        .map((m) => TtParticipant(
              name: (m['displayName'] as String?) ?? 'Foodie',
              uid: m['uid'] as String?,
            ))
        .toList();
    final payer = _payerName ?? participants.first.name;
    setState(() => _saving = true);
    final id = await ref.read(tongTongServiceProvider).createBill(
          placeName: _place.text.trim(),
          total: total,
          method: _method,
          payerName: payer,
          participants: participants,
          items: const [],
          groupId: widget.groupId,
          // SP6: pautkan bil ke post/check-in asal (jika dari post).
          linkedPostId: widget.sourcePostId,
          source: widget.sourcePostId != null ? 'group_post' : 'manual',
        );
    if (!mounted) return;
    if (id != null) {
      context.pushReplacement('/tong-tong/$id');
    } else {
      setState(() => _saving = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(l.t('postFailed'))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final myUid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
    final members = ref.watch(groupMembersProvider(widget.groupId)).value ??
        const [];
    if (!_seeded && members.isNotEmpty) {
      _seeded = true;
      _selected.addAll(members.map((m) => m['uid'] as String));
      final me = members.firstWhere((m) => m['uid'] == myUid,
          orElse: () => members.first);
      _payerName = me['displayName'] as String?;
    }

    final methods = <String, String>{
      'equal': l.t('splitEqual'),
      'sponsor': l.t('splitSponsor'),
    };

    return Scaffold(
      appBar: AppBar(title: Text(l.t('newBill'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
        children: [
          TextField(
            controller: _place,
            decoration: InputDecoration(
              labelText: l.t('billPlace'),
              filled: true,
              fillColor: context.mm.card,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: context.mm.border),
              ),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _total,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: l.t('billTotal'),
              prefixText: 'RM ',
              filled: true,
              fillColor: context.mm.card,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: context.mm.border),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(l.t('splitMethod'),
              style: const TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              for (final e in methods.entries)
                ChoiceChip(
                  selected: _method == e.key,
                  label: Text(e.value),
                  selectedColor: AppColors.primaryRed,
                  labelStyle: TextStyle(
                      color: _method == e.key
                          ? Colors.white
                          : context.mm.chipText,
                      fontWeight: FontWeight.w700),
                  onSelected: (_) => setState(() => _method = e.key),
                ),
            ],
          ),
          const SizedBox(height: 16),
          Text(l.t('whoJoins'),
              style: const TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          ...members.map((m) {
            final uid = m['uid'] as String;
            final name = (m['displayName'] as String?) ?? 'Foodie';
            return CheckboxListTile(
              value: _selected.contains(uid),
              activeColor: AppColors.primaryRed,
              contentPadding: EdgeInsets.zero,
              title: Text(name),
              subtitle: _payerName == name
                  ? Text(l.t('payerLabel'),
                      style: const TextStyle(
                          color: AppColors.primaryRed, fontSize: 12))
                  : null,
              secondary: TextButton(
                onPressed: () => setState(() => _payerName = name),
                child: Text(l.t('setPayer'),
                    style: const TextStyle(fontSize: 12)),
              ),
              onChanged: (v) => setState(() {
                if (v == true) {
                  _selected.add(uid);
                } else {
                  _selected.remove(uid);
                }
              }),
            );
          }),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _saving ? null : () => _create(members),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primaryRed,
                minimumSize: const Size(0, 52),
              ),
              child: _saving
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : Text(l.t('createBill'),
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 15)),
            ),
          ),
        ],
      ),
    );
  }
}
