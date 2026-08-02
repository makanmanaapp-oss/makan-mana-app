/// PART 1 Phase 1.11 — model pembetulan/laporan sisi Flutter.
///
/// Mencerminkan kontrak backend (functions/src/domain/places/corrections).
/// Semua nilai yang dicadangkan pengguna kekal TIDAK DISAHKAN. Tiada model di
/// sini boleh menetapkan keadaan kelulusan, penerbitan atau pengesahan.
library;

/// Jenis penghantaran (ID kanonikal — bukan label terjemah).
enum ReportSubmissionType {
  correction,
  safetyReport,
  closureReport,
  movedReport,
  duplicatePlaceReport,
  inappropriateContent,
  imageReport,
  menuPriceReport,
  hoursReport,
  contactReport,
  locationReport,
  halalEvidenceReport,
  allergenInformationReport,
  generalReport,
}

/// Kategori laporan — sepadan dengan registri backend.
enum ReportCategory {
  wrongName,
  wrongAddress,
  wrongCoordinates,
  wrongPhone,
  wrongWebsite,
  wrongHours,
  wrongPrice,
  permanentlyClosed,
  temporarilyClosed,
  movedLocation,
  duplicatePlace,
  wrongCuisine,
  wrongPlaceType,
  wrongHalalStatus,
  unsafeHalalClaim,
  wrongAllergenInformation,
  unsafeAllergenClaim,
  wrongDietaryInformation,
  wrongImage,
  inappropriateImage,
  spamOrFakePlace,
  other,
}

/// Medan yang boleh dicadangkan pengguna.
enum CorrectableField {
  displayName,
  address,
  coordinates,
  phone,
  website,
  openingHours,
  price,
  businessStatus,
  halalEvidence,
  dietaryEvidence,
  allergenEvidence,
  cuisineTagIds,
  placeTypeTagIds,
  imageRemovalRequest,
  duplicateTargetPlaceId,
  movedToCoordinates,
  notes,
}

enum ReportEvidenceType {
  photo,
  receipt,
  menuPhoto,
  storefrontPhoto,
  certificatePhoto,
  mapScreenshot,
  websiteLink,
  officialDocument,
  userObservation,
  merchantStatement,
  communityStatement,
  other,
}

enum SubmissionStatus {
  draft,
  submitted,
  validationFailed,
  queued,
  underReview,
  needsMoreEvidence,
  duplicateReport,
  acceptedForStaging,
  rejected,
  withdrawn,
  resolved,
  superseded,
}

/// Kunci l10n untuk setiap status (teks + ikon, bukan warna sahaja).
const Map<SubmissionStatus, String> kStatusLabelKeys = {
  SubmissionStatus.draft: 'reportStatusDraft',
  SubmissionStatus.submitted: 'reportStatusSubmitted',
  SubmissionStatus.validationFailed: 'reportStatusValidationFailed',
  SubmissionStatus.queued: 'reportStatusQueued',
  SubmissionStatus.underReview: 'reportStatusUnderReview',
  SubmissionStatus.needsMoreEvidence: 'reportStatusNeedsMoreEvidence',
  SubmissionStatus.duplicateReport: 'reportStatusDuplicate',
  SubmissionStatus.acceptedForStaging: 'reportStatusAccepted',
  SubmissionStatus.rejected: 'reportStatusRejected',
  SubmissionStatus.withdrawn: 'reportStatusWithdrawn',
  SubmissionStatus.resolved: 'reportStatusResolved',
  SubmissionStatus.superseded: 'reportStatusSuperseded',
};

