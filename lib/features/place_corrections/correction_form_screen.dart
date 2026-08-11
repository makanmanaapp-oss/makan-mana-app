/// PART 1 Phase 1.11 — borang pembetulan/laporan + pengesahan penghantaran.
///
/// Cadangan pengguna kekal CADANGAN. Skrin ini tidak pernah menandakan apa-apa
/// sebagai disahkan, diluluskan atau diterbitkan, dan tidak menulis data kedai.
library;

import 'package:flutter/material.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import 'correction_models.dart';
import 'correction_repository.dart';
import 'correction_validation.dart';

class CorrectionFormScreen extends StatefulWidget {
  const CorrectionFormScreen({
    super.key,
    required this.snapshot,
    required this.repository,
    required this.initialCategory,
  });

  final ReportOriginalSnapshot snapshot;
  final PlaceCorrectionRepository repository;
  final ReportCategory initialCategory;

  @override
  State<CorrectionFormScreen> createState() => _CorrectionFormScreenState();
}

class _CorrectionFormScreenState extends State<CorrectionFormScreen> {
  late CorrectionDraft _draft;
  late final TextEditingController _proposedController;
  late final TextEditingController _descriptionController;

  bool _submitting = false;
  bool _failed = false;
  List<String> _errorKeys = const [];
  int _evidenceSequence = 0;

  @override
  void initState() {
    super.initState();
    _draft = CorrectionDraft(
      snapshot: widget.snapshot,
      category: widget.initialCategory,
      affectedField: _defaultField(widget.initialCategory),
    );
    _proposedController = TextEditingController();
    _descriptionController = TextEditingController();
  }

