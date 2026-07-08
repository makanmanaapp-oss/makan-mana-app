import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../social/social_providers.dart';
import 'group_providers.dart';

/// Jenis undian grup + label.
const kPollTypes = <String>[
  'restaurant',
  'cuisine',
  'time',
  'budget',
  'menu',
  'location',
  'health_friendly',
];

String pollTypeLabel(AppLocalizations l, String type) => switch (type) {
      'restaurant' => l.t('pollRestaurant'),
      'cuisine' => l.t('pollCuisine'),
      'time' => l.t('pollTime'),
      'budget' => l.t('pollBudget'),
      'menu' => l.t('pollMenu'),
      'location' => l.t('pollLocation'),
      'health_friendly' => l.t('pollHealth'),
      _ => type,
    };

/// Skrin cipta undian (halaman penuh - lebih boleh dipercayai untuk borang
/// dengan papan kekunci berbanding modal bottom sheet).
Future<void> showCreatePollSheet(BuildContext context, String groupId) {
  return Navigator.of(context).push(MaterialPageRoute<void>(
    fullscreenDialog: true,
    builder: (ctx) => _CreatePollSheet(groupId: groupId),
  ));
}

class _CreatePollSheet extends ConsumerStatefulWidget {
  const _CreatePollSheet({required this.groupId});
  final String groupId;

  @override
  ConsumerState<_CreatePollSheet> createState() => _CreatePollSheetState();
}

class _CreatePollSheetState extends ConsumerState<_CreatePollSheet> {
  final _question = TextEditingController();
  final _options = <TextEditingController>[
    TextEditingController(),
    TextEditingController(),
  ];
  String _type = 'restaurant';
  bool _sending = false;

  @override
  void dispose() {
    _question.dispose();
    for (final c in _options) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _create() async {
    final l = AppLocalizations.of(context);
    final opts = _options
        .map((c) => c.text.trim())
        .where((t) => t.isNotEmpty)
        .toList();
    if (_question.text.trim().length < 2 || opts.length < 2) return;
    setState(() => _sending = true);
    try {
      await ref.read(socialServiceProvider).createGroupPoll(
            groupId: widget.groupId,
            question: _question.text.trim(),
            type: _type,
            options: opts,
          );
      if (mounted) Navigator.pop(context);
    } catch (_) {
      if (mounted) {
        setState(() => _sending = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(l.t('postFailed'))));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.creamBackground,
      appBar: AppBar(
        backgroundColor: AppColors.creamBackground,
        title: Text(l.t('createPoll')),
      ),
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                    const SizedBox(height: 2),
                    TextField(
                      controller: _question,
                      maxLength: 120,
                      decoration: InputDecoration(
                        hintText: l.t('pollQuestionHint'),
                        filled: true,
                        fillColor: AppColors.cardWhite,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide.none,
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(l.t('pollType'),
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 13)),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final t in kPollTypes)
                          ChoiceChip(
                            selected: _type == t,
                            label: Text(pollTypeLabel(l, t)),
                            selectedColor: AppColors.primaryRed,
                            labelStyle: TextStyle(
                                color: _type == t
                                    ? Colors.white
                                    : AppColors.darkText,
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700),
                            onSelected: (_) => setState(() => _type = t),
                          ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Text(l.t('pollOptions'),
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 13)),
                    const SizedBox(height: 8),
                    for (var i = 0; i < _options.length; i++)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: TextField(
                          controller: _options[i],
                          maxLength: 60,
                          decoration: InputDecoration(
                            counterText: '',
                            hintText: '${l.t('pollOption')} ${i + 1}',
                            filled: true,
                            fillColor: AppColors.cardWhite,
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: BorderSide.none,
                            ),
                          ),
                        ),
                      ),
                    if (_options.length < 8)
                      TextButton.icon(
                        onPressed: () => setState(
                            () => _options.add(TextEditingController())),
                        icon: const Icon(Icons.add, size: 18),
                        label: Text(l.t('addOption')),
                      ),
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
                    onPressed: _sending ? null : _create,
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
                        : Text(l.t('createPoll'),
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

/// Kad undian dengan bar keputusan + undi.
class PollCard extends ConsumerWidget {
  const PollCard({super.key, required this.groupId, required this.poll});

  final String groupId;
  final Map<String, dynamic> poll;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final pollId = poll['id'] as String;
    final options = ((poll['options'] as List?) ?? const [])
        .map((e) => (e as Map).cast<String, dynamic>())
        .toList();
    final total = (poll['totalVotes'] as num?)?.toInt() ?? 0;
    final isOpen = (poll['status'] as String?) == 'open';
    final myVote =
        ref.watch(myPollVoteProvider((groupId: groupId, pollId: pollId))).value;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
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
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.softYellow,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text('🗳️ ${pollTypeLabel(l, poll['type'] as String? ?? '')}',
                    style: const TextStyle(
                        fontSize: 11, fontWeight: FontWeight.w700)),
              ),
              const Spacer(),
              if (!isOpen)
                Text(l.t('pollClosed'),
                    style: const TextStyle(
                        fontSize: 11.5,
                        color: AppColors.mutedText,
                        fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 10),
          Text(poll['question'] as String? ?? '',
              style:
                  const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          for (final opt in options)
            _optionBar(context, ref, opt, total, myVote, isOpen, pollId),
          const SizedBox(height: 4),
          Text('$total ${l.t('votesLabel')}',
              style: const TextStyle(
                  fontSize: 11.5, color: AppColors.mutedText)),
        ],
      ),
    );
  }

  Widget _optionBar(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> opt,
    int total,
    String? myVote,
    bool isOpen,
    String pollId,
  ) {
    final key = opt['key'] as String;
    final votes = (opt['votes'] as num?)?.toInt() ?? 0;
    final pct = total == 0 ? 0.0 : votes / total;
    final selected = myVote == key;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: isOpen
            ? () => ref
                .read(socialServiceProvider)
                .voteGroupPoll(groupId, pollId, key)
            : null,
        borderRadius: BorderRadius.circular(12),
        child: Stack(
          children: [
            Container(
              height: 42,
              decoration: BoxDecoration(
                color: AppColors.creamBackground,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                    color: selected
                        ? AppColors.primaryRed
                        : AppColors.softBorder),
              ),
            ),
            // Bar peratus.
            FractionallySizedBox(
              widthFactor: pct.clamp(0.0, 1.0),
              child: Container(
                height: 42,
                decoration: BoxDecoration(
                  color: selected
                      ? AppColors.primaryRed.withValues(alpha: 0.22)
                      : AppColors.softYellow.withValues(alpha: 0.55),
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            Positioned.fill(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Row(
                  children: [
                    if (selected)
                      const Padding(
                        padding: EdgeInsets.only(right: 6),
                        child: Icon(Icons.check_circle,
                            size: 16, color: AppColors.primaryRed),
                      ),
                    Expanded(
                      child: Text(opt['label'] as String? ?? '',
                          style: TextStyle(
                              fontWeight:
                                  selected ? FontWeight.w800 : FontWeight.w600,
                              fontSize: 13.5)),
                    ),
                    Text('${(pct * 100).round()}%',
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 12.5)),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
