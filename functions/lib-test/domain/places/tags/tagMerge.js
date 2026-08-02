"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeCanonicalTagSets = mergeCanonicalTagSets;
/** Phase 1.5 — resolusi merge set tag (berasaskan bukti, bukan last-write-wins). */
const tagEvidence_1 = require("./tagEvidence");
const tagFamilies_1 = require("./tagFamilies");
const tagRegistry_1 = require("./tagRegistry");
const tagConflicts_1 = require("./tagConflicts");
function famThenTag(a, b) {
    return a.familyId === b.familyId
        ? a.tagId.localeCompare(b.tagId)
        : a.familyId.localeCompare(b.familyId);
}
/**
 * Gabung beberapa set tag. Bukti TERKUAT dipilih per tag (bukan yang terakhir
 * ditulis). SEMUA provenance dikekalkan. Konflik keluarga safety-sensitive
 * menandakan review (tidak memadam bukti lemah secara senyap).
 */
function mergeCanonicalTagSets(tagSets, registry) {
    const all = [];
    for (const set of tagSets) {
        for (const ev of set) {
            const canonical = (0, tagRegistry_1.resolveTagId)(registry, ev.tagId);
            if (!canonical)
                continue;
            const def = (0, tagRegistry_1.getTagDefinition)(registry, canonical);
            all.push({ ...ev, tagId: canonical, familyId: def.familyId });
        }
    }
    const provenancePreserved = [...all];
    const byTag = new Map();
    for (const ev of all) {
        const l = byTag.get(ev.tagId) ?? [];
        l.push(ev);
        byTag.set(ev.tagId, l);
    }
    const selectedTags = [];
    const rejectedAlternatives = [];
    const resolutionReasons = [];
    for (const [tagId, list] of byTag) {
        const sorted = [...list].sort((a, b) => (0, tagEvidence_1.scoreTagEvidence)(b) - (0, tagEvidence_1.scoreTagEvidence)(a));
        selectedTags.push(sorted[0]);
        rejectedAlternatives.push(...sorted.slice(1));
        if (sorted.length > 1)
            resolutionReasons.push(`selected_strongest_evidence:${tagId}`);
    }
    selectedTags.sort(famThenTag);
    const conflictRes = (0, tagConflicts_1.detectTagConflicts)(selectedTags, registry);
    const warnings = [];
    for (const c of conflictRes.conflicts) {
        const fam = c.familyId ? (0, tagFamilies_1.getTagFamily)(c.familyId) : undefined;
        if (fam?.safetySensitive) {
            warnings.push(`safety_conflict_requires_review:${c.code}`);
        }
    }
    return {
        selectedTags,
        rejectedAlternatives,
        conflicts: conflictRes.conflicts,
        warnings,
        provenancePreserved,
        resolutionReasons,
    };
}
