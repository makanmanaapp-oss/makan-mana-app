/** Phase 1.5 — resolusi merge set tag (berasaskan bukti, bukan last-write-wins). */
import { TagEvidence, scoreTagEvidence } from "./tagEvidence";
import { getTagFamily } from "./tagFamilies";
import { TagRegistry, getTagDefinition, resolveTagId } from "./tagRegistry";
import { TagConflict, detectTagConflicts } from "./tagConflicts";

export interface TagMergeResult {
  selectedTags: TagEvidence[];
  rejectedAlternatives: TagEvidence[];
  conflicts: TagConflict[];
  warnings: string[];
  /** SEMUA bukti input dikekalkan (provenance). */
  provenancePreserved: TagEvidence[];
  resolutionReasons: string[];
}

function famThenTag(a: TagEvidence, b: TagEvidence): number {
  return a.familyId === b.familyId
    ? a.tagId.localeCompare(b.tagId)
    : a.familyId.localeCompare(b.familyId);
}

/**
 * Gabung beberapa set tag. Bukti TERKUAT dipilih per tag (bukan yang terakhir
 * ditulis). SEMUA provenance dikekalkan. Konflik keluarga safety-sensitive
 * menandakan review (tidak memadam bukti lemah secara senyap).
 */
export function mergeCanonicalTagSets(
  tagSets: TagEvidence[][],
  registry: TagRegistry,
): TagMergeResult {
  const all: TagEvidence[] = [];
  for (const set of tagSets) {
    for (const ev of set) {
      const canonical = resolveTagId(registry, ev.tagId);
      if (!canonical) continue;
      const def = getTagDefinition(registry, canonical)!;
      all.push({ ...ev, tagId: canonical, familyId: def.familyId });
    }
  }
  const provenancePreserved = [...all];

  const byTag = new Map<string, TagEvidence[]>();
  for (const ev of all) {
    const l = byTag.get(ev.tagId) ?? [];
    l.push(ev);
    byTag.set(ev.tagId, l);
  }
  const selectedTags: TagEvidence[] = [];
  const rejectedAlternatives: TagEvidence[] = [];
  const resolutionReasons: string[] = [];
  for (const [tagId, list] of byTag) {
    const sorted = [...list].sort((a, b) => scoreTagEvidence(b) - scoreTagEvidence(a));
    selectedTags.push(sorted[0]);
    rejectedAlternatives.push(...sorted.slice(1));
    if (sorted.length > 1) resolutionReasons.push(`selected_strongest_evidence:${tagId}`);
  }
  selectedTags.sort(famThenTag);

  const conflictRes = detectTagConflicts(selectedTags, registry);
  const warnings: string[] = [];
  for (const c of conflictRes.conflicts) {
    const fam = c.familyId ? getTagFamily(c.familyId) : undefined;
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
