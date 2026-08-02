/// PART 1 Phase 1.11 — repository pembetulan sisi klien.
///
/// FASA INI: penyesuai TEMPATAN/MOCK sahaja. Tiada callable produksi
/// dipanggil, tiada Firestore ditulis, tiada data dipercayai diubah.
/// Antara muka ini ialah satu-satunya tempat yang perlu ditukar apabila
/// callable dipercayai diluluskan dalam fasa terkawal kemudian.
library;

import 'correction_models.dart';
import 'correction_validation.dart';

/// Hasil penghantaran yang dilihat pengguna.
class SubmitOutcome {
  const SubmitOutcome({
    required this.accepted,
    this.trackingId,
    this.deduplicated = false,
    this.errorKeys = const [],
  });

  final bool accepted;

  /// ID penjejakan yang ditunjukkan kepada pengguna selepas penghantaran.
  final String? trackingId;

  /// true = laporan serupa yang terbuka telah dikemas kini, bukan digandakan.
  final bool deduplicated;

  final List<String> errorKeys;
}

/// Sempadan penghantaran pembetulan. UI bergantung HANYA pada antara muka ini.
abstract class PlaceCorrectionRepository {
  Future<SubmitOutcome> submit(CorrectionDraft draft);
  Future<List<ReporterSubmissionView>> listMySubmissions();
  Future<ReporterSubmissionView?> getMySubmission(String submissionId);
  Future<bool> withdraw(String submissionId);
  Future<void> saveDraft(CorrectionDraft draft);
}

/// Pelaksanaan dalam-ingatan untuk fasa mock ini + ujian widget.
///
/// Menguatkuasa dedup dan snapshot tidak berubah secara tempatan supaya
/// tingkah laku UI sepadan dengan backend.
class LocalPlaceCorrectionRepository implements PlaceCorrectionRepository {
  LocalPlaceCorrectionRepository({DateTime Function()? clock})
      : _clock = clock ?? DateTime.now;

  final DateTime Function() _clock;
  final List<ReporterSubmissionView> _submissions = <ReporterSubmissionView>[];
  final Map<String, String> _dedupKeys = <String, String>{};
  int _sequence = 0;

  /// Simulasi ralat untuk ujian keadaan ralat.
  bool failNextSubmit = false;

  /// Simulasi kelewatan untuk ujian keadaan memuat.
  Duration latency = Duration.zero;

  void reset() {
    _submissions.clear();
    _dedupKeys.clear();
    _sequence = 0;
    failNextSubmit = false;
    latency = Duration.zero;
  }

  /// Kunci identiti dedup tempatan (cermin backend, tanpa masa).
  String _dedupKey(CorrectionDraft draft) => <String>[
        draft.snapshot.placeId,
        draft.category.name,
        draft.affectedField?.name ?? '',
        draft.proposedValue?.trim() ?? '',
      ].join('|');

  @override
  Future<SubmitOutcome> submit(CorrectionDraft draft) async {
    if (latency > Duration.zero) await Future<void>.delayed(latency);
    if (failNextSubmit) {
      failNextSubmit = false;
      throw StateError('simulated_submit_failure');
    }

    final validation = validateDraft(draft);
    if (!validation.valid) {
      return SubmitOutcome(accepted: false, errorKeys: validation.errorKeys);
    }

    final key = _dedupKey(draft);
    final existingId = _dedupKeys[key];
    if (existingId != null) {
      final open = _submissions.any((s) =>
          s.submissionId == existingId &&
          (s.status == SubmissionStatus.submitted ||
              s.status == SubmissionStatus.queued ||
              s.status == SubmissionStatus.underReview ||
              s.status == SubmissionStatus.needsMoreEvidence));
      if (open) {
        // Laporan serupa yang terbuka digunakan semula — tiada gandaan.
        return SubmitOutcome(
          accepted: true,
          trackingId: existingId,
          deduplicated: true,
        );
      }
    }

    _sequence += 1;
    final trackingId = 'MM-RPT-${_sequence.toString().padLeft(6, '0')}';
    _submissions.insert(
      0,
      ReporterSubmissionView(
        submissionId: trackingId,
        placeId: draft.snapshot.placeId,
        placeTitle: draft.snapshot.title,
        category: draft.category,
        status: SubmissionStatus.submitted,
        submittedAt: _clock(),
        evidenceCount: draft.evidence.length,
        affectedFields: draft.affectedField == null
            ? const []
            : <CorrectableField>[draft.affectedField!],
      ),
    );
    _dedupKeys[key] = trackingId;
    return SubmitOutcome(accepted: true, trackingId: trackingId);
  }

  @override
  Future<List<ReporterSubmissionView>> listMySubmissions() async {
    if (latency > Duration.zero) await Future<void>.delayed(latency);
    return List<ReporterSubmissionView>.unmodifiable(_submissions);
  }

  @override
  Future<ReporterSubmissionView?> getMySubmission(String submissionId) async {
    for (final s in _submissions) {
      if (s.submissionId == submissionId) return s;
    }
    return null;
  }

  @override
  Future<bool> withdraw(String submissionId) async {
    final index =
        _submissions.indexWhere((s) => s.submissionId == submissionId);
    if (index < 0) return false;
    final current = _submissions[index];
    if (!current.canWithdraw) return false;
    _submissions[index] = ReporterSubmissionView(
      submissionId: current.submissionId,
      placeId: current.placeId,
      placeTitle: current.placeTitle,
      category: current.category,
      status: SubmissionStatus.withdrawn,
      submittedAt: current.submittedAt,
      evidenceCount: current.evidenceCount,
      affectedFields: current.affectedFields,
    );
    return true;
  }

  @override
  Future<void> saveDraft(CorrectionDraft draft) async {
    // Draf disimpan dalam ingatan sesi sahaja dalam fasa ini.
  }

  /// Sokongan ujian: suntik penghantaran dengan status tertentu.
  void seed(ReporterSubmissionView view) => _submissions.add(view);
}