/// Kunci l10n untuk setiap kategori.
const Map<ReportCategory, String> kCategoryLabelKeys = {
  ReportCategory.wrongName: 'reportWrongName',
  ReportCategory.wrongAddress: 'reportWrongAddress',
  ReportCategory.wrongCoordinates: 'reportWrongLocation',
  ReportCategory.wrongPhone: 'reportWrongPhone',
  ReportCategory.wrongWebsite: 'reportWrongWebsite',
  ReportCategory.wrongHours: 'reportWrongHours',
  ReportCategory.wrongPrice: 'reportWrongPrice',
  ReportCategory.permanentlyClosed: 'reportClosed',
  ReportCategory.temporarilyClosed: 'reportTemporarilyClosed',
  ReportCategory.movedLocation: 'reportMoved',
  ReportCategory.duplicatePlace: 'reportDuplicate',
  ReportCategory.wrongCuisine: 'reportWrongCuisine',
  ReportCategory.wrongPlaceType: 'reportWrongPlaceType',
  ReportCategory.wrongHalalStatus: 'reportWrongHalalStatus',
  ReportCategory.unsafeHalalClaim: 'reportUnsafeHalalClaim',
  ReportCategory.wrongAllergenInformation: 'reportWrongAllergenInfo',
  ReportCategory.unsafeAllergenClaim: 'reportUnsafeAllergenClaim',
  ReportCategory.wrongDietaryInformation: 'reportWrongDietaryInfo',
  ReportCategory.wrongImage: 'reportWrongImage',
  ReportCategory.inappropriateImage: 'reportInappropriateImage',
  ReportCategory.spamOrFakePlace: 'reportSpamPlace',
  ReportCategory.other: 'reportOther',
};

/// Peraturan kategori sisi klien (cermin registri backend).
class ReportCategoryRule {
  const ReportCategoryRule({
    required this.category,
    required this.submissionType,
    required this.requiredFields,
    required this.minimumEvidence,
    required this.safetySensitive,
    required this.allowsExactProposedValue,
    required this.requiresObservationDate,
    required this.requiresDuplicateTarget,
  });

  final ReportCategory category;
  final ReportSubmissionType submissionType;
  final List<CorrectableField> requiredFields;
  final int minimumEvidence;
  final bool safetySensitive;
  final bool allowsExactProposedValue;
  final bool requiresObservationDate;
  final bool requiresDuplicateTarget;

  /// Semakan admin sentiasa WAJIB dalam fasa ini.
  bool get adminReviewMandatory => true;
}

