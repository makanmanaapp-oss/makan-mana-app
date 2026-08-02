"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.proposedCanonicalPlaceId = proposedCanonicalPlaceId;
exports.stableIdentityKey = stableIdentityKey;
exports.buildMigrationCandidate = buildMigrationCandidate;
exports.candidateIsExecutable = candidateIsExecutable;
/**
 * Phase 1.12 Part C + G — calon migrasi dan sebab tahan.
 *
 * Calon dibina secara deterministik daripada inventori. Apa-apa yang samar
 * DITAHAN, bukan diteka. Padanan nama-sahaja adalah sebab tahan yang keras:
 * "Restoran Ali" di Shah Alam dan "Restoran Ali" di Bangi adalah dua kedai.
 */
const common_1 = require("../common");
const branchDetection_1 = require("../dedup/branchDetection");
const config_1 = require("../dedup/config");
const identityNormalizer_1 = require("../dedup/identityNormalizer");
const duplicateSignals_1 = require("../dedup/duplicateSignals");
const hashing_1 = require("../staging/hashing");
const migrationTypes_1 = require("./migrationTypes");
/** ID canonical yang dicadangkan — deterministik daripada identiti stabil. */
function proposedCanonicalPlaceId(stableKey) {
    return `PLC-${(0, hashing_1.hashCanonical)({ stableKey }).slice(0, 24)}`;
}
/**
 * Kunci identiti stabil. Keutamaan: ID pembekal > ID tempat legasi.
 * Nama TIDAK PERNAH menjadi sebahagian daripada kunci — itu akan menggabungkan
 * cawangan berbeza yang berkongsi jenama.
 */
function stableIdentityKey(records) {
    const provider = records
        .map((r) => r.providerPlaceId)
        .filter(common_1.isNonEmptyString)
        .sort()[0];
    if (provider)
        return `provider:${provider}`;
    const legacy = records
        .map((r) => r.legacyPlaceId)
        .filter(common_1.isNonEmptyString)
        .sort()[0];
    if (legacy)
        return `legacy:${legacy}`;
    return null;
}
function identityFrom(records) {
    const primary = records[0];
    return (0, identityNormalizer_1.buildIdentity)({
        displayName: primary.displayName,
        phones: records.map((r) => r.phone).filter(common_1.isNonEmptyString),
        website: records.map((r) => r.website).filter(common_1.isNonEmptyString)[0],
        address: records.map((r) => r.address).filter(common_1.isNonEmptyString)[0],
        lat: records.find((r) => r.lat !== undefined)?.lat,
        lng: records.find((r) => r.lng !== undefined)?.lng,
        providerPlaceId: records
            .map((r) => r.providerPlaceId)
            .filter(common_1.isNonEmptyString)[0],
    });
}
function completenessOf(identity, hasStableIdentity) {
    const hasLocation = identity.lat !== undefined &&
        identity.lng !== undefined &&
        (0, common_1.isValidLatLng)(identity.lat, identity.lng);
    const hasContact = identity.phoneDigits.length > 0 || identity.websiteDomain !== undefined;
    const score = (hasStableIdentity ? 0.5 : 0) + (hasLocation ? 0.3 : 0) + (hasContact ? 0.2 : 0);
    return { hasStableIdentity, hasLocation, hasContact, score };
}
function snapshotOf(identity, records) {
    return {
        canonicalName: identity.displayName,
        normalizedName: identity.normalizedName,
        address: records.map((r) => r.address).filter(common_1.isNonEmptyString)[0],
        lat: identity.lat,
        lng: identity.lng,
        phones: identity.phoneDigits,
        website: records.map((r) => r.website).filter(common_1.isNonEmptyString)[0],
        providerPlaceId: identity.providerPlaceId,
        // Keadaan jujur — kami TIDAK mereka rating/harga/waktu yang tiada.
        ratingKnown: records.some((r) => typeof r.rating === "number" && r.rating > 0),
        priceKnown: records.some((r) => (0, common_1.isNonEmptyString)(r.priceEstimate)),
        hoursKnown: records.some((r) => r.isOpen !== undefined),
    };
}
/**
 * Bina satu calon migrasi. Tulen dan deterministik: input yang sama
 * menghasilkan `contentHash` yang sama.
 */
