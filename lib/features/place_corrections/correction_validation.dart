/// PART 1 Phase 1.11 — pengesahan pembetulan sisi klien (tulen).
///
/// Cermin peraturan backend supaya pengguna mendapat maklum balas awal.
/// Backend TETAP mengesahkan semula — pengesahan klien tidak pernah dipercayai.
library;

import 'correction_models.dart';

class CorrectionValidationResult {
  const CorrectionValidationResult({
    required this.valid,
    this.errorKeys = const [],
  });

  final bool valid;
  final List<String> errorKeys;

  static const CorrectionValidationResult ok =
      CorrectionValidationResult(valid: true);
}

const int kMaxDescriptionLength = 1000;
const int kMinDescriptionLength = 10;
const int kMaxEvidenceItems = 8;

/// Pengesahan URL sintaksis sahaja (tiada capaian rangkaian).
bool isSyntacticallyValidUrl(String value) {
  final uri = Uri.tryParse(value.trim());
  if (uri == null) return false;
  return (uri.scheme == 'http' || uri.scheme == 'https') && uri.host.isNotEmpty;
}

final RegExp _phoneRe = RegExp(r'^\+?[0-9][0-9\s-]{6,19}$');

bool isValidPhone(String value) => _phoneRe.hasMatch(value.trim());

bool isValidLatLng(double lat, double lng) =>
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

/// Sahkan draf sebelum membenarkan penghantaran.
CorrectionValidationResult validateDraft(CorrectionDraft draft) {
  final errors = <String>[];
  final rule = draft.rule;

  if (draft.snapshot.placeId.trim().isEmpty) {
    errors.add('reportErrorPlaceMissing');
  }
  if (draft.snapshot.contentHash.trim().isEmpty) {
    errors.add('reportErrorSnapshotMissing');
  }

  // Medan wajib mengikut kategori.
  if (rule.requiredFields.isNotEmpty) {
    final value = draft.proposedValue?.trim() ?? '';
    if (draft.affectedField == null || value.isEmpty) {
      errors.add('reportErrorProposedValueRequired');
    }
  }

  // Cadangan kosong tidak sah bila kategori menerima nilai tepat.
  if (rule.allowsExactProposedValue &&
      (draft.proposedValue == null || draft.proposedValue!.trim().isEmpty) &&
      draft.description.trim().isEmpty) {
    errors.add('reportErrorEmptyCorrection');
  }

  final description = draft.description.trim();
  if (description.length < kMinDescriptionLength) {
    errors.add('reportErrorDescriptionShort');
  }
  if (draft.description.length > kMaxDescriptionLength) {
    errors.add('reportErrorDescriptionLong');
  }

  if (draft.evidence.length > kMaxEvidenceItems) {
    errors.add('reportErrorTooMuchEvidence');
  }
  if (draft.evidence.length < rule.minimumEvidence) {
    errors.add('reportErrorEvidenceRequired');
  }
  if (rule.requiresObservationDate &&
      !draft.evidence.any((e) => e.observedAt != null)) {
    errors.add('reportErrorObservationDateRequired');
  }
  if (rule.requiresDuplicateTarget &&
      (draft.proposedValue == null || draft.proposedValue!.trim().isEmpty)) {
    errors.add('reportErrorDuplicateTargetRequired');
  }

  // Pengesahan format khusus medan.
  final value = draft.proposedValue?.trim() ?? '';
  if (value.isNotEmpty) {
    switch (draft.affectedField) {
      case CorrectableField.phone:
        if (!isValidPhone(value)) errors.add('reportErrorInvalidPhone');
        break;
      case CorrectableField.website:
        if (!isSyntacticallyValidUrl(value)) {
          errors.add('reportErrorInvalidWebsite');
        }
        break;
      case CorrectableField.coordinates:
      case CorrectableField.movedToCoordinates:
        final parts = value.split(',');
        final lat = parts.length == 2 ? double.tryParse(parts[0].trim()) : null;
        final lng = parts.length == 2 ? double.tryParse(parts[1].trim()) : null;
        if (lat == null || lng == null || !isValidLatLng(lat, lng)) {
          errors.add('reportErrorInvalidCoordinates');
        }
        break;
      default:
        break;
    }
  }

  return errors.isEmpty
      ? CorrectionValidationResult.ok
      : CorrectionValidationResult(valid: false, errorKeys: errors);
}

/// Sahkan satu item bukti.
CorrectionValidationResult validateEvidence(ReportEvidenceDraft evidence) {
  final errors = <String>[];
  if (evidence.confidence < 0 || evidence.confidence > 1) {
    errors.add('reportErrorEvidenceConfidence');
  }
  if (evidence.evidenceType == ReportEvidenceType.websiteLink) {
    final link = evidence.sourceReference ?? '';
    if (!isSyntacticallyValidUrl(link)) {
      errors.add('reportErrorInvalidEvidenceUrl');
    }
  }
  return errors.isEmpty
      ? CorrectionValidationResult.ok
      : CorrectionValidationResult(valid: false, errorKeys: errors);
}
