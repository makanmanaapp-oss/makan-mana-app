"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicationNotEligibleError = void 0;
exports.deriveHonestDisplayState = deriveHonestDisplayState;
exports.buildPublicationVersion = buildPublicationVersion;
const displayState_1 = require("./displayState");
const eligibilityEngine_1 = require("./eligibilityEngine");
const eligibilityConfig_1 = require("./eligibilityConfig");
const publicationVersion_1 = require("./publicationVersion");
/** Terbitkan keadaan paparan jujur daripada kedai + keputusan freshness. */
function deriveHonestDisplayState(place, eligibility, now) {
    const f = eligibility.freshnessResult.fieldResults;
    return {
        hours: (0, displayState_1.deriveHoursDisplayState)(place.hours, place.status, f.openingHours),
        price: (0, displayState_1.derivePriceDisplayState)(place.commercial, f.price),
        rating: (0, displayState_1.deriveRatingDisplayState)(place.quality, f.rating),
        business: (0, displayState_1.deriveBusinessDisplayState)(place.status, f.businessStatus),
        safety: (0, displayState_1.deriveSafetyWarningState)(place.safetyEvidence, f.halalEvidence, f.allergenEvidence, f.dietaryEvidence),
        derivedAt: now,
    };
}
class PublicationNotEligibleError extends Error {
    result;
    constructor(result) {
        super(`publication blocked: ${result.blockingReasons.join(",")}`);
        this.result = result;
        this.name = "PublicationNotEligibleError";
    }
}
exports.PublicationNotEligibleError = PublicationNotEligibleError;
/**
 * Bina versi penerbitan IMMUTABLE daripada kedai canonical.
 * MELEMPAR `PublicationNotEligibleError` bila tidak layak — tiada laluan
 * memintas pengesahan, completeness atau semakan konflik.
 */
function buildPublicationVersion(params) {
    const { place, actor, now, versionNumber, sourceCanonicalVersion } = params;
    const config = params.eligibilityContext?.config ?? eligibilityConfig_1.DEFAULT_ELIGIBILITY_CONFIG;
    const eligibility = (0, eligibilityEngine_1.evaluatePublicationEligibility)(place, {
        ...(params.eligibilityContext ?? {}),
        now,
    });
    if (!eligibility.eligible)
        throw new PublicationNotEligibleError(eligibility);
    const snapshot = {
        place: JSON.parse(JSON.stringify(place)),
        displayState: deriveHonestDisplayState(place, eligibility, now),
    };
    const contentInput = {
        placeId: place.placeId,
        snapshot,
        sourceCanonicalVersion,
        algorithmVersion: config.algorithmVersion,
        configVersion: config.configVersion,
    };
    const version = {
        publicationId: (0, publicationVersion_1.publicationIdFromContent)(contentInput),
        placeId: place.placeId,
        versionNumber,
        sourceCanonicalVersion,
        snapshot,
        publicationStatus: "published",
        publishedBy: actor.actorUid,
        publishedAt: now,
        effectiveFrom: now,
        supersedesPublicationId: params.supersedesPublicationId,
        eligibilitySnapshot: (0, publicationVersion_1.toEligibilitySnapshot)(eligibility, now),
        warnings: [...eligibility.warnings],
        changeSummary: (0, publicationVersion_1.diffPublicationSnapshots)(params.previousSnapshot, snapshot),
        contentHash: (0, publicationVersion_1.computePublicationContentHash)(contentInput),
        algorithmVersion: config.algorithmVersion,
        configVersion: config.configVersion,
        createdAt: now,
    };
    return { version, eligibility };
}
