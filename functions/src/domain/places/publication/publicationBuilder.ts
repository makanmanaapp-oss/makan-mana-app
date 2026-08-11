/**
 * Phase 1.6 — pembina versi penerbitan (tulen).
 *
 * Menyatukan Part G (kelayakan) + Part H (versi) + Part J (paparan jujur).
 * TIADA penerbitan boleh memintas pengesahan: `buildPublicationVersion`
 * MELEMPAR bila rekod tidak layak. Ini menguatkuasakan peraturan tidak boleh
 * dirunding #10 ("no publication may bypass validation").
 */
import { EpochMillis } from "../common";
import { CanonicalPlace } from "../canonicalPlace";
import { TrustedActor } from "../staging/stagingAudit";
import {
  deriveBusinessDisplayState,
  deriveHoursDisplayState,
  derivePriceDisplayState,
  deriveRatingDisplayState,
  deriveSafetyWarningState,
  HonestDisplayState,
} from "./displayState";
import {
  EligibilityContext,
  evaluatePublicationEligibility,
  PublicationEligibilityResult,
} from "./eligibilityEngine";
import { DEFAULT_ELIGIBILITY_CONFIG } from "./eligibilityConfig";
import {
  computePublicationContentHash,
  diffPublicationSnapshots,
  PlacePublicationSnapshot,
  PlacePublicationVersion,
  publicationIdFromContent,
  toEligibilitySnapshot,
} from "./publicationVersion";

/** Terbitkan keadaan paparan jujur daripada kedai + keputusan freshness. */
export function deriveHonestDisplayState(
  place: CanonicalPlace,
  eligibility: PublicationEligibilityResult,
  now: EpochMillis,
): HonestDisplayState {
  const f = eligibility.freshnessResult.fieldResults;
  return {
    hours: deriveHoursDisplayState(place.hours, place.status, f.openingHours),
    price: derivePriceDisplayState(place.commercial, f.price),
    rating: deriveRatingDisplayState(place.quality, f.rating),
    business: deriveBusinessDisplayState(place.status, f.businessStatus),
    safety: deriveSafetyWarningState(
      place.safetyEvidence,
      f.halalEvidence,
      f.allergenEvidence,
      f.dietaryEvidence,
    ),
    derivedAt: now,
  };
}

export class PublicationNotEligibleError extends Error {
  constructor(public readonly result: PublicationEligibilityResult) {
    super(`publication blocked: ${result.blockingReasons.join(",")}`);
    this.name = "PublicationNotEligibleError";
  }
}

export interface BuildPublicationParams {
  place: CanonicalPlace;
  actor: TrustedActor;
  now: EpochMillis;
  versionNumber: number;
  sourceCanonicalVersion: string;
  eligibilityContext?: Omit<EligibilityContext, "now">;
  previousSnapshot?: PlacePublicationSnapshot;
  supersedesPublicationId?: string;
}

export interface BuildPublicationResult {
  version: PlacePublicationVersion;
  eligibility: PublicationEligibilityResult;
}

/**
 * Bina versi penerbitan IMMUTABLE daripada kedai canonical.
 * MELEMPAR `PublicationNotEligibleError` bila tidak layak — tiada laluan
 * memintas pengesahan, completeness atau semakan konflik.
 */
export function buildPublicationVersion(
  params: BuildPublicationParams,
): BuildPublicationResult {
  const { place, actor, now, versionNumber, sourceCanonicalVersion } = params;
  const config = params.eligibilityContext?.config ?? DEFAULT_ELIGIBILITY_CONFIG;

  const eligibility = evaluatePublicationEligibility(place, {
    ...(params.eligibilityContext ?? {}),
    now,
  });
  if (!eligibility.eligible) throw new PublicationNotEligibleError(eligibility);

  const snapshot: PlacePublicationSnapshot = {
    place: JSON.parse(JSON.stringify(place)) as CanonicalPlace,
    displayState: deriveHonestDisplayState(place, eligibility, now),
  };

  const contentInput = {
    placeId: place.placeId,
    snapshot,
    sourceCanonicalVersion,
    algorithmVersion: config.algorithmVersion,
    configVersion: config.configVersion,
  };

  const version: PlacePublicationVersion = {
    publicationId: publicationIdFromContent(contentInput),
    placeId: place.placeId,
    versionNumber,
    sourceCanonicalVersion,
    snapshot,
    publicationStatus: "published",
    publishedBy: actor.actorUid,
    publishedAt: now,
    effectiveFrom: now,
    supersedesPublicationId: params.supersedesPublicationId,
    eligibilitySnapshot: toEligibilitySnapshot(eligibility, now),
    warnings: [...eligibility.warnings],
    changeSummary: diffPublicationSnapshots(params.previousSnapshot, snapshot),
    contentHash: computePublicationContentHash(contentInput),
    algorithmVersion: config.algorithmVersion,
    configVersion: config.configVersion,
    createdAt: now,
  };

  return { version, eligibility };
}
