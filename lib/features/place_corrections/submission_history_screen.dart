/// PART 1 Phase 1.11 — sejarah penghantaran pelapor.
///
/// Memaparkan HANYA pandangan pelapor: status, ID penjejakan dan tindakan
/// seterusnya. TIDAK memaparkan identiti penyemak, nota dalaman atau keputusan
/// mentah admin.
library;

import 'package:flutter/material.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import 'correction_models.dart';
import 'correction_repository.dart';

class SubmissionHistoryScreen extends StatefulWidget {
  const SubmissionHistoryScreen({super.key, required this.repository});

  final PlaceCorrectionRepository repository;

  @override
  State<SubmissionHistoryScreen> createState() =>
      _SubmissionHistoryScreenState();
}

class _SubmissionHistoryScreenState extends State<SubmissionHistoryScreen> {
  List<ReporterSubmissionView>? _items;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _items = null;
      _failed = false;
    });
    try {
      final items = await widget.repository.listMySubmissions();
      if (!mounted) return;
      setState(() => _items = items);
    } catch (_) {
      if (!mounted) return;
      setState(() => _failed = true);
    }
  }

  Future<void> _withdraw(String submissionId) async {
    await widget.repository.withdraw(submissionId);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final mm = context.mm;
    return Scaffold(
      appBar: AppBar(title: Text(t.t('reportMySubmissions'))),
      body: _body(t, mm),
    );
  }

  Widget _body(AppLocalizations t, MMColors mm) {
    if (_failed) {
      return _centered(
        key: const Key('history-error'),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(t.t('reportError'),
                style: TextStyle(color: mm.onCard, fontSize: 15)),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: _load,
              child: Text(t.t('reportRetry')),
            ),
          ],
        ),
      );
    }
    final items = _items;
    if (items == null) {
      return _centered(
        key: const Key('history-loading'),
        child: Semantics(
          label: t.t('reportLoading'),
          child: const CircularProgressIndicator(),
        ),
      );
    }
    if (items.isEmpty) {
      return _centered(
        key: const Key('history-empty'),
        child: Text(t.t('reportHistoryEmpty'),
            textAlign: TextAlign.center,
            style: TextStyle(color: mm.onCardMuted, fontSize: 14)),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      itemCount: items.length,
      itemBuilder: (context, index) => _submissionCard(t, mm, items[index]),
    );
  }

  Widget _centered({required Key key, required Widget child}) => Center(
      key: key,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: child,
      ));

  Widget _submissionCard(
      AppLocalizations t, MMColors mm, ReporterSubmissionView item) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: mm.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: mm.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(item.placeTitle,
              style: TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w700, color: mm.onCard)),
          const SizedBox(height: 4),
          Text(t.t(kCategoryLabelKeys[item.category]!),
              style: TextStyle(fontSize: 13, color: mm.onCardMuted)),
          const SizedBox(height: 8),
          // Status sebagai TEKS + ikon (bukan warna sahaja).
          Row(
            children: [
              Icon(_statusIcon(item.status), size: 16, color: mm.iconMuted),
              const SizedBox(width: 6),
              Expanded(
                child: Text(t.t(kStatusLabelKeys[item.status]!),
                    style: TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                        color: mm.onCard)),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text('${t.t('reportTrackingId')}: ${item.submissionId}',
              style: TextStyle(fontSize: 12.5, color: mm.onCardMuted)),
          if (item.canResubmitWithEvidence) ...[
            const SizedBox(height: 8),
            Text(t.t('reportResubmit'),
                key: Key('history-more-evidence-${item.submissionId}'),
                style: TextStyle(fontSize: 12.5, color: mm.onCardMuted)),
          ],
          if (item.canWithdraw) ...[
            const SizedBox(height: 8),
            Align(
              alignment: AlignmentDirectional.centerEnd,
              child: OutlinedButton(
                key: Key('history-withdraw-${item.submissionId}'),
                onPressed: () => _withdraw(item.submissionId),
                child: Text(t.t('reportWithdraw')),
              ),
            ),
          ],
        ],
      ),
    );
  }

  IconData _statusIcon(SubmissionStatus status) {
    switch (status) {
      case SubmissionStatus.draft:
        return Icons.edit_outlined;
      case SubmissionStatus.submitted:
      case SubmissionStatus.queued:
        return Icons.schedule;
      case SubmissionStatus.underReview:
        return Icons.search;
      case SubmissionStatus.needsMoreEvidence:
        return Icons.info_outline;
      case SubmissionStatus.validationFailed:
        return Icons.report_gmailerrorred_outlined;
      case SubmissionStatus.duplicateReport:
        return Icons.copy_all_outlined;
      case SubmissionStatus.acceptedForStaging:
        return Icons.inbox_outlined;
      case SubmissionStatus.rejected:
        return Icons.cancel_outlined;
      case SubmissionStatus.withdrawn:
        return Icons.undo;
      case SubmissionStatus.resolved:
        return Icons.check_circle_outline;
      case SubmissionStatus.superseded:
        return Icons.history;
    }
  }
}
