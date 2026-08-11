/** Phase 1.5 — fixtures tag (data rekaan, deterministik). */
import { CANONICAL_TAG_REGISTRY, TagEvidence } from "../index";
import { TagFamily } from "../../placeTags";

export const T = 1_700_000_000_000;
export const REG = CANONICAL_TAG_REGISTRY;

export function ev(
  familyId: TagFamily,
  tagId: string,
  o: Partial<TagEvidence> = {},
): TagEvidence {
  return {
    tagId,
    familyId,
    evidenceLevel: "reported",
    confidence: 0.7,
    sourceType: "provider",
    validatorVersion: "tag_validator_v1",
    status: "proposed",
    ...o,
  };
}
