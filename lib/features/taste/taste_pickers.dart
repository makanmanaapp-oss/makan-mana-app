import 'package:flutter/material.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/widgets/app_chip.dart';
import 'taste_compat.dart';
import 'taste_taxonomy.dart';

/// ISSUE 003 closeout — pemetik selera boleh-guna-semula:
/// 1) Sheet tahap keterukan alahan + nota peribadi.
/// 2) Pemetik masakan boleh-cari 3-mod (Favourite / Try / Avoid).
///
/// Semua pulangan guna ID STABIL sahaja (bukan label terjemah).

/// Hasil sheet alahan. [remove]=true bermakna buang entri.
class AllergyResult {
  const AllergyResult({this.remove = false, this.severity = 'moderate', this.note});
  final bool remove;
  final String severity; // mild | moderate | severe
  final String? note;
}

/// Buka sheet tahap keterukan + nota. `no_known_allergy` tidak sepatutnya
/// memanggil ini (pemanggil kena elak). Pulangkan null jika dibatalkan.
Future<AllergyResult?> showAllergySeveritySheet(
  BuildContext context, {
  required String allergyLabel,
  String? currentSeverity,
  String? currentNote,
  bool allowRemove = false,
}) {
  return showModalBottomSheet<AllergyResult>(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (ctx) => _SeveritySheet(
      allergyLabel: allergyLabel,
      currentSeverity: currentSeverity ?? 'moderate',
      currentNote: currentNote,
      allowRemove: allowRemove,
    ),
  );
}

class _SeveritySheet extends StatefulWidget {
  const _SeveritySheet({
    required this.allergyLabel,
    required this.currentSeverity,
    this.currentNote,
    this.allowRemove = false,
  });
  final String allergyLabel;
  final String currentSeverity;
  final String? currentNote;
  final bool allowRemove;

  @override
  State<_SeveritySheet> createState() => _SeveritySheetState();
}

class _SeveritySheetState extends State<_SeveritySheet> {
  late String _severity = widget.currentSeverity;
  late final TextEditingController _note =
      TextEditingController(text: widget.currentNote ?? '');

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final lang = l.locale.languageCode;
    final mm = context.mm;
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 18,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.allergyLabel,
              style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: mm.onCard)),
          const SizedBox(height: 4),
          Text(l.t('setSeverity'),
              style: TextStyle(fontSize: 13, color: mm.onCardMuted)),
          const SizedBox(height: 12),
          // Tahap: label + penunjuk (bukan warna sahaja).
          for (final s in kAllergySeverity)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => setState(() => _severity = s.id),
                child: Container(
                  constraints: const BoxConstraints(minHeight: 48),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: _severity == s.id
                        ? AppColors.selectedYellow
                        : mm.card,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                        color: _severity == s.id
                            ? AppColors.warmYellow
                            : mm.border,
                        width: _severity == s.id ? 1.5 : 1),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(s.label(lang),
                            style: TextStyle(
                                fontWeight: FontWeight.w700,
                                color: _severity == s.id
                                    ? AppColors.darkText
                                    : mm.onCard)),
                      ),
                      if (_severity == s.id)
                        const Icon(Icons.check_circle,
                            color: AppColors.primaryRed, size: 20),
                    ],
                  ),
                ),
              ),
            ),
          const SizedBox(height: 8),
          Text(l.t('allergyNoteLabel'),
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: mm.onCard)),
          const SizedBox(height: 6),
          TextField(
            controller: _note,
            maxLength: 80,
            decoration: InputDecoration(
              hintText: l.t('allergyNoteHint'),
              counterText: '',
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              if (widget.allowRemove) ...[
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(
                        context, const AllergyResult(remove: true)),
                    child: Text(l.t('removeAction')),
                  ),
                ),
                const SizedBox(width: 10),
              ],
              Expanded(
                flex: 2,
                child: ElevatedButton(
                  onPressed: () {
                    final note = _note.text.trim();
                    Navigator.pop(
                        context,
                        AllergyResult(
                            severity: _severity,
                            note: note.isEmpty ? null : note));
                  },
                  child: Text(l.t('saveProfile')),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ============================================================
// PEMETIK MASAKAN BOLEH-CARI 3-MOD
// ============================================================

enum CuisineMode { favourite, explore, avoid }

class CuisinePickerResult {
  const CuisinePickerResult(this.fav, this.explore, this.avoid, this.customs);
  final Set<String> fav;
  final Set<String> explore;
  final Set<String> avoid;
  final List<Map<String, dynamic>> customs;
}

/// Buka pemetik masakan skrin penuh; pulangkan set dikemas kini.
Future<CuisinePickerResult?> openCuisinePicker(
  BuildContext context, {
  required Set<String> fav,
  required Set<String> explore,
  required Set<String> avoid,
  List<Map<String, dynamic>> customs = const [],
}) {
  return Navigator.of(context).push<CuisinePickerResult>(
    MaterialPageRoute(
      builder: (_) => _CuisinePickerScreen(
        fav: {...fav},
        explore: {...explore},
        avoid: {...avoid},
        customs: [...customs],
      ),
    ),
  );
}

/// Dialog nama masakan sendiri. Controller mesti dimiliki State supaya
/// dispose berlaku selepas transisi keluar dialog tamat — dispose serta-merta
/// selepas showDialog kembali meranapkan TextField yang masih hidup
/// semasa animasi keluar ('_dependents.isEmpty' assertion).
class _CustomCuisineDialog extends StatefulWidget {
  const _CustomCuisineDialog();

  @override
  State<_CustomCuisineDialog> createState() => _CustomCuisineDialogState();
}

class _CustomCuisineDialogState extends State<_CustomCuisineDialog> {
  final _ctl = TextEditingController();

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return AlertDialog(
      title: Text(l.t('addCustomCuisine')),
      content: TextField(
        controller: _ctl,
        autofocus: true,
        maxLength: 40,
        decoration: InputDecoration(
            hintText: l.t('customCuisineHint'), counterText: ''),
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(l.t('cancelAction'))),
        ElevatedButton(
            onPressed: () => Navigator.pop(context, _ctl.text),
            child: Text(l.t('addCustomCuisine'))),
      ],
    );
  }
}

