/**
 * Phase 1.11 Part H — DEDUPLIKASI & HAD KADAR (deterministik).
 *
 * Semua had adalah pemalar BERNAMA — tiada nombor ajaib tersembunyi.
 */
import { EpochMillis } from "../common";
import { hashCanonical } from "../staging/hashing";
import {
  CorrectableField,
  OPEN_SUBMISSION_STATUSES,
  PlaceCorrectionProposal,
  PlaceCorrectionSubmission,
  ReportCategory,
  SubmissionStatus,
  CORRECTION_SCHEMA_VERSION,
} from "./correctionTypes";

export interface CorrectionLimits {
  maxOpenReportsPerUser: number;
  maxReportsPerPlacePerDay: number;
  maxEvidenceItems: number;
  maxDescriptionLength: number;
  /** Draf lebih lama daripada ini boleh dibersihkan (ms). */
  maxDraftAgeMs: number;
  /** Tempoh menyejuk antara penghantaran berturut-turut (saat). */
  cooldownSeconds: number;
  /** Panjang minimum penerangan supaya laporan bermakna. */
  minDescriptionLength: number;
}

export const DEFAULT_CORRECTION_LIMITS: CorrectionLimits = {
  maxOpenReportsPerUser: 10,
  maxReportsPerPlacePerDay: 5,
  maxEvidenceItems: 8,
  maxDescriptionLength: 1000,
  maxDraftAgeMs: 30 * 24 * 60 * 60 * 1000,
  cooldownSeconds: 60,
  minDescriptionLength: 10,
};

export function withCorrectionLimits(overrides: Partial<CorrectionLimits>): CorrectionLimits {
  return { ...DEFAULT_CORRECTION_LIMITS, ...overrides };
}

/**
 * Hash kanonikal bagi nilai yang dicadangkan. Susunan kunci tidak penting;
 * senarai diisih supaya cadangan yang sama secara semantik menghasilkan hash
 * yang sama.
 */
export function proposalHash(proposal: PlaceCorrectionProposal): string {
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(proposal).sort()) {
    const value = (proposal as Record<string, unknown>)[key];
    if (value === undefined) continue;
    normalized[key] = Array.isArray(value) ? [...(value as unknown[])].map(String).sort() : value;
  }
  return hashCanonical(normalized);
}

/**
 * Kunci identiti dedup: kedai + kategori + medan terjejas + pelapor +
 * hash cadangan + versi skema. Sengaja TIDAK mengandungi masa.
 */
export function dedupKeyFor(input: {
  placeId: string;
  category: ReportCategory;
  affectedFields: readonly CorrectableField[];
  submittedBy: string;
  proposal: PlaceCorrectionProposal;
  schemaVersion?: string;
}): string {
  return hashCanonical({
    placeId: input.placeId,
    category: input.category,
    affectedFields: [...input.affectedFields].sort(),
    submittedBy: input.submittedBy,
    proposal: proposalHash(input.proposal),
    schemaVersion: input.schemaVersion ?? CORRECTION_SCHEMA_VERSION,
  }).slice(0, 32);
}

export function isOpenStatus(status: SubmissionStatus): boolean {
  return OPEN_SUBMISSION_STATUSES.includes(status);
}

export interface DedupMatch {
  /** Penghantaran terbuka sedia ada dengan identiti yang sama. */
  existing?: PlaceCorrectionSubmission;
  isDuplicate: boolean;
}

/**
 * Cari penghantaran TERBUKA sedia ada dengan identiti dedup yang sama.
 * Penghantaran yang ditarik balik / ditolak / diselesaikan TIDAK menyekat
 * laporan sah pada masa hadapan.
 */
export function findOpenDuplicate(
  existing: readonly PlaceCorrectionSubmission[],
  dedupKey: string,
): DedupMatch {
  const match = existing.find((s) => s.dedupKey === dedupKey && isOpenStatus(s.status));
  return { existing: match, isDuplicate: match !== undefined };
}

export const RATE_LIMIT_REASONS = [
  "max_open_reports_per_user_exceeded",
  "max_reports_per_place_per_day_exceeded",
  "cooldown_active",
] as const;
export type RateLimitReason = (typeof RATE_LIMIT_REASONS)[number];

export interface RateLimitDecision {
  allowed: boolean;
  reasons: readonly RateLimitReason[];
  /** Bila percubaan seterusnya dibenarkan (epoch ms). */
  retryAfter?: EpochMillis;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Nilai had kadar. TULEN — `now` disuntik dan sejarah dibekalkan pemanggil.
 */
export function evaluateRateLimit(
  input: {
    submittedBy: string;
    placeId: string;
    now: EpochMillis;
    userSubmissions: readonly PlaceCorrectionSubmission[];
  },
  limits: CorrectionLimits = DEFAULT_CORRECTION_LIMITS,
): RateLimitDecision {
  const reasons: RateLimitReason[] = [];
  let retryAfter: EpochMillis | undefined;

  const mine = input.userSubmissions.filter((s) => s.submittedBy === input.submittedBy);

  const open = mine.filter((s) => isOpenStatus(s.status));
  if (open.length >= limits.maxOpenReportsPerUser) {
    reasons.push("max_open_reports_per_user_exceeded");
  }

  const sameePlaceToday = mine.filter(
    (s) => s.placeId === input.placeId && input.now - s.submittedAt < DAY_MS,
  );
  if (sameePlaceToday.length >= limits.maxReportsPerPlacePerDay) {
    reasons.push("max_reports_per_place_per_day_exceeded");
    const oldest = Math.min(...sameePlaceToday.map((s) => s.submittedAt));
    retryAfter = oldest + DAY_MS;
  }

  const lastSubmittedAt = mine.reduce<EpochMillis>((max, s) => Math.max(max, s.submittedAt), 0);
  if (lastSubmittedAt > 0) {
    const nextAllowed = lastSubmittedAt + limits.cooldownSeconds * 1000;
    if (input.now < nextAllowed) {
      reasons.push("cooldown_active");
      retryAfter = retryAfter === undefined ? nextAllowed : Math.min(retryAfter, nextAllowed);
    }
  }

  return { allowed: reasons.length === 0, reasons, retryAfter };
}

/** Kunci baris had kadar (untuk storan emulator). */
export function rateLimitKey(submittedBy: string, placeId: string): string {
  return `rl_${hashCanonical({ submittedBy, placeId }).slice(0, 32)}`;
}
