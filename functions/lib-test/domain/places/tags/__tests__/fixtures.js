"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REG = exports.T = void 0;
exports.ev = ev;
/** Phase 1.5 — fixtures tag (data rekaan, deterministik). */
const index_1 = require("../index");
exports.T = 1_700_000_000_000;
exports.REG = index_1.CANONICAL_TAG_REGISTRY;
function ev(familyId, tagId, o = {}) {
    return {
        tagId,
        familyId,
        evidenceLevel: "reported",
        confidence: 0.7,
        sourceType: "provider",
        validatorVersion: "tag_validator_v1",
        status: "proposed",
        ...o,
    };
}
