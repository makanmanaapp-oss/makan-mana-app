/** Phase 1.5 — normalisasi set tag (resolve alias, dedupe, susun determinstik). */
import { TagEvidence, scoreTagEvidence } from "./tagEvidence";
import { TagRegistry, getTagDefinition, resolveTagId } from "./tagRegistry";
import { TagConflict, detectTagConflicts } from "./tagConflicts";

export interface AliasResolutionEntry {
  from: string;
  to: string;
}
export interface DuplicateResolutionEntry {
  tagId: string;
  keptScore: number;
  droppedCount: number;
}
export interface TagNormalizationResult {
  normalizedTagSet: TagEvidence[];
  aliasResolutions: AliasResolutionEntry[];
  duplicateResolutions: DuplicateResolutionEntry[];
  conflicts: TagConflict[];
  warnings: string[];
}

function famThenTag(a: TagEvidence, b: TagEvidence): number {
  return a.familyId === b.familyId
    ? a.tagId.localeCompare(b.tagId)
    : a.familyId.localeCompare(b.familyId);
}

/**
 * Deterministik. Resolve alias→canonical, buang duplikat (kekal bukti
 * TERKUAT), susun ikut keluarga→tag. TIDAK menaik taraf aras bukti / confidence.
 */
export function normalizeCanonicalTagSet(
  inputTags: TagEvidence[],
  registry: TagRegistry,
): TagNormalizationResult {
  const aliasResolutions: AliasResolutionEntry[] = [];
  const warnings: string[] = [];

  const resolved: TagEvidence[] = [];
  for (const ev of inputTags) {
    const canonical = resolveTagId(registry, ev.tagId);
    if (!canonical) {
      warnings.push(`unknown_tag_dropped:${ev.tagId}`);
      continue;
    }
    if (canonical !== ev.tagId) aliasResolutions.push({ from: ev.tagId, to: canonical });
    const def = getTagDefinition(registry, canonical)!;
    resolved.push({ ...ev, tagId: canonical, familyId: def.familyId });
  }

  const byTag = new Map<string, TagEvidence[]>();
  for (const ev of resolved) {
    const l = byTag.get(ev.tagId) ?? [];
    l.push(ev);
    byTag.set(ev.tagId, l);
  }
  const duplicateResolutions: DuplicateResolutionEntry[] = [];
  const deduped: TagEvidence[] = [];
  for (const [tagId, list] of byTag) {
    if (list.length === 1) {
      deduped.push(list[0]);
      continue;
    }
    const sorted = [...list].sort((a, b) => scoreTagEvidence(b) - scoreTagEvidence(a));
    deduped.push(sorted[0]);
    duplicateResolutions.push({
      tagId,
      keptScore: scoreTagEvidence(sorted[0]),
      droppedCount: sorted.length - 1,
    });
  }
  deduped.sort(famThenTag);

  const conflictRes = detectTagConflicts(deduped, registry);
  return {
    normalizedTagSet: deduped,
    aliasResolutions,
    duplicateResolutions,
    conflicts: conflictRes.conflicts,
    warnings,
  };
}
