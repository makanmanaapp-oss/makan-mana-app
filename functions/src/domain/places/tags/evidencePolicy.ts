/**
 * Phase 1.5 — polisi bukti per-keluarga (safety-first).
 * KRITIKAL: sijil halal TIDAK boleh disimpul; keselamatan alahan TIDAK boleh
 * disimpul dari ketiadaan data; kesesuaian diet TIDAK boleh dinaik taraf
 * melebihi bukti; kata kunci ulasan kabur tidak mencipta tag keselamatan
 * disahkan.
 */
import { EvidenceLevel, SourceType } from "../placeEnums";
import { TagEvidence } from "./tagEvidence";
import { CanonicalTagDefinition } from "./tagRegistry";
import { TagFamilyDefinition } from "./tagFamilies";

export const EVIDENCE_POLICY_VERSION = "tag_evidence_policy_v1";

/** Aras bukti lalai dicadang bagi sumber (dokumentasi + fallback). */
export function defaultEvidenceLevelForSource(source: SourceType): EvidenceLevel {
  switch (source) {
    case "licensed_dataset":
      return "verified";
    case "provider":
    case "merchant":
    case "owner_upload":
    case "community":
      return "reported";
    case "makanmana":
    default:
      return "inferred";
  }
}

export interface EvidencePolicyResult {
  ok: boolean;
  issues: string[];
}

function halalPolicy(ev: TagEvidence, issues: string[]): void {
  switch (ev.tagId) {
    case "certified":
      if (ev.evidenceLevel !== "verified") {
        issues.push("halal_certified_requires_verified");
      }
      // Sijil MESTI ada pengesahan rasmi (kelulusan admin atau dataset
      // berlesen) — dakwaan merchant/komuniti sahaja TIDAK memadai.
      if (!(ev.approvedBy !== undefined || ev.sourceType === "licensed_dataset")) {
        issues.push("halal_certified_requires_official_verification");
      }
      break;
    case "merchant_claimed":
      if (!(ev.sourceType === "merchant" || ev.sourceType === "owner_upload")) {
        issues.push("halal_merchant_claim_requires_merchant_source");
      }
      break;
    case "community_reported":
      if (ev.sourceType !== "community") {
        issues.push("halal_community_report_requires_community_source");
      }
      break;
    case "possible_non_halal":
      if (ev.evidenceLevel === "unknown" || ev.evidenceLevel === "inferred") {
        issues.push("halal_possible_non_halal_requires_evidence");
      }
      break;
    default:
      break;
  }
}

function healthPolicy(ev: TagEvidence, issues: string[]): void {
  // "verified" health perlu bukti menu/hidangan (sourceRecordId).
  if (ev.evidenceLevel === "verified" && ev.sourceRecordId === undefined) {
    issues.push("health_verified_requires_menu_evidence");
  }
  // Inferens peringkat-restoran mesti keyakinan rendah.
  if (ev.evidenceLevel === "inferred" && ev.confidence > 0.5) {
    issues.push("health_inferred_confidence_too_high");
  }
}

/**
 * Nilai polisi bukti untuk satu tag evidence. Aras bukti mesti dibenarkan oleh
 * keluarga; peraturan keselamatan tambahan bagi halal/health. Ketiadaan alahan
 * TIDAK menjadi tag (tiada medan "selamat") — jadi keselamatan tidak boleh
 * disimpul secara struktur.
 */
export function evaluateEvidencePolicy(
  ev: TagEvidence,
  tagDef: CanonicalTagDefinition,
  familyDef: TagFamilyDefinition,
): EvidencePolicyResult {
  const issues: string[] = [];

  if (!familyDef.allowedEvidenceLevels.includes(ev.evidenceLevel)) {
    issues.push("evidence_level_not_allowed_for_family");
  }

  // Tag safety-sensitive tidak boleh bergantung pada "inferred" kecuali
  // dibenarkan eksplisit oleh keluarga (dietary/allergen: tiada inferred).
  if (
    tagDef.safetySensitive &&
    ev.evidenceLevel === "inferred" &&
    !familyDef.allowedEvidenceLevels.includes("inferred")
  ) {
    issues.push("safety_tag_cannot_be_inferred");
  }

  if (familyDef.familyId === "halal_evidence") halalPolicy(ev, issues);
  if (familyDef.familyId === "health") healthPolicy(ev, issues);

  return { ok: issues.length === 0, issues };
}
