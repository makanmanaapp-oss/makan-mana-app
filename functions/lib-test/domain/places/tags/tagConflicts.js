"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectTagConflicts = detectTagConflicts;
const tagFamilies_1 = require("./tagFamilies");
const tagRegistry_1 = require("./tagRegistry");
/**
 * Kesan konflik. Berbilang cuisine / meal_slot BUKAN konflik (multi_value).
 * Keluarga single_value/exclusive_states dengan >1 tag = konflik. Pasangan
 * exclusionTagIds = konflik. Deprecated + gantian hadir serentak = amaran.
 */
function detectTagConflicts(tagSet, registry) {
    const conflicts = [];
    const warnings = [];
    const seen = new Set();
    const add = (c, target) => {
        const key = `${c.code}:${[...c.tagIds].sort().join(",")}`;
        if (seen.has(key))
            return;
        seen.add(key);
        target.push(c);
    };
    // 1. Keluarga nilai-tunggal dengan >1 tag.
    const byFamily = new Map();
    for (const ev of tagSet) {
        const list = byFamily.get(ev.familyId) ?? [];
        list.push(ev);
        byFamily.set(ev.familyId, list);
    }
    for (const [family, tags] of byFamily) {
        const fam = (0, tagFamilies_1.getTagFamily)(family);
        if (!fam)
            continue;
        if ((fam.conflictPolicy === "single_value" || fam.conflictPolicy === "exclusive_states") &&
            tags.length > 1) {
            add({
                code: "single_value_family_conflict",
                tagIds: tags.map((t) => t.tagId),
                familyId: family,
                message: `keluarga ${family} hanya benarkan satu nilai`,
            }, conflicts);
        }
    }
    // 2. Pasangan exclusionTagIds.
    const present = new Set(tagSet.map((t) => t.tagId));
    for (const ev of tagSet) {
        const def = (0, tagRegistry_1.getTagDefinition)(registry, ev.tagId);
        if (!def)
            continue;
        for (const excl of def.exclusionTagIds) {
            if (present.has(excl)) {
                add({
                    code: "exclusion_conflict",
                    tagIds: [ev.tagId, excl],
                    familyId: def.familyId,
                    message: `${ev.tagId} vs ${excl}`,
                }, conflicts);
            }
        }
    }
    // 3. Deprecated + gantian hadir serentak.
    for (const ev of tagSet) {
        const def = (0, tagRegistry_1.getTagDefinition)(registry, ev.tagId);
        if (def?.status === "deprecated" && def.replacedByTagId && present.has(def.replacedByTagId)) {
            add({
                code: "deprecated_and_replacement_present",
                tagIds: [ev.tagId, def.replacedByTagId],
                familyId: def.familyId,
                message: "tag deprecated & gantian wujud serentak",
            }, warnings);
        }
    }
    return {
        conflicts,
        warnings,
        resolutionRequired: conflicts.length > 0,
        safeForPublication: conflicts.length === 0,
    };
}
