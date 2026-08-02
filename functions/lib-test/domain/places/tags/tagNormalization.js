"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeCanonicalTagSet = normalizeCanonicalTagSet;
/** Phase 1.5 — normalisasi set tag (resolve alias, dedupe, susun determinstik). */
const tagEvidence_1 = require("./tagEvidence");
const tagRegistry_1 = require("./tagRegistry");
const tagConflicts_1 = require("./tagConflicts");
function famThenTag(a, b) {
    return a.familyId === b.familyId
        ? a.tagId.localeCompare(b.tagId)
        : a.familyId.localeCompare(b.familyId);
}
/**
 * Deterministik. Resolve alias→canonical, buang duplikat (kekal bukti
 * TERKUAT), susun ikut keluarga→tag. TIDAK menaik taraf aras bukti / confidence.
 */
function normalizeCanonicalTagSet(inputTags, registry) {
    const aliasResolutions = [];
    const warnings = [];
    const resolved = [];
    for (const ev of inputTags) {
        const canonical = (0, tagRegistry_1.resolveTagId)(registry, ev.tagId);
        if (!canonical) {
            warnings.push(`unknown_tag_dropped:${ev.tagId}`);
            continue;
        }
        if (canonical !== ev.tagId)
            aliasResolutions.push({ from: ev.tagId, to: canonical });
        const def = (0, tagRegistry_1.getTagDefinition)(registry, canonical);
        resolved.push({ ...ev, tagId: canonical, familyId: def.familyId });
    }
    const byTag = new Map();
    for (const ev of resolved) {
        const l = byTag.get(ev.tagId) ?? [];
        l.push(ev);
        byTag.set(ev.tagId, l);
    }
    const duplicateResolutions = [];
    const deduped = [];
    for (const [tagId, list] of byTag) {
        if (list.length === 1) {
            deduped.push(list[0]);
            continue;
        }
        const sorted = [...list].sort((a, b) => (0, tagEvidence_1.scoreTagEvidence)(b) - (0, tagEvidence_1.scoreTagEvidence)(a));
        deduped.push(sorted[0]);
        duplicateResolutions.push({
            tagId,
            keptScore: (0, tagEvidence_1.scoreTagEvidence)(sorted[0]),
            droppedCount: sorted.length - 1,
        });
    }
    deduped.sort(famThenTag);
    const conflictRes = (0, tagConflicts_1.detectTagConflicts)(deduped, registry);
    return {
        normalizedTagSet: deduped,
        aliasResolutions,
        duplicateResolutions,
        conflicts: conflictRes.conflicts,
        warnings,
    };
}
