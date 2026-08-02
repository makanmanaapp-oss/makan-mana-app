"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computePublicationContentHash = computePublicationContentHash;
exports.publicationIdFromContent = publicationIdFromContent;
exports.rollbackId = rollbackId;
exports.toEligibilitySnapshot = toEligibilitySnapshot;
exports.diffPublicationSnapshots = diffPublicationSnapshots;
exports.validatePublicationVersion = validatePublicationVersion;
const hashing_1 = require("../staging/hashing");
/**
 * Buang metadata terbitan yang TIDAK MEWAKILI kandungan sebelum hashing.
 * `displayState.derivedAt` ialah cap masa pengiraan, bukan fakta yang
 * diterbitkan — memasukkannya akan memecahkan idempotency (Part M) kerana
 * menerbitkan kandungan yang sama pada saat berbeza menghasilkan hash berbeza.
 */
function hashableSnapshot(snapshot) {
    if (!snapshot.displayState)
        return snapshot;
    const { derivedAt: _ignored, ...displayWithoutTimestamp } = snapshot.displayState;
    return { ...snapshot, displayState: displayWithoutTimestamp };
}
/** Hash kandungan deterministik (kunci diisih rekursif oleh hashCanonical). */
function computePublicationContentHash(input) {
    return (0, hashing_1.hashCanonical)({
        placeId: input.placeId,
        snapshot: hashableSnapshot(input.snapshot),
        sourceCanonicalVersion: input.sourceCanonicalVersion,
        algorithmVersion: input.algorithmVersion,
        configVersion: input.configVersion,
    });
}
/**
 * ID penerbitan deterministik daripada hash kandungan. Percubaan menerbitkan
 * kandungan sama menghasilkan ID sama → repository mengembalikan versi
 * sedia ada dan bukan mencipta pendua.
 */
function publicationIdFromContent(input) {
    return `pub_${computePublicationContentHash(input).slice(0, 32)}`;
}
function rollbackId(placeId, fromPublicationId, targetPublicationId) {
    const digest = (0, hashing_1.hashCanonical)({ placeId, fromPublicationId, targetPublicationId });
    return `rbk_${digest.slice(0, 32)}`;
}
/** Bina ringkasan kelayakan yang boleh dibekukan ke dalam versi. */
function toEligibilitySnapshot(r, evaluatedAt) {
    return {
        eligible: r.eligible,
        blockingReasons: [...r.blockingReasons],
        warnings: [...r.warnings],
        overallFreshnessState: r.freshnessResult.overallFreshnessState,
        criticalExpiredFieldIds: [...r.freshnessResult.criticalExpiredFieldIds],
        completenessScore: r.completenessResult.overallScore,
        engineVersion: r.version,
        evaluatedAt,
    };
}
/**
 * Bandingkan dua snapshot dan hasilkan ringkasan perubahan peringkat atas.
 * Deterministik (kunci diisih) — digunakan untuk `changeSummary`.
 */
function diffPublicationSnapshots(previous, next) {
    if (!previous)
        return ["initial_publication"];
    const changed = [];
    const a = previous.place;
    const b = next.place;
    const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
    for (const k of keys) {
        if ((0, hashing_1.hashCanonical)(a[k]) !== (0, hashing_1.hashCanonical)(b[k]))
            changed.push(k);
    }
    return changed.length > 0 ? changed : ["no_content_change"];
}
/** Pengesahan bentuk versi (dipanggil repository sebelum menulis). */
function validatePublicationVersion(v) {
    const issues = [];
    if (!v.publicationId)
        issues.push("publicationId_missing");
    if (!v.placeId)
        issues.push("placeId_missing");
    if (!Number.isInteger(v.versionNumber) || v.versionNumber < 1) {
        issues.push("versionNumber_invalid");
    }
    if (!v.contentHash)
        issues.push("contentHash_missing");
    if (!v.publishedBy)
        issues.push("publishedBy_missing");
    if (v.effectiveUntil !== undefined && v.effectiveUntil < v.effectiveFrom) {
        issues.push("effectiveUntil_before_effectiveFrom");
    }
    const expected = computePublicationContentHash({
        placeId: v.placeId,
        snapshot: v.snapshot,
        sourceCanonicalVersion: v.sourceCanonicalVersion,
        algorithmVersion: v.algorithmVersion,
        configVersion: v.configVersion,
    });
    if (expected !== v.contentHash)
        issues.push("contentHash_mismatch");
    return issues;
}
