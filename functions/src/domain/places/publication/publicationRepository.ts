/**
 * Phase 1.6 Part L — ANTARA MUKA REPOSITORY PENERBITAN (emulator sahaja).
 *
 * Sengaja TIADA operasi untuk:
 * - bacaan mobile / laluan produksi
 * - tulisan `place_registry`
 * - invalidasi cache LANGSUNG
 * - tulisan terus browser-admin
 * - hard delete (sejarah tidak boleh dimusnahkan)
 *
 * Semua operasi menulis memerlukan `TrustedActor` yang disuntik PELAYAN.
 */
import { TrustedActor } from "../staging/stagingAudit";
import { PlaceCacheInvalidationEvent } from "./cacheInvalidation";
import { PlaceStatusAuditEntry } from "./publicationAudit";
import {
  PlacePublicationHead,
  PlacePublicationVersion,
} from "./publicationVersion";
import {
  PlacePublicationRollback,
  RollbackReasonCode,
} from "./publicationRollback";

/** Had halaman untuk semua senarai (elak imbasan tidak terbatas). */
export const MAX_PUBLICATION_PAGE_LIMIT = 100;

export interface PublicationPagination {
  limit: number;
  cursor?: string;
}
export interface PublicationPage<T> {
  items: T[];
  nextCursor?: string;
}

export interface PlacePublicationRepository {
  /**
   * Cipta versi penerbitan IMMUTABLE.
   * IDEMPOTEN: kandungan yang sama (contentHash sama) mengembalikan versi
   * sedia ada tanpa mencipta pendua atau menaikkan versionNumber.
   */
  createPublicationVersion(
    version: PlacePublicationVersion,
    actor: TrustedActor,
  ): Promise<PlacePublicationVersion>;

  getPublicationVersion(publicationId: string): Promise<PlacePublicationVersion | null>;

  /** Senarai TERBATAS versi bagi satu kedai (terbaharu dahulu). */
  listVersionsByPlace(
    placeId: string,
    page: PublicationPagination,
  ): Promise<PublicationPage<PlacePublicationVersion>>;

  /** Nombor versi seterusnya bagi kedai (1 bila belum ada). */
  nextVersionNumber(placeId: string): Promise<number>;

  /** Penunjuk aktif EMULATOR — bukan penunjuk produksi. */
  getActiveHead(placeId: string): Promise<PlacePublicationHead | null>;
  setEmulatorActivePublication(
    placeId: string,
    publicationId: string,
    actor: TrustedActor,
    reasonCode: string,
  ): Promise<PlacePublicationHead>;
}

export interface PlaceRollbackRepository {
  requestRollback(params: {
    placeId: string;
    fromPublicationId: string;
    targetPublicationId: string;
    reasonCode: RollbackReasonCode;
    notes?: string;
    actor: TrustedActor;
  }): Promise<PlacePublicationRollback>;

  getRollback(rollbackId: string): Promise<PlacePublicationRollback | null>;

  approveRollback(
    rollbackId: string,
    actor: TrustedActor,
  ): Promise<PlacePublicationRollback>;

  /**
   * Laksanakan rollback DALAM EMULATOR sahaja.
   * IDEMPOTEN: pelaksanaan kedua mengembalikan keputusan yang sama tanpa
   * mencipta versi tambahan. TIDAK PERNAH memadam versi yang lebih baharu.
   */
  executeRollbackInEmulator(
    rollbackId: string,
    actor: TrustedActor,
  ): Promise<PlacePublicationRollback>;

  listRollbacksByPlace(
    placeId: string,
    page: PublicationPagination,
  ): Promise<PublicationPage<PlacePublicationRollback>>;
}

export interface PlaceStatusAuditRepository {
  /** Append-only — tiada update/delete didedahkan. */
  appendStatusAudit(entry: PlaceStatusAuditEntry): Promise<PlaceStatusAuditEntry>;
  listStatusAudit(
    placeId: string,
    page: PublicationPagination,
  ): Promise<PublicationPage<PlaceStatusAuditEntry>>;
}

export interface PlaceCacheInvalidationRepository {
  /** Append-only; idempoten pada eventId yang sama. */
  appendInvalidationEvent(
    event: PlaceCacheInvalidationEvent,
  ): Promise<PlaceCacheInvalidationEvent>;
  listInvalidationEvents(
    placeId: string,
    page: PublicationPagination,
  ): Promise<PublicationPage<PlaceCacheInvalidationEvent>>;
}
