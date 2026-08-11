/**
 * Phase 1.4 — ID pasangan duplikat deterministik (idempotency).
 * Susunan rekod terbalik menghasilkan identiti pasangan SAMA; versi config
 * berbeza menghasilkan ID berbeza.
 */
import { hashCanonical } from "../staging/hashing";

/** Kunci pasangan tak-berarah (diisih supaya (A,B) === (B,A)). */
export function pairKey(idA: string, idB: string): string {
  return [idA, idB].sort().join("::");
}

export function duplicateCandidateId(
  idA: string,
  idB: string,
  algorithmVersion: string,
  configVersion: string,
): string {
  const digest = hashCanonical({
    pair: pairKey(idA, idB),
    algo: algorithmVersion,
    config: configVersion,
  });
  return `dup_${digest.slice(0, 32)}`;
}
