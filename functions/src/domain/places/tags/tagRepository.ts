/**
 * Phase 1.5 — antara muka repository tag (selamat, emulator/ujian).
 * TIADA bacaan mobile, TIADA publication, TIADA tulisan klien, TIADA
 * integrasi place_registry.
 */
import { TagFamily } from "../placeTags";
import { CanonicalTagDefinition } from "./tagRegistry";
import { TagEvidence, TagEvidenceStatus } from "./tagEvidence";
import { PlaceTagAuditEntry } from "./tagAudit";
import { TrustedActor } from "../staging/stagingAudit";

export const MAX_TAG_PAGE_LIMIT = 200;

export interface TagPagination {
  limit: number;
  cursor?: string;
}
export interface TagPage<T> {
  items: T[];
  nextCursor?: string;
}

export interface PlaceTagDefinitionRepository {
  seedDefinition(def: CanonicalTagDefinition): Promise<CanonicalTagDefinition>;
  getDefinition(tagId: string): Promise<CanonicalTagDefinition | null>;
  listByFamily(
    familyId: TagFamily,
    page: TagPagination,
  ): Promise<TagPage<CanonicalTagDefinition>>;
  /** Selesaikan alias/deprecated → canonical (null jika tidak diketahui). */
  resolveAlias(tagId: string): Promise<string | null>;
}

export interface PlaceTagSetRepository {
  createProposedEvidence(
    placeId: string,
    ev: TagEvidence,
    actor: TrustedActor,
  ): Promise<TagEvidence>;
  storeNormalizedTagSet(
    placeId: string,
    tags: TagEvidence[],
    actor: TrustedActor,
  ): Promise<void>;
  getTagSet(placeId: string): Promise<TagEvidence[]>;
  /** Luluskan/tolak/expire melalui peralihan sah. */
  transitionEvidenceStatus(
    placeId: string,
    tagId: string,
    to: TagEvidenceStatus,
    actor: TrustedActor,
    reasonCode?: string,
  ): Promise<TagEvidence>;
}

export interface PlaceTagAuditRepository {
  appendAudit(entry: PlaceTagAuditEntry): Promise<PlaceTagAuditEntry>;
  listAudit(placeId: string): Promise<PlaceTagAuditEntry[]>;
}
