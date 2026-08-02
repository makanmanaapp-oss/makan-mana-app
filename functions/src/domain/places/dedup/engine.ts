/** Phase 1.4 — enjin dedup peringkat tinggi (normalize→signals→decision→calon). */
import { EpochMillis } from "../common";
import { DedupConfig, DEFAULT_DEDUP_CONFIG } from "./config";
import { NormalizedIdentity } from "./identityNormalizer";
import { computeSignals } from "./duplicateSignals";
import { evaluateDuplicateDecision } from "./duplicateDecision";
import { duplicateCandidateId } from "./dedupIds";
import { PlaceDuplicateCandidate, initialReviewStatus } from "./duplicateCandidate";

export interface BuildDuplicateCandidateInput {
  stagingRecordId: string;
  comparedStagingRecordId?: string;
  comparedPlaceId?: string;
  a: NormalizedIdentity;
  b: NormalizedIdentity;
  now: EpochMillis;
  config?: DedupConfig;
}

/**
 * Bina calon duplikat deterministik & idempoten. ID pasangan tidak berarah,
 * jadi susunan rekod terbalik → ID sama.
 */
export function buildDuplicateCandidate(
  input: BuildDuplicateCandidateInput,
): PlaceDuplicateCandidate {
  const config = input.config ?? DEFAULT_DEDUP_CONFIG;
  const signals = computeSignals(input.a, input.b, config);
  const decision = evaluateDuplicateDecision(signals, config);
  const idB = input.comparedStagingRecordId ?? input.comparedPlaceId ?? "";
  const id = duplicateCandidateId(
    input.stagingRecordId,
    idB,
    config.algorithmVersion,
    config.configVersion,
  );
  return {
    duplicateCandidateId: id,
    stagingRecordId: input.stagingRecordId,
    comparedPlaceId: input.comparedPlaceId,
    comparedStagingRecordId: input.comparedStagingRecordId,
    signalSet: signals,
    duplicateScore: decision.score,
    decision: decision.decision,
    reviewStatus: initialReviewStatus(decision.decision),
    reasons: decision.reasons,
    warnings: decision.warnings,
    generatedAt: input.now,
    algorithmVersion: config.algorithmVersion,
    configVersion: config.configVersion,
  };
}
