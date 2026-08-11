/**
 * Phase 1.3 — hashing deterministik & idempotency (Node crypto, tiada dep baharu).
 * Serialisasi kanonikal (kunci diisih rekursif) supaya perbezaan susunan kunci
 * TIDAK menghasilkan hash berbeza. Tiada data mentah sensitif dilog.
 */
import { createHash } from "node:crypto";

function sortValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const val = (v as Record<string, unknown>)[k];
      if (val !== undefined) out[k] = sortValue(val);
    }
    return out;
  }
  return v;
}

/** Serialisasi kanonikal deterministik (kunci diisih, undefined dibuang). */
export function canonicalSerialize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hashCanonical(value: unknown): string {
  return sha256Hex(canonicalSerialize(value));
}

export function hashRawPayload(payload: unknown): string {
  return hashCanonical(payload);
}

export function hashNormalizedCandidate(candidate: unknown): string {
  return hashCanonical(candidate);
}

export function hashImportRecordIdentity(id: {
  sourceType: string;
  sourceRecordId: string;
}): string {
  return hashCanonical({
    sourceType: id.sourceType,
    sourceRecordId: id.sourceRecordId,
  });
}