const Map<ReportCategory, ReportCategoryRule> kCategoryRules = {
  ReportCategory.wrongName: ReportCategoryRule(
    category: ReportCategory.wrongName,
    submissionType: ReportSubmissionType.correction,
    requiredFields: [CorrectableField.displayName],
    minimumEvidence: 0,
    safetySensitive: false,
    allowsExactProposedValue: true,
    requiresObservationDate: false,
    requiresDuplicateTarget: false,
  ),
  ReportCategory.wrongAddress: ReportCategoryRule(
    category: ReportCategory.wrongAddress,
    submissionType: ReportSubmissionType.correction,
    requiredFields: [CorrectableField.address],
    minimumEvidence: 0,
    safetySensitive: false,
    allowsExactProposedValue: true,
    requiresObservationDate: false,
    requiresDuplicateTarget: false,
  ),
  ReportCategory.wrongPhone: ReportCategoryRule(
    category: ReportCategory.wrongPhone,
    submissionType: ReportSubmissionType.contactReport,
    requiredFields: [CorrectableField.phone],
    minimumEvidence: 0,
    safetySensitive: false,
    allowsExactProposedValue: true,
    requiresObservationDate: false,
    requiresDuplicateTarget: false,
  ),
  ReportCategory.wrongWebsite: ReportCategoryRule(
    category: ReportCategory.wrongWebsite,
    submissionType: ReportSubmissionType.contactReport,
    requiredFields: [CorrectableField.website],
    minimumEvidence: 0,
    safetySensitive: false,
    allowsExactProposedValue: true,
    requiresObservationDate: false,
    requiresDuplicateTarget: false,
  ),
  ReportCategory.wrongHours: ReportCategoryRule(
    category: ReportCategory.wrongHours,
    submissionType: ReportSubmissionType.hoursReport,
    requiredFields: [CorrectableField.openingHours],
    minimumEvidence: 0,
    safetySensitive: false,
    allowsExactProposedValue: true,
    requiresObservationDate: false,
    requiresDuplicateTarget: false,
  ),
  ReportCategory.wrongPrice: ReportCategoryRule(
    category: ReportCategory.wrongPrice,
    submissionType: ReportSubmissionType.menuPriceReport,
    requiredFields: [CorrectableField.price],
    minimumEvidence: 1,
    safetySensitive: false,
    allowsExactProposedValue: true,
    requiresObservationDate: false,
    requiresDuplicateTarget: false,
  ),
  ReportCategory.permanentlyClosed: ReportCategoryRule(
    category: ReportCategory.permanentlyClosed,
    submissionType: ReportSubmissionType.closureReport,
    requiredFields: [CorrectableField.businessStatus],
    minimumEvidence: 1,
    safetySensitive: true,
    allowsExactProposedValue: false,
    requiresObservationDate: true,
    requiresDuplicateTarget: false,
  ),
  ReportCategory.temporarilyClosed: ReportCategoryRule(
    category: ReportCategory.temporarilyClosed,
    submissionType: ReportSubmissionType.closureReport,
    requiredFields: [CorrectableField.businessStatus],
    minimumEvidence: 1,
    safetySensitive: true,
    allowsExactProposedValue: false,
    requiresObservationDate: true,
    requiresDuplicateTarget: false,
  ),
  ReportCategory.movedLocation: ReportCategoryRule(
    category: ReportCategory.movedLocation,
    submissionType: ReportSubmissionType.movedReport,
    requiredFields: [CorrectableField.movedToCoordinates],
    minimumEvidence: 1,
    safetySensitive: true,
    allowsExactProposedValue: true,
    requiresObservationDate: true,
    requiresDuplicateTarget: false,
  ),
  ReportCategory.duplicatePlace: ReportCategoryRule(
    category: ReportCategory.duplicatePlace,
    submissionType: ReportSubmissionType.duplicatePlaceReport,
    requiredFields: [CorrectableField.duplicateTargetPlaceId],
    minimumEvidence: 0,
    safetySensitive: false,
    allowsExactProposedValue: true,
    requiresObservationDate: false,
    requiresDuplicateTarget: true,
  ),
  ReportCategory.wrongHalalStatus: ReportCategoryRule(
    category: ReportCategory.wrongHalalStatus,
    submissionType: ReportSubmissionType.halalEvidenceReport,
    requiredFields: [CorrectableField.halalEvidence],
    minimumEvidence: 1,
    safetySensitive: true,
    allowsExactProposedValue: false,
    requiresObservationDate: false,
    requiresDuplicateTarget: false,
  ),
  ReportCategory.unsafeHalalClaim: ReportCategoryRule(
    category: ReportCategory.unsafeHalalClaim,
    submissionType: ReportSubmissionType.safetyReport,
    requiredFields: [],
    minimumEvidence: 1,
    safetySensitive: true,
    allowsExactProposedValue: false,
    requiresObservationDate: false,
    requiresDuplicateTarget: false,
  ),
  ReportCategory.wrongAllergenInformation: ReportCategoryRule(
    category: ReportCategory.wrongAllergenInformation,
    submissionType: ReportSubmissionType.allergenInformationReport,
    requiredFields: [CorrectableField.allergenEvidence],
    minimumEvidence: 1,
    safetySensitive: true,
    allowsExactProposedValue: false,
    requiresObservationDate: false,
    requiresDuplicateTarget: false,
  ),
  ReportCategory.unsafeAllergenClaim: ReportCategoryRule(
    category: ReportCategory.unsafeAllergenClaim,
    submissionType: ReportSubmissionType.safetyReport,
    requiredFields: [],
    minimumEvidence: 1,
    safetySensitive: true,
    allowsExactProposedValue: false,
    requiresObservationDate: false,
    requiresDuplicateTarget: false,
  ),
  ReportCategory.wrongDietaryInformation: ReportCategoryRule(
    category: ReportCategory.wrongDietaryInformation,
    submissionType: ReportSubmissionType.correction,
    requiredFields: [CorrectableField.dietaryEvidence],
    minimumEvidence: 1,
    safetySensitive: true,
    allowsExactProposedValue: false,
    requiresObservationDate: false,
    requiresDuplicateTarget: false,
  ),
  ReportCategory.wrongImage: ReportCategoryRule(
    category: ReportCategory.wrongImage,
    submissionType: ReportSubmissionType.imageReport,
    requiredFields: [CorrectableField.imageRemovalRequest],
    minimumEvidence: 0,
    safetySensitive: false,
    allowsExactProposedValue: false,
    requiresObservationDate: false,
    requiresDuplicateTarget: false,
  ),
  ReportCategory.inappropriateImage: ReportCategoryRule(
    category: ReportCategory.inappropriateImage,
    submissionType: ReportSubmissionType.inappropriateContent,
    requiredFields: [CorrectableField.imageRemovalRequest],
    minimumEvidence: 0,
    safetySensitive: false,
    allowsExactProposedValue: false,
    requiresObservationDate: false,
    requiresDuplicateTarget: false,
  ),
  ReportCategory.wrongCoordinates: ReportCategoryRule(
    category: ReportCategory.wrongCoordinates,
    submissionType: ReportSubmissionType.locationReport,
    requiredFields: [CorrectableField.coordinates],
    minimumEvidence: 1,
    safetySensitive: false,
    allowsExactProposedValue: true,
    requiresObservationDate: false,
    requiresDuplicateTarget: false,
  ),
  ReportCategory.wrongCuisine: ReportCategoryRule(
    category: ReportCategory.wrongCuisine,
    submissionType: ReportSubmissionType.correction,
    requiredFields: [CorrectableField.cuisineTagIds],
    minimumEvidence: 0,
    safetySensitive: false,
    allowsExactProposedValue: true,
    requiresObservationDate: false,
    requiresDuplicateTarget: false,
  ),
  ReportCategory.wrongPlaceType: ReportCategoryRule(
    category: ReportCategory.wrongPlaceType,
    submissionType: ReportSubmissionType.correction,
    requiredFields: [CorrectableField.placeTypeTagIds],
    minimumEvidence: 0,
    safetySensitive: false,
    allowsExactProposedValue: true,
    requiresObservationDate: false,
    requiresDuplicateTarget: false,
  ),
  ReportCategory.spamOrFakePlace: ReportCategoryRule(
    category: ReportCategory.spamOrFakePlace,
    submissionType: ReportSubmissionType.inappropriateContent,
    requiredFields: [],
    minimumEvidence: 1,
    safetySensitive: false,
    allowsExactProposedValue: false,
    requiresObservationDate: false,
    requiresDuplicateTarget: false,
  ),
  ReportCategory.other: ReportCategoryRule(
    category: ReportCategory.other,
    submissionType: ReportSubmissionType.generalReport,
    requiredFields: [],
    minimumEvidence: 0,
    safetySensitive: false,
    allowsExactProposedValue: false,
    requiresObservationDate: false,
    requiresDuplicateTarget: false,
  ),
};

