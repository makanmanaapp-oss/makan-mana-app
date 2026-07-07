import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';

/// Laporan mingguan + tips coach dari pelayan (Pro sahaja —
/// pelayan sendiri kuatkuasakan; client hanya papar).
final weeklyReportProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  if (!ref.watch(firebaseReadyProvider)) {
    return {'status': 'PRO_REQUIRED'};
  }
  final res = await FirebaseFunctions.instanceFor(
    region: AppConstants.functionsRegion,
  )
      .httpsCallable(
        'getWeeklyReport',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 20)),
      )
      .call<Map<Object?, Object?>>({});
  return Map<String, dynamic>.from(res.data);
});
