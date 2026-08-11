import 'dart:convert';
import 'dart:io';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/widgets/mm_icons.dart';
import '../../core/constants/app_constants.dart';
import 'calorie_scan_result.dart';

/// 📸 Calorie Scan (Pro): snap makanan -> Vertex AI Gemini analisis makanan &
/// anggaran kalori. Phase 2.15A: makro kelihatan + kejujuran anggaran + aliran
/// pembetulan pengguna + simpan idempoten (server actionId).
class CalorieScanScreen extends ConsumerStatefulWidget {
  const CalorieScanScreen({
    super.key,
    this.initialResult,
    this.saveOverride,
  });

  /// Test hook: seed a result without invoking the camera/Vertex.
  @visibleForTesting
  final CalorieScanResult? initialResult;

  /// Test hook: intercept the idempotent save callable.
  @visibleForTesting
  final Future<Map<String, dynamic>> Function(Map<String, dynamic> payload)?
      saveOverride;

  @override
  ConsumerState<CalorieScanScreen> createState() => _CalorieScanScreenState();
}

class _CalorieScanScreenState extends ConsumerState<CalorieScanScreen> {
  File? _image;
  bool _scanning = false;
  bool _saving = false;
  bool _logged = false;
  bool _editing = false;
  CalorieScanResult? _result;
  ScanEditDraft? _draft;
  String? _error;
  String? _validationError;

  final _nameCtl = TextEditingController();
  final _servingCtl = TextEditingController();
  final _calCtl = TextEditingController();
  final _proteinCtl = TextEditingController();
  final _carbsCtl = TextEditingController();
  final _fatCtl = TextEditingController();

  @override
  void initState() {
    super.initState();
    if (widget.initialResult != null) {
      _applyResult(widget.initialResult!);
    }
  }

  @override
  void dispose() {
    _nameCtl.dispose();
    _servingCtl.dispose();
    _calCtl.dispose();
    _proteinCtl.dispose();
    _carbsCtl.dispose();
    _fatCtl.dispose();
    super.dispose();
  }

  String _newScanId() =>
      '${DateTime.now().microsecondsSinceEpoch}_scan';

  void _applyResult(CalorieScanResult r) {
    final draft = ScanEditDraft.fromResult(r);
    _result = r;
    _draft = draft;
    _logged = false;
    _editing = false;
    _validationError = null;
    _nameCtl.text = draft.mealName;
    _servingCtl.text = draft.servingDesc ?? '';
    _calCtl.text = draft.calories;
    _proteinCtl.text = draft.protein;
    _carbsCtl.text = draft.carbs;
    _fatCtl.text = draft.fat;
  }

