import 'dart:convert';
import 'dart:io';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/utils/time_slot_utils.dart';
import '../fit/fit_providers.dart';

/// 📸 Calorie Scan (Pro): snap makanan -> Vertex AI Gemini analisis
/// makanan & anggaran kalori.
class CalorieScanScreen extends ConsumerStatefulWidget {
  const CalorieScanScreen({super.key});

  @override
  ConsumerState<CalorieScanScreen> createState() =>
      _CalorieScanScreenState();
}

class _CalorieScanScreenState extends ConsumerState<CalorieScanScreen> {
  File? _image;
  bool _scanning = false;
  bool _logged = false;
  Map<String, dynamic>? _result;
  String? _error;

  /// Log hasil scan terus ke Fit Coach (meal_logs, source photo_scan).
  /// Jika Gemini tidak beri makro, anggar dari kalori (P20/C50/L30).
  void _logToFitCoach(List<Map<String, dynamic>> foods) {
    final r = _result;
    if (r == null) return;
    final calories = (r['totalCalories'] as num?)?.round() ?? 0;
    if (calories <= 0) return;
    final protein = (r['totalProtein'] as num?)?.round() ??
        (calories * 0.20 / 4).round();
    final carbs = (r['totalCarbs'] as num?)?.round() ??
        (calories * 0.50 / 4).round();
    final fat =
        (r['totalFat'] as num?)?.round() ?? (calories * 0.30 / 9).round();
    final name = foods.isEmpty
        ? 'Scan makanan'
        : foods
            .map((f) => f['name'] as String? ?? '')
            .where((n) => n.isNotEmpty)
            .take(3)
            .join(' + ');
    ref.read(fitServiceProvider).logMeal(
          menuName: name,
          calories: calories,
          proteinG: protein,
          carbsG: carbs,
          fatG: fat,
          source: 'photo_scan',
          isHealthy: r['isHealthy'] == true,
          mealTime: TimeSlotUtils.now(),
        );
    setState(() => _logged = true);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(
          '$name · $calories kcal ${AppLocalizations.of(context).t('fitLogged')}'),
      duration: const Duration(seconds: 2),
    ));
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
          _error = null;
          _logged = false;
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
            _result = Map<String, dynamic>.from(data['result'] as Map);
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

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final foods = (_result?['foods'] as List? ?? [])
        .map((f) => Map<String, dynamic>.from(f as Map))
        .toList();

    return Scaffold(
      appBar: AppBar(title: Text(l.t('proScanTitle'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          if (_image == null)
            Container(
              height: 200,
              decoration: BoxDecoration(
                color: AppColors.cardWhite,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppColors.softBorder),
              ),
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text('🍛', style: TextStyle(fontSize: 52)),
                    const SizedBox(height: 8),
                    Text(
                      l.t('scanIntro'),
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: AppColors.mutedText,
                        fontSize: 13.5,
                      ),
                    ),
                  ],
                ),
              ),
            )
          else
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
                  onPressed:
                      _scanning ? null : () => _pick(ImageSource.camera),
                  style: OutlinedButton.styleFrom(
                      minimumSize: const Size(0, 46)),
                  icon: const Icon(Icons.photo_camera_outlined, size: 20),
                  label: Text(l.t('camera')),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed:
                      _scanning ? null : () => _pick(ImageSource.gallery),
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
                style: const TextStyle(
                  color: AppColors.mutedText,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
          if (_error != null)
            Center(
              child: Text(
                '😕 $_error',
                style: const TextStyle(color: AppColors.mutedText),
              ),
            ),
          if (_result != null) ...[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppColors.warmYellow, AppColors.softYellow],
                ),
                borderRadius: BorderRadius.circular(18),
              ),
              child: Row(
                children: [
                  const Text('🔥', style: TextStyle(fontSize: 32)),
                  const SizedBox(width: 12),
                  Text(
                    '${_result?['totalCalories'] ?? 0} kcal',
                    style: const TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      color: AppColors.darkText,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            ...foods.map((f) => Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.cardWhite,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.softBorder),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          f['name'] as String? ?? '',
                          style: const TextStyle(
                              fontWeight: FontWeight.w700),
                        ),
                      ),
                      Text(
                        '${f['calories'] ?? 0} kcal',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          color: AppColors.primaryRed,
                        ),
                      ),
                    ],
                  ),
                )),
            if ((_result?['note'] as String?)?.isNotEmpty ?? false)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  '💡 ${_result?['note']}',
                  style: const TextStyle(
                    color: AppColors.mutedText,
                    fontSize: 13.5,
                    height: 1.4,
                  ),
                ),
              ),
            // V3: terus masukkan hasil scan ke log Fit Coach.
            if ((_result?['totalCalories'] as num? ?? 0) > 0) ...[
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: _logged ? null : () => _logToFitCoach(foods),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primaryRed,
                  minimumSize: const Size(0, 50),
                ),
                icon: Icon(_logged
                    ? Icons.check_circle_outline
                    : Icons.monitor_heart_outlined),
                label: Text(
                  _logged ? l.t('fitLogged') : l.t('fitLogScan'),
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}
