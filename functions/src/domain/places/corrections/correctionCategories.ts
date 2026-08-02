/**
 * Phase 1.11 Part B — REGISTRI KATEGORI LAPORAN.
 *
 * Setiap kategori mengisytiharkan medan wajib, bukti minimum, keterukan lalai,
 * kepekaan keselamatan, sama ada nilai cadangan tepat dibenarkan, sama ada
 * semakan admin WAJIB, dan sama ada tindakan automatik DILARANG.
 *
 * Peraturan keselamatan yang dikuatkuasakan di sini:
 * - laporan halal pengguna TIDAK PERNAH boleh mensijilkan (autoActionForbidden)
 * - laporan alergen pengguna TIDAK PERNAH boleh menanda "selamat"
 * - laporan tutup kekal memerlukan bukti / pemerhatian
 */
import {
  CorrectableField,
  ReportCategory,
  ReportSeverity,
  SubmissionType,
} from "./correctionTypes";

export interface ReportCategoryRule {
  category: ReportCategory;
  submissionType: SubmissionType;
  /** Medan yang MESTI dihantar bersama cadangan. */
  requiredFields: readonly CorrectableField[];
  optionalFields: readonly CorrectableField[];
  /** Bilangan minimum item bukti (0 = bukti tidak wajib). */
  minimumEvidence: number;
  defaultSeverity: ReportSeverity;
  /** true = kategori menyentuh keselamatan (halal/alergen/diet/penutupan). */
  safetySensitive: boolean;
  /** true = pengguna boleh mencadangkan nilai tepat; false = laporan sahaja. */
  allowsExactProposedValue: boolean;
  /** Sentiasa true dalam fasa ini — tiada laluan auto-terima. */
  adminReviewMandatory: true;
  /**
   * true = tiada sistem automatik boleh bertindak atas laporan ini
   * (mis. mensijilkan halal, menanda alergen selamat, menutup kedai).
   */
  automaticActionForbidden: boolean;
  /** Memerlukan tarikh pemerhatian (penutupan/perpindahan). */
  requiresObservationDate: boolean;
  /** Memerlukan kedai sasaran (laporan pendua). */
  requiresDuplicateTarget: boolean;
}

function rule(
  category: ReportCategory,
  submissionType: SubmissionType,
  requiredFields: readonly CorrectableField[],
  minimumEvidence: number,
  defaultSeverity: ReportSeverity,
  safetySensitive: boolean,
  allowsExactProposedValue: boolean,
  automaticActionForbidden: boolean,
  extras: { optionalFields?: readonly CorrectableField[]; requiresObservationDate?: boolean; requiresDuplicateTarget?: boolean } = {},
): ReportCategoryRule {
  return {
    category,
    submissionType,
    requiredFields,
    optionalFields: extras.optionalFields ?? ["notes"],
    minimumEvidence,
    defaultSeverity,
    safetySensitive,
    allowsExactProposedValue,
    adminReviewMandatory: true,
    automaticActionForbidden,
    requiresObservationDate: extras.requiresObservationDate ?? false,
    requiresDuplicateTarget: extras.requiresDuplicateTarget ?? false,
  };
}

export const REPORT_CATEGORY_RULES: Readonly<Record<ReportCategory, ReportCategoryRule>> = {
  wrong_name: rule("wrong_name", "correction", ["displayName"], 0, "low", false, true, false),
  wrong_address: rule("wrong_address", "correction", ["address"], 0, "medium", false, true, false),
  wrong_coordinates: rule("wrong_coordinates", "location_report", ["coordinates"], 1, "medium", false, true, false),
  wrong_phone: rule("wrong_phone", "contact_report", ["phone"], 0, "low", false, true, false),
  wrong_website: rule("wrong_website", "contact_report", ["website"], 0, "low", false, true, false),
  wrong_hours: rule("wrong_hours", "hours_report", ["openingHours"], 0, "medium", false, true, false),
  wrong_price: rule("wrong_price", "menu_price_report", ["price"], 1, "low", false, true, false),
  wrong_rating_source: rule("wrong_rating_source", "general_report", [], 0, "low", false, false, false),

  // Penutupan & perpindahan — memerlukan pemerhatian/bukti, tiada auto-tindakan.
  permanently_closed: rule("permanently_closed", "closure_report", ["businessStatus"], 1, "high", true, false, true, { requiresObservationDate: true }),
  temporarily_closed: rule("temporarily_closed", "closure_report", ["businessStatus"], 1, "medium", true, false, true, { requiresObservationDate: true }),
  moved_location: rule("moved_location", "moved_report", ["movedToCoordinates"], 1, "high", true, true, true, { requiresObservationDate: true }),

  duplicate_place: rule("duplicate_place", "duplicate_place_report", ["duplicateTargetPlaceId"], 0, "medium", false, true, true, { requiresDuplicateTarget: true }),

  wrong_cuisine: rule("wrong_cuisine", "correction", ["cuisineTagIds"], 0, "low", false, true, false),
  wrong_place_type: rule("wrong_place_type", "correction", ["placeTypeTagIds"], 0, "low", false, true, false),

  // KESELAMATAN — laporan pengguna TIDAK PERNAH mensijilkan atau menanda selamat.
  wrong_halal_status: rule("wrong_halal_status", "halal_evidence_report", ["halalEvidence"], 1, "high", true, false, true),
  unsafe_halal_claim: rule("unsafe_halal_claim", "safety_report", [], 1, "critical", true, false, true),
  wrong_allergen_information: rule("wrong_allergen_information", "allergen_information_report", ["allergenEvidence"], 1, "high", true, false, true),
  unsafe_allergen_claim: rule("unsafe_allergen_claim", "safety_report", [], 1, "critical", true, false, true),
  wrong_dietary_information: rule("wrong_dietary_information", "correction", ["dietaryEvidence"], 1, "medium", true, false, true),

  wrong_image: rule("wrong_image", "image_report", ["imageRemovalRequest"], 0, "low", false, false, false),
  inappropriate_image: rule("inappropriate_image", "inappropriate_content", ["imageRemovalRequest"], 0, "high", false, false, true),
  spam_or_fake_place: rule("spam_or_fake_place", "inappropriate_content", [], 1, "high", false, false, true),
  other: rule("other", "general_report", [], 0, "low", false, false, false),
};

export function getCategoryRule(category: ReportCategory): ReportCategoryRule {
  return REPORT_CATEGORY_RULES[category];
}

/** Kategori yang menyentuh keselamatan (untuk penapis & laluan penyemak). */
export function safetySensitiveCategories(): ReportCategory[] {
  return (Object.keys(REPORT_CATEGORY_RULES) as ReportCategory[]).filter(
    (c) => REPORT_CATEGORY_RULES[c].safetySensitive,
  );
}

/**
 * Kategori di mana tiada sistem automatik boleh bertindak. Digunakan oleh
 * lapisan keputusan untuk membuktikan bahawa penerimaan hanya menghasilkan
 * cadangan staging.
 */
export function autoActionForbiddenCategories(): ReportCategory[] {
  return (Object.keys(REPORT_CATEGORY_RULES) as ReportCategory[]).filter(
    (c) => REPORT_CATEGORY_RULES[c].automaticActionForbidden,
  );
}