ReportCategoryRule ruleFor(ReportCategory category) =>
    kCategoryRules[category] ?? kCategoryRules[ReportCategory.other]!;

/// Snapshot IMMUTABLE bagi apa yang pengguna LIHAT semasa melapor.
class ReportOriginalSnapshot {
  const ReportOriginalSnapshot({
    required this.placeId,
    required this.title,
    required this.capturedAt,
    required this.contentHash,
    this.publicationId,
    this.publicationVersion,
    this.address,
    this.phone,
    this.website,
    this.hoursState = 'hours_unknown',
    this.priceState = 'price_unknown',
    this.ratingState = 'rating_hidden',
    this.businessState = 'status_unknown',
    this.halalState = 'halal_unknown',
    this.dietaryState = 'dietary_unknown',
    this.allergenState = 'allergen_unknown',
    this.sourceMode = 'live',
    this.imageReferences = const [],
    this.tagIds = const [],
    this.warnings = const [],
  });

  final String placeId;
  final String title;
  final DateTime capturedAt;
  final String contentHash;
  final String? publicationId;
  final int? publicationVersion;
  final String? address;
  final String? phone;
  final String? website;
  final String hoursState;
  final String priceState;
  final String ratingState;
  final String businessState;
  final String halalState;
  final String dietaryState;
  final String allergenState;
  final String sourceMode;
  final List<String> imageReferences;
  final List<String> tagIds;
  final List<String> warnings;

