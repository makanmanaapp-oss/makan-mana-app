"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CENTER = exports.ADMIN = exports.freshInputsAt = exports.SOURCE_VERSION = exports.DAY = exports.T = void 0;
exports.offsetMeters = offsetMeters;
exports.makePlace = makePlace;
exports.makePublication = makePublication;
exports.makeRawPublication = makeRawPublication;
exports.head = head;
const publicationBuilder_1 = require("../../publication/publicationBuilder");
const fixtures_1 = require("../../publication/__tests__/fixtures");
Object.defineProperty(exports, "freshInputsAt", { enumerable: true, get: function () { return fixtures_1.freshInputsAt; } });
Object.defineProperty(exports, "SOURCE_VERSION", { enumerable: true, get: function () { return fixtures_1.SOURCE_VERSION; } });
Object.defineProperty(exports, "T", { enumerable: true, get: function () { return fixtures_1.T; } });
Object.defineProperty(exports, "DAY", { enumerable: true, get: function () { return fixtures_1.DAY; } });
exports.ADMIN = { actorUid: "server_admin", actorRole: "admin" };
/** Pusat rujukan: Petaling Jaya (SS2). */
exports.CENTER = { lat: 3.1189, lng: 101.6252 };
/**
 * Alihkan koordinat sejauh (utara, timur) meter. Deterministik.
 * 1 darjah lat ≈ 111_320 m; longitud diskalakan dengan cos(lat).
 */
function offsetMeters(base, northM, eastM) {
    const dLat = northM / 111_320;
    const dLng = eastM / (111_320 * Math.cos((base.lat * Math.PI) / 180));
    return { lat: base.lat + dLat, lng: base.lng + dLng };
}
/** Bina kedai canonical yang LAYAK dengan pelarasan mengikut spec. */
function makePlace(spec) {
    const p = (0, fixtures_1.eligiblePlace)();
    p.placeId = spec.placeId;
    p.location = { ...p.location, lat: spec.location.lat, lng: spec.location.lng };
    if (spec.status)
        p.status = spec.status;
    if (spec.publicationStatus)
        p.publicationStatus = spec.publicationStatus;
    p.tagSet = {
        tags: [
            ...(spec.placeTypes ?? ["restaurant"]).map((tagId) => ({
                tagId,
                family: "place_type",
                evidenceLevel: "verified",
                confidence: 0.95,
                sourceType: "makanmana",
            })),
            ...(spec.cuisines ?? []).map((tagId) => ({
                tagId,
                family: "cuisine",
                evidenceLevel: "verified",
                confidence: 0.9,
                sourceType: "makanmana",
            })),
        ],
    };
    p.quality = {
        rating: spec.rating ?? 4.4,
        reviewCount: spec.reviewCount ?? 250,
        ratingSource: "provider",
    };
    if (spec.ratingConfidence !== undefined) {
        p.provenance = {
            ...p.provenance,
            rating: {
                value: p.quality.rating,
                sourceType: "provider",
                evidenceLevel: "reported",
                confidence: spec.ratingConfidence,
                fetchedAt: fixtures_1.T,
            },
        };
    }
    if (spec.completeness !== undefined) {
        p.completeness = { ...p.completeness, overallScore: spec.completeness };
    }
    if (spec.priceUnknown)
        p.commercial = { priceState: "unknown" };
    if (spec.hoursUnknown)
        p.hours = { hoursState: "unknown" };
    if (spec.merged) {
        p.mergeState = {
            mergeStatus: "merged",
            duplicateOf: "mm_canonical_target",
            preservedSourceRefs: [],
        };
    }
    if (spec.noImage)
        p.media = { items: [] };
    return p;
}
/**
 * Bina versi penerbitan bagi kedai. Kedai yang TIDAK layak (mis. tutup kekal)
 * tidak boleh melalui `buildPublicationVersion`, jadi kami bina versi secara
 * langsung untuk ujian pengecualian.
 */
function makePublication(place, versionNumber = 1, now = fixtures_1.T) {
    return (0, publicationBuilder_1.buildPublicationVersion)({
        place,
        actor: exports.ADMIN,
        now,
        versionNumber,
        sourceCanonicalVersion: fixtures_1.SOURCE_VERSION,
        eligibilityContext: { freshnessInputs: (0, fixtures_1.freshInputsAt)(fixtures_1.T) },
    }).version;
}
/**
 * Versi penerbitan MENTAH untuk ujian pengecualian — memintas pengesahan
 * kelayakan supaya kami boleh membuktikan bahawa lapisan LIPUTAN menolaknya.
 */
function makeRawPublication(place, overrides = {}) {
    const base = makePublication(makePlace({ placeId: place.placeId, location: { lat: place.location.lat, lng: place.location.lng } }));
    return {
        ...base,
        placeId: place.placeId,
        snapshot: { ...base.snapshot, place },
        ...overrides,
    };
}
function head(placeId, activePublicationId) {
    return { placeId, activePublicationId };
}
