"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTagDefinition = validateTagDefinition;
exports.validateTagDefinitions = validateTagDefinitions;
exports.validateTagEvidence = validateTagEvidence;
exports.validateCanonicalTagSet = validateCanonicalTagSet;
/** Phase 1.5 — pengesahan definisi tag, bukti tag & set tag. */
const common_1 = require("../common");
const placeTags_1 = require("../placeTags");
const tagRegistry_1 = require("./tagRegistry");
const tagEvidence_1 = require("./tagEvidence");
const tagFamilies_1 = require("./tagFamilies");
const evidencePolicy_1 = require("./evidencePolicy");
function issue(path, code, message) {
    return { path, code, message };
}
/** Sahkan satu definisi tag (struktur). */
function validateTagDefinition(def) {
    const issues = [];
    if (!(0, common_1.isCanonicalId)(def.tagId)) {
        issues.push(issue("tagId", "invalid_tag_id_format", "snake_case huruf kecil sahaja"));
    }
    if (!(0, common_1.isMember)(placeTags_1.TAG_FAMILIES, def.familyId)) {
        issues.push(issue("familyId", "invalid_family", "keluarga tidak sah"));
    }
    if (!(0, common_1.isMember)(tagRegistry_1.TAG_STATUS, def.status)) {
        issues.push(issue("status", "invalid_status", "status tidak sah"));
    }
    if (!(0, common_1.isNonEmptyString)(def.labelKey)) {
        issues.push(issue("labelKey", "empty", "labelKey kosong"));
    }
    if (def.status === "deprecated" && !(0, common_1.isNonEmptyString)(def.replacedByTagId) && def.aliases.length === 0) {
        issues.push(issue("replacedByTagId", "deprecated_without_replacement", "perlu gantian/alias"));
    }
    return (0, common_1.toResult)(issues);
}
/**
 * Sahkan senarai definisi (registri): tiada tagId gandaan merentas keluarga,
 * parent wujud, tiada kitaran parent/child.
 */
function validateTagDefinitions(defs) {
    const issues = [];
    const seen = new Set();
    const byId = new Map();
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
    const color = new Map();
    const hasCycle = (id) => {
        color.set(id, GREY);
        const node = byId.get(id);
        const parent = node?.parentTagId;
        if (parent) {
            const c = color.get(parent) ?? WHITE;
            if (c === GREY)
                return true;
            if (c === WHITE && byId.has(parent) && hasCycle(parent))
                return true;
        }
        color.set(id, BLACK);
        return false;
    };
    for (const d of defs) {
        if ((color.get(d.tagId) ?? WHITE) === WHITE && hasCycle(d.tagId)) {
            issues.push(issue(d.tagId, "hierarchy_cycle", "kitaran parent/child"));
        }
    }
    return (0, common_1.toResult)(issues);
}
/** Sahkan satu tag evidence terhadap registri + polisi. */
function validateTagEvidence(ev, registry) {
    const issues = [];
    if (!(0, common_1.isCanonicalId)(ev.tagId)) {
        issues.push(issue("tagId", "localized_or_invalid_tag_id", ev.tagId));
    }
    if (!(0, common_1.inUnitRange)(ev.confidence)) {
        issues.push(issue("confidence", "confidence_out_of_range", "0..1 sahaja"));
    }
    if (!(0, common_1.isMember)(tagEvidence_1.TAG_EVIDENCE_STATUS, ev.status)) {
        issues.push(issue("status", "invalid_status", "status tidak sah"));
    }
    const familyDef = (0, tagFamilies_1.getTagFamily)(ev.familyId);
    if (!familyDef) {
        issues.push(issue("familyId", "family_not_found", ev.familyId));
        return (0, common_1.toResult)(issues);
    }
    const tagDef = (0, tagRegistry_1.getTagDefinition)(registry, ev.tagId);
    if (!tagDef) {
        issues.push(issue("tagId", "tag_not_found", ev.tagId));
        return (0, common_1.toResult)(issues);
    }
    if (tagDef.familyId !== ev.familyId) {
        issues.push(issue("familyId", "tag_family_mismatch", `tag milik ${tagDef.familyId}`));
    }
    // Polisi bukti (halal/health/dietary/allergen/safety).
    const policy = (0, evidencePolicy_1.evaluateEvidencePolicy)(ev, tagDef, familyDef);
    for (const code of policy.issues)
        issues.push(issue("policy", code, code));
    return (0, common_1.toResult)(issues);
}
/** Sahkan set tag: setiap bukti + tiada tag gandaan dalam set. */
function validateCanonicalTagSet(tagSet, registry) {
    const issues = [];
    const seen = new Set();
    tagSet.forEach((ev, i) => {
        if (seen.has(ev.tagId)) {
            issues.push(issue(`[${i}]`, "duplicate_tag_in_set", ev.tagId));
        }
        seen.add(ev.tagId);
        for (const iss of validateTagEvidence(ev, registry).issues) {
            issues.push(issue(`[${i}].${iss.path}`, iss.code, iss.message));
        }
    });
    return (0, common_1.toResult)(issues);
}