  /// Nilai semasa bagi satu medan (untuk paparan "nilai semasa").
  String? currentValueFor(CorrectableField field) {
    switch (field) {
      case CorrectableField.displayName:
        return title;
      case CorrectableField.address:
        return address;
      case CorrectableField.phone:
        return phone;
      case CorrectableField.website:
        return website;
      case CorrectableField.openingHours:
        return hoursState;
      case CorrectableField.price:
        return priceState;
      case CorrectableField.businessStatus:
        return businessState;
      case CorrectableField.halalEvidence:
        return halalState;
      case CorrectableField.dietaryEvidence:
        return dietaryState;
      case CorrectableField.allergenEvidence:
        return allergenState;
      default:
        return null;
    }
  }
}

/// Metadata bukti — METADATA SAHAJA dalam fasa ini (tiada muat naik).
class ReportEvidenceDraft {
  const ReportEvidenceDraft({
    required this.evidenceId,
    required this.evidenceType,
    this.textNote,
    this.sourceReference,
    this.fileName,
    this.observedAt,
    this.confidence = 0.5,
  });

  final String evidenceId;
  final ReportEvidenceType evidenceType;
  final String? textNote;
  final String? sourceReference;
  final String? fileName;
  final DateTime? observedAt;
  final double confidence;
}

/// Draf pembetulan yang sedang disunting pengguna.
class CorrectionDraft {
  CorrectionDraft({
    required this.snapshot,
    required this.category,
    this.affectedField,
    this.proposedValue,
    this.description = '',
    List<ReportEvidenceDraft>? evidence,
  }) : evidence = evidence ?? <ReportEvidenceDraft>[];

  final ReportOriginalSnapshot snapshot;
  ReportCategory category;
  CorrectableField? affectedField;
  String? proposedValue;
  String description;
  final List<ReportEvidenceDraft> evidence;

  ReportCategoryRule get rule => ruleFor(category);
  ReportSubmissionType get submissionType => rule.submissionType;

  String? get currentValue =>
      affectedField == null ? null : snapshot.currentValueFor(affectedField!);
}

/// Rekod penghantaran yang dilihat PELAPOR (tiada identiti penyemak).
class ReporterSubmissionView {
  const ReporterSubmissionView({
    required this.submissionId,
    required this.placeId,
    required this.placeTitle,
    required this.category,
    required this.status,
    required this.submittedAt,
    required this.evidenceCount,
    this.requiredNextActionKey,
    this.affectedFields = const [],
  });

  final String submissionId;
  final String placeId;
  final String placeTitle;
  final ReportCategory category;
  final SubmissionStatus status;
  final DateTime submittedAt;
  final int evidenceCount;
  final String? requiredNextActionKey;
  final List<CorrectableField> affectedFields;

  /// Pelapor boleh menarik balik hanya dalam status ini.
  bool get canWithdraw =>
      status == SubmissionStatus.submitted ||
      status == SubmissionStatus.queued ||
      status == SubmissionStatus.needsMoreEvidence;

  /// Pelapor boleh menghantar semula dengan bukti tambahan.
  bool get canResubmitWithEvidence =>
      status == SubmissionStatus.needsMoreEvidence;
}
