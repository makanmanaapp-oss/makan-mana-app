/** Phase 1.5 — pengesanan konflik tag. */
import { TagFamily } from "../placeTags";
import { TagEvidence } from "./tagEvidence";
import { getTagFamily } from "./tagFamilies";
import { TagRegistry, getTagDefinition } from "./tagRegistry";

export interface TagConflict {
  code: string;
  tagIds: string[];
  familyId?: string;
  message: string;
}

export interface TagConflictResult {
  conflicts: TagConflict[];
  warnings: TagConflict[];
  resolutionRequired: boolean;
  safeForPublication: boolean;
}

/**
 * Kesan konflik. Berbilang cuisine / meal_slot BUKAN konflik (multi_value).
 * Keluarga single_value/exclusive_states dengan >1 tag = konflik. Pasangan
 * exclusionTagIds = konflik. Deprecated + gantian hadir serentak = amaran.
 */
export function detectTagConflicts(
  tagSet: TagEvidence[],
  registry: TagRegistry,
): TagConflictResult {
  const conflicts: TagConflict[] = [];
  const warnings: TagConflict[] = [];
  const seen = new Set<string>();
  const add = (c: TagConflict, target: TagConflict[]) => {
    const key = `${c.code}:${[...c.tagIds].sort().join(",")}`;
    if (seen.has(key)) return;
    seen.add(key);
    target.push(c);
  };

  // 1. Keluarga nilai-tunggal dengan >1 tag.
  const byFamily = new Map<TagFamily, TagEvidence[]>();
  for (const ev of tagSet) {
    const list = byFamily.get(ev.familyId) ?? [];
    list.push(ev);
    byFamily.set(ev.familyId, list);
  }
  for (const [family, tags] of byFamily) {
    const fam = getTagFamily(family);
    if (!fam) continue;
    if (
      (fam.conflictPolicy === "single_value" || fam.conflictPolicy === "exclusive_states") &&
      tags.length > 1
    ) {
      add(
        {
          code: "single_value_family_conflict",
          tagIds: tags.map((t) => t.tagId),
          familyId: family,
          message: `keluarga ${family} hanya benarkan satu nilai`,
        },
        conflicts,
      );
    }
  }

  // 2. Pasangan exclusionTagIds.
  const present = new Set(tagSet.map((t) => t.tagId));
  for (const ev of tagSet) {
    const def = getTagDefinition(registry, ev.tagId);
    if (!def) continue;
    for (const excl of def.exclusionTagIds) {
      if (present.has(excl)) {
        add(
          {
            code: "exclusion_conflict",
            tagIds: [ev.tagId, excl],
            familyId: def.familyId,
            message: `${ev.tagId} vs ${excl}`,
          },
          conflicts,
        );
      }
    }
  }

  // 3. Deprecated + gantian hadir serentak.
  for (const ev of tagSet) {
    const def = getTagDefinition(registry, ev.tagId);
    if (def?.status === "deprecated" && def.replacedByTagId && present.has(def.replacedByTagId)) {
      add(
        {
          code: "deprecated_and_replacement_present",
          tagIds: [ev.tagId, def.replacedByTagId],
          familyId: def.familyId,
          message: "tag deprecated & gantian wujud serentak",
        },
        warnings,
      );
    }
  }

  return {
    conflicts,
    warnings,
    resolutionRequired: conflicts.length > 0,
    safeForPublication: conflicts.length === 0,
  };
}