function buildMigrationCandidate(input, now) {
    const config = input.config ?? config_1.DEFAULT_DEDUP_CONFIG;
    const records = [...input.records].sort((a, b) => a.legacyRecordId.localeCompare(b.legacyRecordId));
    const holdReasons = [];
    const conflicts = [];
    const warnings = [];
    const identity = identityFrom(records);
    const stableKey = stableIdentityKey(records);
    const canonicalPlaceId = stableKey
        ? proposedCanonicalPlaceId(stableKey)
        : proposedCanonicalPlaceId(`unstable:${records[0].legacyRecordId}`);
    // --- Identiti stabil -----------------------------------------------------
    if (!stableKey) {
        holdReasons.push("missing_stable_identity");
    }
    // Padanan nama-sahaja: nama wujud tetapi tiada ID pembekal DAN tiada lokasi.
    const hasProvider = (0, common_1.isNonEmptyString)(identity.providerPlaceId);
    const hasLocation = identity.lat !== undefined &&
        identity.lng !== undefined &&
        (0, common_1.isValidLatLng)(identity.lat, identity.lng);
    if (!hasProvider && !hasLocation) {
        holdReasons.push("name_only_match");
    }
    // --- Lokasi --------------------------------------------------------------
    const anyCoordinate = records.some((r) => r.lat !== undefined || r.lng !== undefined);
    if (!anyCoordinate) {
        holdReasons.push("missing_location");
    }
    else if (!hasLocation) {
        holdReasons.push("invalid_location");
    }
    // --- Bentuk legasi -------------------------------------------------------
    for (const record of records) {
        if (record.inventoryStatus === "blocked") {
            holdReasons.push("malformed_legacy_data");
        }
        if (record.warnings.includes("no_stable_identity_beyond_name")) {
            holdReasons.push("name_only_match");
        }
        if (record.source === "unknown") {
            holdReasons.push("source_provenance_missing");
        }
    }
    // --- Cawangan ------------------------------------------------------------
    let branchAssessment = null;
    let duplicateSignals = null;
    for (const sibling of input.siblingIdentities ?? []) {
        const assessment = (0, branchDetection_1.assessBranch)(identity, sibling, config);
        duplicateSignals = (0, duplicateSignals_1.computeSignals)(identity, sibling, config);
        if (assessment.isLikelySeparateBranch) {
            branchAssessment = assessment;
            holdReasons.push("branch_conflict");
            conflicts.push(`branch:${assessment.reasons.join(",")}`);
            break;
        }
        branchAssessment = assessment;
    }
    // --- Perlanggaran alias --------------------------------------------------
    if ((input.aliasCollisions?.length ?? 0) > 0) {
        holdReasons.push("alias_collision");
        conflicts.push(`alias_collision:${input.aliasCollisions.join(",")}`);
    }
    // --- Rujukan kritikal ----------------------------------------------------
    if (input.referenceImpact.warnings.includes("unknown_reference_path")) {
        holdReasons.push("unknown_reference_path");
        warnings.push("unknown_reference_path");
    }
    if (input.referenceImpact.criticalReferences > 0 &&
        input.referenceImpact.otherReferencePaths.length > 0) {
        // Rujukan kritikal + laluan tidak dikenali = kita tidak boleh menjamin
        // penulisan semula yang lengkap.
        holdReasons.push("critical_reference_unresolved");
    }
    // --- Pengesahan snapshot canonical ---------------------------------------
    const snapshot = snapshotOf(identity, records);
    const validationIssues = [];
    if (!(0, common_1.isNonEmptyString)(snapshot.canonicalName)) {
        validationIssues.push("canonical_name_empty");
    }
    if (!hasLocation) {
        validationIssues.push("location_required_for_canonical_place");
    }
    if (validationIssues.length > 0) {
        holdReasons.push("canonical_validation_failed");
    }
    // --- Keputusan -----------------------------------------------------------
    const uniqueHolds = [...new Set(holdReasons)].sort();
    let decision;
    if (input.existingCanonicalPlaceId) {
        decision = "already_mapped";
    }
    else if (uniqueHolds.includes("branch_conflict")) {
        decision = "branch_conflict";
    }
    else if (uniqueHolds.includes("missing_stable_identity") ||
        uniqueHolds.includes("name_only_match")) {
        decision = "insufficient_identity";
    }
    else if (uniqueHolds.includes("alias_collision")) {
        decision = "blocked";
    }
    else if (uniqueHolds.includes("ambiguous_duplicate")) {
        decision = "ambiguous";
    }
    else if (uniqueHolds.length > 0) {
        decision = "review_required";
    }
    else {
        decision = "ready";
    }
    const proposedAliases = {
        legacyDocumentIds: [
            ...new Set(records.map((r) => r.legacyDocumentPath)),
        ].sort(),
        googlePlaceIds: [...new Set(records.map((r) => r.legacyPlaceId))].sort(),
        internalPlaceIds: [...new Set(records.map((r) => r.legacyRecordId))].sort(),
        deepLinkPlaceIds: [...new Set(records.map((r) => r.legacyPlaceId))].sort(),
        providerPlaceIds: [
            ...new Set(records.map((r) => r.providerPlaceId).filter(common_1.isNonEmptyString)),
        ].sort(),
        merchantIds: [],
    };
    const candidateId = `MCD-${(0, hashing_1.hashCanonical)({
        canonicalPlaceId,
        legacyRecordIds: records.map((r) => r.legacyRecordId).sort(),
    }).slice(0, 24)}`;
    // Cincang kandungan MENGECUALIKAN cap masa supaya dry-run berulang stabil.
    const contentHash = (0, hashing_1.hashCanonical)({
        candidateId,
        canonicalPlaceId,
        legacyRecordHashes: records
            .map((r) => ({ id: r.legacyRecordId, hash: r.rawContentHash }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        snapshot,
        proposedAliases,
        decision,
        holdReasons: uniqueHolds,
        algorithmVersion: migrationTypes_1.MIGRATION_ALGORITHM_VERSION,
        configVersion: migrationTypes_1.MIGRATION_CONFIG_VERSION,
    });
    return {
        candidateId,
        legacyRecordIds: records.map((r) => r.legacyRecordId),
        legacyPlaceIds: [...new Set(records.map((r) => r.legacyPlaceId))].sort(),
        proposedCanonicalPlaceId: input.existingCanonicalPlaceId ?? canonicalPlaceId,
        sourceSnapshots: records.map((r) => r.legacyDocumentPath),
        normalizedIdentity: identity,
        duplicateSignals,
        branchAssessment,
        proposedAliases,
        proposedCanonicalSnapshot: snapshot,
        referenceImpact: input.referenceImpact,
        completeness: completenessOf(identity, stableKey !== null),
        validationResult: {
            ok: validationIssues.length === 0,
            issues: validationIssues,
        },
        conflicts: [...new Set(conflicts)].sort(),
        warnings: [...new Set(warnings)].sort(),
        migrationDecision: decision,
        holdReasons: uniqueHolds,
        contentHash,
        algorithmVersion: migrationTypes_1.MIGRATION_ALGORITHM_VERSION,
        configVersion: migrationTypes_1.MIGRATION_CONFIG_VERSION,
        createdAt: now,
        updatedAt: now,
    };
}
/** Calon boleh dilaksanakan HANYA bila sedia dan tiada sebab tahan. */
function candidateIsExecutable(candidate) {
    if (candidate.holdReasons.length > 0)
        return false;
    if (migrationTypes_1.NON_EXECUTABLE_DECISIONS.includes(candidate.migrationDecision))
        return false;
    return candidate.migrationDecision === "ready";
}
