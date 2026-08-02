/// PART 1 Phase 1.11 — titik masuk laporan/pembetulan.
///
/// Semua titik masuk membawa ke aliran yang SAMA supaya tiada laluan pintas
/// terlepas pengesahan. Dipapar HANYA bila flag ON.
library;

import 'package:flutter/material.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import 'correction_form_screen.dart';
import 'correction_models.dart';
import 'correction_repository.dart';
import 'place_correction_flags.dart';

/// Satu pilihan pintas dalam helaian titik masuk.
class ReportQuickAction {
  const ReportQuickAction({
    required this.labelKey,
    required this.category,
    required this.icon,
  });

  final String labelKey;
  final ReportCategory category;
  final IconData icon;
}

/// Pintasan yang dipapar pada helaian utama (semua menuju aliran sama).
const List<ReportQuickAction> kReportQuickActions = [
  ReportQuickAction(
    labelKey: 'reportIncorrectInformation',
    category: ReportCategory.wrongName,
    icon: Icons.edit_note,
  ),
  ReportQuickAction(
    labelKey: 'suggestAnEdit',
    category: ReportCategory.wrongAddress,
    icon: Icons.place_outlined,
  ),
  ReportQuickAction(
    labelKey: 'reportClosed',
    category: ReportCategory.permanentlyClosed,
    icon: Icons.do_not_disturb_on_outlined,
  ),
  ReportQuickAction(
    labelKey: 'reportMoved',
    category: ReportCategory.movedLocation,
    icon: Icons.moving,
  ),
  ReportQuickAction(
    labelKey: 'reportDuplicate',
    category: ReportCategory.duplicatePlace,
    icon: Icons.copy_all_outlined,
  ),
  ReportQuickAction(
    labelKey: 'reportImage',
    category: ReportCategory.wrongImage,
    icon: Icons.image_outlined,
  ),
  ReportQuickAction(
    labelKey: 'reportUnsafeInformation',
    category: ReportCategory.unsafeHalalClaim,
    icon: Icons.health_and_safety_outlined,
  ),
  ReportQuickAction(
    labelKey: 'reportOther',
    category: ReportCategory.other,
    icon: Icons.more_horiz,
  ),
];

/// Butang "Laporkan maklumat tidak tepat" untuk skrin butiran.
///
/// Mengembalikan [SizedBox.shrink] bila flag OFF supaya susun atur legasi
/// kekal sama persis.
class ReportEntryButton extends StatelessWidget {
  const ReportEntryButton({
    super.key,
    required this.snapshot,
    required this.repository,
    this.isSample = false,
    this.onSubmitted,
  });

  final ReportOriginalSnapshot snapshot;
  final PlaceCorrectionRepository repository;

  /// Data sample tidak boleh dilaporkan — tiada rekod sebenar untuk dibetulkan.
  final bool isSample;
  final ValueChanged<SubmitOutcome>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    if (!PlaceCorrectionFlags.placeCorrectionEnabled) {
      return const SizedBox.shrink();
    }
    final t = AppLocalizations.of(context);
    final mm = context.mm;
    return Semantics(
      button: true,
      label: t.t('reportIncorrectInformation'),
      child: TextButton.icon(
        onPressed: isSample
            ? null
            : () => showReportEntrySheet(
                  context,
                  snapshot: snapshot,
                  repository: repository,
                  onSubmitted: onSubmitted,
                ),
        icon: Icon(Icons.flag_outlined, size: 18, color: mm.onCardMuted),
        label: Text(
          t.t('reportIncorrectInformation'),
          style: TextStyle(color: mm.onCardMuted, fontSize: 13.5),
        ),
      ),
    );
  }
}

/// Buka helaian titik masuk laporan.
Future<SubmitOutcome?> showReportEntrySheet(
  BuildContext context, {
  required ReportOriginalSnapshot snapshot,
  required PlaceCorrectionRepository repository,
  ValueChanged<SubmitOutcome>? onSubmitted,
}) async {
  if (!PlaceCorrectionFlags.placeCorrectionEnabled) return null;
  final outcome = await showModalBottomSheet<SubmitOutcome>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (sheetContext) => ReportEntrySheetBody(
      snapshot: snapshot,
      repository: repository,
    ),
  );
  if (outcome != null) onSubmitted?.call(outcome);
  return outcome;
}

/// Badan helaian (tanpa showModalBottomSheet) — boleh diuji terus.
class ReportEntrySheetBody extends StatelessWidget {
  const ReportEntrySheetBody({
    super.key,
    required this.snapshot,
    required this.repository,
  });

  final ReportOriginalSnapshot snapshot;
  final PlaceCorrectionRepository repository;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final mm = context.mm;
    // Material dibekalkan sendiri supaya badan boleh diuji/disemat di luar
    // showModalBottomSheet tanpa memerlukan nenek moyang Material.
    return Material(
      color: mm.appBackground,
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                t.t('reportThisPlace'),
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: mm.onCard,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                snapshot.title,
                style: TextStyle(fontSize: 13.5, color: mm.onCardMuted),
              ),
              const SizedBox(height: 12),
              _PrivacyNotice(),
              const SizedBox(height: 8),
              for (final action in kReportQuickActions)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(action.icon, color: mm.iconMuted),
                  title: Text(
                    t.t(action.labelKey),
                    style: TextStyle(color: mm.onCard, fontSize: 15),
                  ),
                  onTap: () async {
                    final navigator = Navigator.of(context);
                    final outcome = await navigator.push<SubmitOutcome>(
                      MaterialPageRoute<SubmitOutcome>(
                        builder: (_) => CorrectionFormScreen(
                          snapshot: snapshot,
                          repository: repository,
                          initialCategory: action.category,
                        ),
                      ),
                    );
                    if (outcome != null && navigator.canPop()) {
                      navigator.pop(outcome);
                    }
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Notis privasi — sentiasa dipapar sebelum penghantaran.
class _PrivacyNotice extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final mm = context.mm;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: mm.softFill,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: mm.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.lock_outline, size: 16, color: mm.iconMuted),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  t.t('reportPrivacyNotice'),
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: mm.onCard,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            t.t('reportIdentityNotShown'),
            style: TextStyle(fontSize: 12.5, color: mm.onCardMuted),
          ),
          Text(
            t.t('reportProposalNotVerified'),
            style: TextStyle(fontSize: 12.5, color: mm.onCardMuted),
          ),
        ],
      ),
    );
  }
}