  @override
  void dispose() {
    _proposedController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  CorrectableField? _defaultField(ReportCategory category) {
    final required = ruleFor(category).requiredFields;
    return required.isEmpty ? null : required.first;
  }

  void _selectCategory(ReportCategory category) {
    setState(() {
      _draft = CorrectionDraft(
        snapshot: widget.snapshot,
        category: category,
        affectedField: _defaultField(category),
        description: _descriptionController.text,
        evidence: List<ReportEvidenceDraft>.from(_draft.evidence),
      );
      _proposedController.clear();
      _draft.proposedValue = null;
      _errorKeys = const [];
    });
  }

  void _addEvidence(ReportEvidenceType type) {
    setState(() {
      _evidenceSequence += 1;
      _draft.evidence.add(ReportEvidenceDraft(
        evidenceId: 'ev-$_evidenceSequence',
        evidenceType: type,
        // Metadata sahaja dalam fasa ini — tiada fail dimuat naik.
        observedAt: widget.snapshot.capturedAt,
      ));
      _errorKeys = const [];
    });
  }

  void _removeEvidence(String evidenceId) {
    setState(() {
      _draft.evidence.removeWhere((e) => e.evidenceId == evidenceId);
    });
  }

  Future<void> _submit() async {
    if (_submitting) return; // Cegah hantar dua kali.
    setState(() {
      _submitting = true;
      _failed = false;
      _errorKeys = const [];
    });
    _draft.proposedValue = _proposedController.text.trim().isEmpty
        ? null
        : _proposedController.text.trim();
    _draft.description = _descriptionController.text;

    final local = validateDraft(_draft);
    if (!local.valid) {
      setState(() {
        _submitting = false;
        _errorKeys = local.errorKeys;
      });
      return;
    }

    try {
      final outcome = await widget.repository.submit(_draft);
      if (!mounted) return;
      if (!outcome.accepted) {
        setState(() {
          _submitting = false;
          _errorKeys = outcome.errorKeys;
        });
        return;
      }
      setState(() => _submitting = false);
      await Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (_) => SubmissionConfirmationScreen(outcome: outcome),
        ),
      );
      if (!mounted) return;
      Navigator.of(context).pop(outcome);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _failed = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final mm = context.mm;
    final rule = _draft.rule;
    final isSample = widget.snapshot.sourceMode == 'sample';

    return Scaffold(
      appBar: AppBar(title: Text(t.t('reportThisPlace'))),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (isSample)
              _banner(t.t('reportSampleMode'), Icons.science_outlined),
            _banner(t.t('reportNoProductionData'), Icons.cloud_off_outlined),
            const SizedBox(height: 8),
            Text(widget.snapshot.title,
                style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: mm.onCard)),
            const SizedBox(height: 12),

            // 1. Kategori.
            _label(t.t('reportChooseCategory')),
            _categoryPicker(t),
            const SizedBox(height: 12),

            // 2. Notis keselamatan bagi kategori sensitif.
            if (rule.safetySensitive) ...[
              _banner(
                  t.t('reportSafetyNotice'), Icons.health_and_safety_outlined),
              const SizedBox(height: 12),
            ],

            // 3. Nilai semasa vs nilai dicadangkan.
            if (_draft.affectedField != null) ...[
              _label(t.t('reportCurrentValue')),
              _currentValueCard(t, mm),
              const SizedBox(height: 12),
              if (rule.allowsExactProposedValue) ...[
                _label(t.t('reportProposedValue')),
                Semantics(
                  textField: true,
                  label: t.t('reportProposedValue'),
                  child: TextField(
                    key: const Key('correction-proposed-value'),
                    controller: _proposedController,
                    decoration: InputDecoration(
                      border: const OutlineInputBorder(),
                      hintText: t.t('reportProposedValue'),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
              ],
            ],

            // 4. Penerangan.
            _label(t.t('reportDescription')),
            Semantics(
              textField: true,
              label: t.t('reportDescription'),
              child: TextField(
                key: const Key('correction-description'),
                controller: _descriptionController,
                maxLines: 4,
                maxLength: kMaxDescriptionLength,
                decoration: const InputDecoration(border: OutlineInputBorder()),
              ),
            ),

            // 5. Bukti.
            _label(rule.minimumEvidence > 0
                ? t.t('reportEvidenceRequired')
                : t.t('reportEvidenceOptional')),
            _evidenceSection(t, mm),
            const SizedBox(height: 12),

            // 6. Ralat pengesahan.
            if (_errorKeys.isNotEmpty) _errorList(t, mm),
            if (_failed) _banner(t.t('reportError'), Icons.error_outline),
            const SizedBox(height: 8),

            // 7. Hantar.
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                key: const Key('correction-submit'),
                onPressed: _submitting ? null : _submit,
                child: _submitting
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(t.t('reportSubmit')),
              ),
            ),
            const SizedBox(height: 8),
            Text(t.t('reportProposalNotVerified'),
                style: TextStyle(fontSize: 12.5, color: mm.onCardMuted)),
          ],
        ),
      ),
    );
  }

  // --- Pembantu susun atur -------------------------------------------------

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(top: 4, bottom: 6),
        child: Text(text,
            style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: context.mm.onCard)),
      );

  Widget _banner(String text, IconData icon) {
    final mm = context.mm;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: mm.softFill,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: mm.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: mm.iconMuted),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text,
                style: TextStyle(fontSize: 12.5, color: mm.onCardMuted)),
          ),
        ],
      ),
    );
  }

  Widget _categoryPicker(AppLocalizations t) {
    return Semantics(
      label: t.t('reportChooseCategory'),
      child: DropdownButtonFormField<ReportCategory>(
        key: const Key('correction-category'),
        initialValue: _draft.category,
        isExpanded: true,
        decoration: const InputDecoration(border: OutlineInputBorder()),
        items: [
          for (final category in ReportCategory.values)
            DropdownMenuItem<ReportCategory>(
              value: category,
              child: Text(t.t(kCategoryLabelKeys[category]!),
                  overflow: TextOverflow.ellipsis),
            ),
        ],
        onChanged: (value) {
          if (value != null) _selectCategory(value);
        },
      ),
    );
  }

  Widget _currentValueCard(AppLocalizations t, MMColors mm) {
    final value = _draft.currentValue;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: mm.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: mm.border),
      ),
      child: Text(
        // Keadaan tidak diketahui dipapar apa adanya — tiada nilai direka.
        value == null || value.trim().isEmpty ? '—' : value,
        key: const Key('correction-current-value'),
        style: TextStyle(fontSize: 14, color: mm.onCard),
      ),
    );
  }

  Widget _evidenceSection(AppLocalizations t, MMColors mm) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final evidence in _draft.evidence)
          ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.attachment, size: 18, color: mm.iconMuted),
            title: Text(evidence.evidenceType.name,
                style: TextStyle(fontSize: 13.5, color: mm.onCard)),
            trailing: IconButton(
              icon: const Icon(Icons.close, size: 18),
              onPressed: () => _removeEvidence(evidence.evidenceId),
            ),
          ),
        OutlinedButton.icon(
          key: const Key('correction-add-evidence'),
          onPressed: _draft.evidence.length >= kMaxEvidenceItems
              ? null
              : () => _addEvidence(ReportEvidenceType.userObservation),
          icon: const Icon(Icons.add, size: 18),
          label: Text(t.t('reportAddEvidence')),
        ),
      ],
    );
  }

  Widget _errorList(AppLocalizations t, MMColors mm) {
    return Container(
      key: const Key('correction-errors'),
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
          for (final key in _errorKeys)
            Text('• ${t.t(key)}',
                style: TextStyle(fontSize: 13, color: mm.onCard)),
        ],
      ),
    );
  }
}

/// Skrin pengesahan selepas penghantaran — memaparkan ID penjejakan.
class SubmissionConfirmationScreen extends StatelessWidget {
  const SubmissionConfirmationScreen({super.key, required this.outcome});

  final SubmitOutcome outcome;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final mm = context.mm;
    return Scaffold(
      appBar: AppBar(title: Text(t.t('reportSubmitted'))),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.check_circle_outline, size: 40, color: mm.iconMuted),
            const SizedBox(height: 12),
            Text(t.t('reportSubmitted'),
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: mm.onCard)),
            const SizedBox(height: 8),
            Text('${t.t('reportTrackingId')}: ${outcome.trackingId ?? '—'}',
                key: const Key('correction-tracking-id'),
                style: TextStyle(fontSize: 14, color: mm.onCard)),
            const SizedBox(height: 12),
            Text(t.t('reportProposalNotVerified'),
                style: TextStyle(fontSize: 13, color: mm.onCardMuted)),
            Text(t.t('reportIdentityNotShown'),
                style: TextStyle(fontSize: 13, color: mm.onCardMuted)),
          ],
        ),
      ),
    );
  }
}
