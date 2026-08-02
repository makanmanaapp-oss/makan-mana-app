"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalSerialize = canonicalSerialize;
exports.sha256Hex = sha256Hex;
exports.hashCanonical = hashCanonical;
exports.hashRawPayload = hashRawPayload;
exports.hashNormalizedCandidate = hashNormalizedCandidate;
exports.hashImportRecordIdentity = hashImportRecordIdentity;
/**
 * Phase 1.3 — hashing deterministik & idempotency (Node crypto, tiada dep baharu).
 * Serialisasi kanonikal (kunci diisih rekursif) supaya perbezaan susunan kunci
 * TIDAK menghasilkan hash berbeza. Tiada data mentah sensitif dilog.
 */
const node_crypto_1 = require("node:crypto");
function sortValue(v) {
    if (Array.isArray(v))
        return v.map(sortValue);
    if (v && typeof v === "object") {
        const out = {};
        for (const k of Object.keys(v).sort()) {
            const val = v[k];
            if (val !== undefined)
                out[k] = sortValue(val);
        }
        return out;
    }
    return v;
}
/** Serialisasi kanonikal deterministik (kunci diisih, undefined dibuang). */
function canonicalSerialize(value) {
    return JSON.stringify(sortValue(value));
}
function sha256Hex(input) {
    return (0, node_crypto_1.createHash)("sha256").update(input, "utf8").digest("hex");
}
function hashCanonical(value) {
    return sha256Hex(canonicalSerialize(value));
}
function hashRawPayload(payload) {
    return hashCanonical(payload);
}
function hashNormalizedCandidate(candidate) {
    return hashCanonical(candidate);
}
function hashImportRecordIdentity(id) {
    return hashCanonical({
        sourceType: id.sourceType,
        sourceRecordId: id.sourceRecordId,
    });
}
