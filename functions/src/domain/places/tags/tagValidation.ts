/** Phase 1.5 — pengesahan definisi tag, bukti tag & set tag. */
import {
  ValidationIssue,
  ValidationResult,
  inUnitRange,
  isCanonicalId,
  isMember,
  isNonEmptyString,
  toResult,
} from "../common";
import { TAG_FAMILIES } from "../placeTags";
import { CanonicalTagDefinition, TAG_STATUS, TagRegistry, getTagDefinition } from "./tagRegistry";
import { TAG_EVIDENCE_STATUS, TagEvidence } from "./tagEvidence";
import { getTagFamily } from "./tagFamilies";
import { evaluateEvidencePolicy } from "./evidencePolicy";

function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message };
}

/** Sahkan satu definisi tag (struktur). */
export function validateTagDefinition(def: CanonicalTagDefinition): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isCanonicalId(def.tagId)) {
    issues.push(issue("tagId", "invalid_tag_id_format", "snake_case huruf kecil sahaja"));
  }
  if (!isMember(TAG_FAMILIES, def.familyId)) {
    issues.push(issue("familyId", "invalid_family", "keluarga tidak sah"));
  }
  if (!isMember(TAG_STATUS, def.status)) {
    issues.push(issue("status", "invalid_status", "status tidak sah"));
  }
  if (!isNonEmptyString(def.labelKey)) {
    issues.push(issue("labelKey", "empty", "labelKey kosong"));
  }
  if (def.status === "deprecated" && !isNonEmptyString(def.replacedByTagId) && def.aliases.length === 0) {
    issues.push(issue("replacedByTagId", "deprecated_without_replacement", "perlu gantian/alias"));
  }
  return toResult(issues);
}

/**
 * Sahkan senarai definisi (registri): tiada tagId gandaan merentas keluarga,
 * parent wujud, tiada kitaran parent/child.
 */
export function validateTagDefinitions(defs: CanonicalTagDefinition[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  const byId = new Map<string, CanonicalTagDefinition>();
  for (const d of defs) {
    if (seen.has(d.tagId)) {
      issues.push(issue(d.tagId, "duplicate_tag_id", "tagId gandaan"));
    }
    seen.add(d.tagId);
    byId.set(d.tagId, d);
    for (const i of validateTagDefinition(d).issues) {
      issues.push(issue(`${d.tagId}.${i.path}`, i.code, i.message));
    }
  }
  // Parent wujud + kesan kitaran (DFS).
  for (const d of defs) {
    if (d.parentTagId && !byId.has(d.parentTagId)) {
      issues.push(issue(d.tagId, "parent_not_found", `parent ${d.parentTagId}`));
    }
  }
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const hasCycle = (id: string): boolean => {
    color.set(id, GREY);
    const node = byId.get(id);
    const parent = node?.parentTagId;
    if (parent) {
      const c = color.get(parent) ?? WHITE;
      if (c === GREY) return true;
      if (c === WHITE && byId.has(parent) && hasCycle(parent)) return true;
    }
    color.set(id, BLACK);
    return false;
  };
  for (const d of defs) {
    if ((color.get(d.tagId) ?? WHITE) === WHITE && hasCycle(d.tagId)) {
      issues.push(issue(d.tagId, "hierarchy_cycle", "kitaran parent/child"));
    }
  }
  return toResult(issues);
}

/** Sahkan satu tag evidence terhadap registri + polisi. */
export function validateTagEvidence(
  ev: TagEvidence,
  registry: TagRegistry,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isCanonicalId(ev.tagId)) {
    issues.push(issue("tagId", "localized_or_invalid_tag_id", ev.tagId));
  }
  if (!inUnitRange(ev.confidence)) {
    issues.push(issue("confidence", "confidence_out_of_range", "0..1 sahaja"));
  }
  if (!isMember(TAG_EVIDENCE_STATUS, ev.status)) {
    issues.push(issue("status", "invalid_status", "status tidak sah"));
  }
  const familyDef = getTagFamily(ev.familyId);
  if (!familyDef) {
    issues.push(issue("familyId", "family_not_found", ev.familyId));
    return toResult(issues);
  }
  const tagDef = getTagDefinition(registry, ev.tagId);
  if (!tagDef) {
    issues.push(issue("tagId", "tag_not_found", ev.tagId));
    return toResult(issues);
  }
  if (tagDef.familyId !== ev.familyId) {
    issues.push(issue("familyId", "tag_family_mismatch", `tag milik ${tagDef.familyId}`));
  }
  // Polisi bukti (halal/health/dietary/allergen/safety).
  const policy = evaluateEvidencePolicy(ev, tagDef, familyDef);
  for (const code of policy.issues) issues.push(issue("policy", code, code));
  return toResult(issues);
}

/** Sahkan set tag: setiap bukti + tiada tag gandaan dalam set. */
export function validateCanonicalTagSet(
  tagSet: TagEvidence[],
  registry: TagRegistry,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  tagSet.forEach((ev, i) => {
    if (seen.has(ev.tagId)) {
      issues.push(issue(`[${i}]`, "duplicate_tag_in_set", ev.tagId));
    }
    seen.add(ev.tagId);
    for (const iss of validateTagEvidence(ev, registry).issues) {
      issues.push(issue(`[${i}].${iss.path}`, iss.code, iss.message));
    }
  });
  return toResult(issues);
}
