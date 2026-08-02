/// PART 1 Phase 1.14A — repositori pembetulan DIPERCAYAI (sisi klien).
///
/// Memanggil callable `submitPlaceCorrection` (region asia-southeast1) — TIDAK
/// menulis Firestore secara langsung. LALAI KEKAL OFF: [LocalPlaceCorrectionRepository]
/// masih digunakan sehingga `PlaceMigrationFeatureFlags.trustedCorrectionCallableAvailable`
/// benar DAN callable telah di-deploy (berpagar-pemilik, Phase 1.14).
///
/// KESELAMATAN:
/// - Tiada tulisan Firestore dipercayai daripada klien (rules menafikan).
/// - clientRequestId idempoten dijana bagi cuba-semula rangkaian.
/// - Ralat callable dipetakan ke kunci l10n selamat; TIADA fallback yang
///   memalsukan penghantaran produksi berjaya.
library;

import 'dart:math';

import 'package:cloud_functions/cloud_functions.dart';

import '../../core/constants/app_constants.dart';
import 'correction_models.dart';
import 'correction_repository.dart';

/// Antara muka minimum callable (boleh diganti dengan fake dalam ujian).
abstract class CorrectionCallableClient {
  Future<Map<String, dynamic>> call(Map<String, dynamic> payload);
}

/// Pelaksana sebenar melalui Firebase Functions (region betul).
class FirebaseCorrectionCallableClient implements CorrectionCallableClient {
  const FirebaseCorrectionCallableClient({this.timeout = const Duration(seconds: 15)});

  final Duration timeout;

  @override
  Future<Map<String, dynamic>> call(Map<String, dynamic> payload) async {
    final functions =
        FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion);
    final callable = functions.httpsCallable(
      'submitPlaceCorrection',
      options: HttpsCallableOptions(timeout: timeout),
    );
    final result = await callable.call<Map<String, dynamic>>(payload);
    return Map<String, dynamic>.from(result.data);
  }
}

/// Peta kod ralat callable -> kunci l10n selamat (boleh guna 4 bahasa).
const Map<String, String> kCorrectionErrorKeyByCode = {
  'unauthenticated': 'correctionErrLogin',
  'app_check_required': 'correctionErrAppCheck',
  'invalid_argument': 'correctionErrInvalid',
  'unsupported_type': 'correctionErrInvalid',
  'invalid_place': 'correctionErrInvalid',
  'description_too_short': 'correctionErrDescShort',
  'description_too_long': 'correctionErrDescLong',
  'invalid_evidence': 'correctionErrEvidence',
  'rate_limited': 'correctionErrRateLimited',
  'duplicate_submission': 'correctionErrDuplicate',
  'unavailable': 'correctionErrUnavailable',
  'internal': 'correctionErrInternal',
};

/// Kod yang WAJAR dicuba semula (rangkaian/sementara).
const Set<String> kRetryableCorrectionCodes = {'unavailable', 'internal'};

class TrustedPlaceCorrectionRepository implements PlaceCorrectionRepository {
  TrustedPlaceCorrectionRepository({
    required this.client,
    Random? random,
  }) : _random = random ?? Random();

  final CorrectionCallableClient client;
  final Random _random;

  String _clientRequestId() {
    final ts = DateTime.now().microsecondsSinceEpoch;
    final r = _random.nextInt(1 << 32);
    return 'req_${ts}_$r';
  }

  /// Enum Dart camelCase -> kategori domain snake_case (cth. wrongHours ->
  /// wrong_hours) supaya sepadan REPORT_CATEGORIES backend.
  static String categoryWire(ReportCategory c) =>
      c.name.replaceAllMapped(RegExp('[A-Z]'), (m) => '_${m[0]!.toLowerCase()}');

  @override
  Future<SubmitOutcome> submit(CorrectionDraft draft) async {
    final payload = <String, dynamic>{
      'placeId': draft.snapshot.placeId,
      // Callable menerima nama kategori domain (snake_case) ATAU jenis kanonikal.
      'correctionType': categoryWire(draft.category),
      'currentValue': draft.currentValue ?? '',
      'proposedValue': draft.proposedValue ?? '',
      'description': draft.description,
      'evidenceRefs': const <String>[], // muat naik bukti ditangguh (Part D)
      'locale': 'ms',
      'clientRequestId': _clientRequestId(),
    };
    try {
      final data = await client.call(payload);
      final success = data['success'] == true;
      return SubmitOutcome(
        accepted: success,
        trackingId: data['trackingId'] as String?,
        deduplicated: data['deduplicated'] == true,
        errorKeys: success ? const [] : const ['correctionErrInternal'],
      );
    } on FirebaseFunctionsException catch (e) {
      // e.message ialah kod selamat yang dihantar server (bukan jejak tindanan).
      final code = (e.message ?? e.code).trim();
      final key = kCorrectionErrorKeyByCode[code] ?? 'correctionErrInternal';
      return SubmitOutcome(accepted: false, errorKeys: [key]);
    } catch (_) {
      // JANGAN palsukan kejayaan. Kembalikan ralat generik.
      return const SubmitOutcome(accepted: false, errorKeys: ['correctionErrInternal']);
    }
  }

  // Bacaan sejarah/tarik-balik kekal pada laluan tempatan dalam fasa ini —
  // callable baca dipercayai belum di-deploy. UI menggunakan repo Local untuk
  // paparan sehingga diaktifkan.
  @override
  Future<List<ReporterSubmissionView>> listMySubmissions() async => const [];

  @override
  Future<ReporterSubmissionView?> getMySubmission(String submissionId) async => null;

  @override
  Future<bool> withdraw(String submissionId) async => false;

  @override
  Future<void> saveDraft(CorrectionDraft draft) async {
    // Tiada draf jauh dalam fasa ini.
  }
}