class _CuisinePickerScreen extends StatefulWidget {
  const _CuisinePickerScreen({
    required this.fav,
    required this.explore,
    required this.avoid,
    required this.customs,
  });
  final Set<String> fav;
  final Set<String> explore;
  final Set<String> avoid;
  final List<Map<String, dynamic>> customs;

  @override
  State<_CuisinePickerScreen> createState() => _CuisinePickerScreenState();
}

class _CuisinePickerScreenState extends State<_CuisinePickerScreen> {
  final _searchCtl = TextEditingController();
  String _query = '';
  CuisineMode _mode = CuisineMode.favourite;

  @override
  void dispose() {
    _searchCtl.dispose();
    super.dispose();
  }

  Set<String> _setFor(CuisineMode m) => switch (m) {
        CuisineMode.favourite => widget.fav,
        CuisineMode.explore => widget.explore,
        CuisineMode.avoid => widget.avoid,
      };

  CuisineMode? _modeOf(String id) {
    if (widget.fav.contains(id)) return CuisineMode.favourite;
    if (widget.explore.contains(id)) return CuisineMode.explore;
    if (widget.avoid.contains(id)) return CuisineMode.avoid;
    return null;
  }

  Future<void> _assign(String id) async {
    final existing = _modeOf(id);
    if (existing == _mode) {
      setState(() => _setFor(_mode).remove(id)); // nyahpilih
      return;
    }
    if (existing != null) {
      // Konflik — minta pengesahan (JANGAN padam senyap).
      final l = AppLocalizations.of(context);
      final move = await showDialog<bool>(
        context: context,
        builder: (d) => AlertDialog(
          title: Text(l.t('cuisineMoveTitle')),
          content: Text(l.t('cuisineMoveBody')),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(d, false),
                child: Text(l.t('cancelAction'))),
            ElevatedButton(
                onPressed: () => Navigator.pop(d, true),
                child: Text(l.t('cuisineMoveTitle'))),
          ],
        ),
      );
      if (move != true) return;
      setState(() {
        _setFor(existing).remove(id);
        _setFor(_mode).add(id);
      });
      return;
    }
    setState(() => _setFor(_mode).add(id));
  }

  Future<void> _addCustom() async {
    final raw = await showDialog<String>(
      context: context,
      builder: (d) => const _CustomCuisineDialog(),
    );
    final norm = normalizeCustomEntry(raw ?? '');
    if (norm == null) return;
    final id = customLocalId(norm);
    setState(() {
      // Dedup pada senarai custom + tambah ke mod aktif.
      if (!widget.customs.any((c) => c['id'] == id)) {
        widget.customs.add({'id': id, 'label': norm, 'normalized': norm});
      }
      _setFor(_mode).add(id);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final lang = l.locale.languageCode;
    final mm = context.mm;
    final q = _query.trim().toLowerCase();

    final all = [
      ...kAllCuisines,
      for (final c in widget.customs)
        TasteOption(c['id'] as String,
            ms: '${c['label']}',
            en: '${c['label']}',
            zh: '${c['label']}',
            ta: '${c['label']}'),
    ];
    final filtered = q.isEmpty
        ? all
        : all
            .where((o) =>
                o.label(lang).toLowerCase().contains(q) ||
                o.ms.toLowerCase().contains(q) ||
                o.en.toLowerCase().contains(q))
            .toList();

    return Scaffold(
      appBar: AppBar(
        title: Text(l.t('cuisinePickerTitle')),
        actions: [
          IconButton(
            tooltip: l.t('addCustomCuisine'),
            onPressed: _addCustom,
            icon: const Icon(Icons.add),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              controller: _searchCtl,
              onChanged: (v) => setState(() => _query = v),
              decoration: InputDecoration(
                hintText: l.t('searchHint'),
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _query.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => setState(() {
                          _query = '';
                          _searchCtl.clear();
                        }),
                      ),
              ),
            ),
          ),
          // Pemilih mod aktif + kiraan. QA 360dp: baris chip ini WAJIB
          // boleh skrol mendatar (label 3-mod + kiraan melimpah 243px).
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                for (final m in CuisineMode.values)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: AppChip(
                      label: switch (m) {
                        CuisineMode.favourite =>
                          '${l.t('onbFav')} (${widget.fav.length})',
                        CuisineMode.explore =>
                          '${l.t('onbExplore')} (${widget.explore.length})',
                        CuisineMode.avoid =>
                          '${l.t('onbAvoid')} (${widget.avoid.length})',
                      },
                      selected: _mode == m,
                      onTap: () => setState(() => _mode = m),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 4),
          Expanded(
            child: filtered.isEmpty
                ? Center(
                    child: Text(l.t('noResultsSearch'),
                        style: TextStyle(color: mm.onCardMuted)))
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    itemCount: filtered.length,
                    itemBuilder: (_, i) {
                      final o = filtered[i];
                      final mode = _modeOf(o.id);
                      return InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: () => _assign(o.id),
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 12),
                          decoration: BoxDecoration(
                            color: mode == _mode
                                ? AppColors.selectedYellow
                                : mm.card,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                                color: mode == _mode
                                    ? AppColors.warmYellow
                                    : mm.border),
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(o.label(lang),
                                    style: TextStyle(
                                        fontWeight: FontWeight.w600,
                                        color: mode == _mode
                                            ? AppColors.darkText
                                            : mm.onCard)),
                              ),
                              if (mode != null)
                                _StatusBadge(mode: mode, l: l),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.pop(
                    context,
                    CuisinePickerResult(widget.fav, widget.explore,
                        widget.avoid, widget.customs),
                  ),
                  child: Text(l.t('saveProfile')),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.mode, required this.l});
  final CuisineMode mode;
  final AppLocalizations l;

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (mode) {
      CuisineMode.favourite => (l.t('onbFav'), AppColors.primaryRed),
      CuisineMode.explore => (l.t('onbExplore'), AppColors.warmYellow),
      CuisineMode.avoid => (l.t('onbAvoid'), AppColors.mutedText),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(label,
          style: TextStyle(
              fontSize: 11, fontWeight: FontWeight.w700, color: color)),
    );
  }
}