  Future<void> _pick(ImageSource source) async {
    try {
      final picked = await ImagePicker().pickImage(
        source: source,
        maxWidth: 1024,
        imageQuality: 70,
      );
      if (picked != null && mounted) {
        setState(() {
          _image = File(picked.path);
          _result = null;
          _draft = null;
          _error = null;
          _logged = false;
          _editing = false;
        });
        await _scan();
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _scan() async {
    if (_image == null) return;
    final l = AppLocalizations.of(context);
    setState(() => _scanning = true);
    try {
      final bytes = await _image!.readAsBytes();
      final res = await FirebaseFunctions.instanceFor(
        region: AppConstants.functionsRegion,
      )
          .httpsCallable(
            'scanCalories',
            options:
                HttpsCallableOptions(timeout: const Duration(seconds: 60)),
          )
          .call<Map>({'imageBase64': base64Encode(bytes)});
      final data = Map<String, dynamic>.from(res.data);
      if (mounted) {
        setState(() {
          _scanning = false;
          if (data['status'] == 'OK') {
            _applyResult(CalorieScanResult.fromApi(
              Map<String, dynamic>.from(data['result'] as Map),
              scanId: _newScanId(),
            ));
          } else {
            _error = l.t('lockedPro');
          }
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _scanning = false;
          _error = l.t('scanFailed');
        });
      }
    }
  }

  void _syncDraftFromControllers() {
    final d = _draft;
    if (d == null) return;
    d.mealName = _nameCtl.text;
    d.servingDesc = _servingCtl.text.trim().isEmpty ? null : _servingCtl.text;
    d.calories = _calCtl.text;
    d.protein = _proteinCtl.text;
    d.carbs = _carbsCtl.text;
    d.fat = _fatCtl.text;
  }

  void _cancelEdit() {
    // Restore the previous (original) values.
    final r = _result;
    if (r != null) _applyResult(r);
    setState(() => _editing = false);
  }

  String _validationMessage(AppLocalizations l, ScanEditError e) {
    switch (e) {
      case ScanEditError.nameRequired:
        return l.t('scanNameRequired');
      case ScanEditError.caloriesInvalid:
        return l.t('scanInvalidCalories');
      case ScanEditError.macroInvalid:
        return l.t('scanInvalidMacro');
      case ScanEditError.none:
        return '';
    }
  }

  Future<void> _save() async {
    final d = _draft;
    if (d == null || _saving || _logged) return;
    final l = AppLocalizations.of(context);
    _syncDraftFromControllers();
    final err = d.validate();
    if (err != ScanEditError.none) {
      setState(() => _validationError = _validationMessage(l, err));
      return;
    }
    setState(() {
      _validationError = null;
      _saving = true;
    });
    try {
      final payload = d.toSavePayload();
      final Map<String, dynamic> res;
      if (widget.saveOverride != null) {
        res = await widget.saveOverride!(payload);
      } else {
        final call = await FirebaseFunctions.instanceFor(
          region: AppConstants.functionsRegion,
        )
            .httpsCallable('saveScanMeal',
                options:
                    HttpsCallableOptions(timeout: const Duration(seconds: 30)))
            .call<Map>(payload);
        res = Map<String, dynamic>.from(call.data);
      }
      if (!mounted) return;
      final status = res['status'];
      if (status == 'created' || status == 'idempotentReplay') {
        setState(() {
          _saving = false;
          _logged = true;
          _editing = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('${d.mealName} · ${d.calories} kcal '
              '${l.t('fitLogged')}'),
          duration: const Duration(seconds: 2),
        ));
      } else {
        setState(() {
          _saving = false;
          _error = l.t('lockedPro');
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = l.t('scanSaveFailed');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final r = _result;

    return Scaffold(
      appBar: AppBar(title: Text(l.t('proScanTitle'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          if (_image == null && r == null)
            _introBox(l)
          else if (_image != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(20),
              child: Image.file(_image!,
                  height: 220, width: double.infinity, fit: BoxFit.cover),
            ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: (_scanning || _saving)
                      ? null
                      : () => _pick(ImageSource.camera),
                  style: OutlinedButton.styleFrom(
                      minimumSize: const Size(0, 46)),
                  icon: const Icon(Icons.photo_camera_outlined, size: 20),
                  label: Text(l.t('camera')),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: (_scanning || _saving)
                      ? null
                      : () => _pick(ImageSource.gallery),
                  style: OutlinedButton.styleFrom(
                      minimumSize: const Size(0, 46)),
                  icon: const Icon(Icons.photo_library_outlined, size: 20),
                  label: Text(l.t('gallery')),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          if (_scanning) ...[
            const Center(child: CircularProgressIndicator()),
            const SizedBox(height: 10),
            Center(
              child: Text(
                l.t('scanning'),
                style: TextStyle(
                  color: context.mm.onCardMuted,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
          if (_error != null)
            Center(
              child: Text(
                _error!,
                style: TextStyle(color: context.mm.onCardMuted),
              ),
            ),
          if (r != null && r.hasFood) ...[
            _caloriesCard(l, r),
            const SizedBox(height: 12),
            if (_editing) _editForm(l) else _resultView(l, r),
          ],
          if (r != null && !r.hasFood)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(l.t('scanNoFood'),
                  style: TextStyle(color: context.mm.onCardMuted)),
            ),
        ],
      ),
    );
  }

  Widget _introBox(AppLocalizations l) => Container(
        height: 200,
        decoration: BoxDecoration(
          color: context.mm.card,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: context.mm.border),
        ),
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const MmIcon(MmIconType.mealLog,
                  size: 52, color: AppColors.fadedText),
              const SizedBox(height: 8),
              Text(
                l.t('scanIntro'),
                textAlign: TextAlign.center,
                style: TextStyle(color: context.mm.onCardMuted, fontSize: 13.5),
              ),
            ],
          ),
        ),
      );

  Widget _caloriesCard(AppLocalizations l, CalorieScanResult r) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [AppColors.warmYellow, AppColors.softYellow],
          ),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l.t('scanEstCalories'),
                style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.darkText)),
            const SizedBox(height: 4),
            Row(
              children: [
                const Icon(Icons.local_fire_department,
                    size: 30, color: AppColors.darkText),
                const SizedBox(width: 12),
                Text(
                  '${r.calories} kcal',
                  style: const TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    color: AppColors.darkText,
                  ),
                ),
              ],
            ),
          ],
        ),
      );

  Widget _macroChip(AppLocalizations l, String label, MacroValue m) {
    final text = m.estimated ? '${m.grams} g' : l.t('scanNotEstimated');
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 3),
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
        decoration: BoxDecoration(
          color: context.mm.card,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: context.mm.border),
        ),
        child: Column(
          children: [
            Text(label,
                style: TextStyle(
                    fontSize: 11.5,
                    color: context.mm.onCardMuted,
                    fontWeight: FontWeight.w600)),
            const SizedBox(height: 3),
            Text(text,
                style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800,
                    color: m.estimated
                        ? context.mm.onCard
                        : context.mm.onCardMuted)),
          ],
        ),
      ),
    );
  }

  Widget _resultView(AppLocalizations l, CalorieScanResult r) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l.t('scanEstNutrition'),
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: context.mm.onCard)),
          const SizedBox(height: 8),
          Row(
            children: [
              _macroChip(l, l.t('macroProtein'), r.protein),
              _macroChip(l, l.t('macroCarbs'), r.carbs),
              _macroChip(l, l.t('macroFat'), r.fat),
            ],
          ),
          const SizedBox(height: 10),
          // Estimate + safety disclosure — beside the final result, not hidden.
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.mm.card,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.mm.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l.t('scanEstimateDisclosure'),
                    style: TextStyle(
                        fontSize: 12.5,
                        height: 1.4,
                        color: context.mm.onCardMuted)),
                const SizedBox(height: 6),
                Text(l.t('scanSafetyDisclaimer'),
                    style: TextStyle(
                        fontSize: 12.5,
                        height: 1.4,
                        color: context.mm.onCardMuted)),
              ],
            ),
          ),
          if (r.note != null) ...[
            const SizedBox(height: 6),
            Text(r.note!,
                style: TextStyle(
                    color: context.mm.onCardMuted, fontSize: 13.5, height: 1.4)),
          ],
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _logged
                      ? null
                      : () => setState(() {
                            _editing = true;
                            _validationError = null;
                          }),
                  style:
                      OutlinedButton.styleFrom(minimumSize: const Size(0, 48)),
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  label: Text(l.t('scanEditResult')),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  onPressed: (_logged || _saving) ? null : _save,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primaryRed,
                    minimumSize: const Size(0, 48),
                  ),
                  icon: Icon(_logged
                      ? Icons.check_circle_outline
                      : Icons.monitor_heart_outlined),
                  label: Text(_logged ? l.t('fitLogged') : l.t('fitLogScan')),
                ),
              ),
            ],
          ),
        ],
      );

  Widget _numField(String label, TextEditingController ctl, String suffix) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextField(
          controller: ctl,
          keyboardType: const TextInputType.numberWithOptions(decimal: false),
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: InputDecoration(
            labelText: label,
            suffixText: suffix,
            border: const OutlineInputBorder(),
            isDense: true,
          ),
        ),
      );

  Widget _editForm(AppLocalizations l) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l.t('scanEditResult'),
              style: const TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          TextField(
            controller: _nameCtl,
            maxLength: ScanBounds.nameMaxLen,
            decoration: InputDecoration(
              labelText: l.t('scanFieldName'),
              border: const OutlineInputBorder(),
              isDense: true,
            ),
          ),
          TextField(
            controller: _servingCtl,
            decoration: InputDecoration(
              labelText: l.t('scanFieldServing'),
              border: const OutlineInputBorder(),
              isDense: true,
            ),
          ),
          const SizedBox(height: 10),
          _numField(l.t('scanEstCalories'), _calCtl, 'kcal'),
          _numField(l.t('macroProtein'), _proteinCtl, 'g'),
          _numField(l.t('macroCarbs'), _carbsCtl, 'g'),
          _numField(l.t('macroFat'), _fatCtl, 'g'),
          if (_validationError != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(_validationError!,
                  style: const TextStyle(
                      color: AppColors.primaryRed,
                      fontWeight: FontWeight.w600,
                      fontSize: 13)),
            ),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _saving ? null : _cancelEdit,
                  style:
                      OutlinedButton.styleFrom(minimumSize: const Size(0, 48)),
                  child: Text(l.t('scanCancel')),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton(
                  onPressed: _saving ? null : _save,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primaryRed,
                    minimumSize: const Size(0, 48),
                  ),
                  child: Text(l.t('scanSaveCorrected')),
                ),
              ),
            ],
          ),
        ],
      );
}
