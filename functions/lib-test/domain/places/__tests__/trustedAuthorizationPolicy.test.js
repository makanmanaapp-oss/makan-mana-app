"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.14B — ujian dasar kebenaran DIPERCAYAI.
 * Membuktikan medan boleh-tulis-klien (isAdmin doc) TIDAK PERNAH dipercayai.
 */
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const trustedAuthorizationPolicy_1 = require("../trustedAuthorizationPolicy");
const NO_ALLOWLIST = { ownerAllowlist: [] };
const WITH_ALLOWLIST = { ownerAllowlist: ["owner-uid"] };
// Test 24: isAdmin boleh-tulis-klien DIABAIKAN (bukan input kepada dasar).
(0, node_test_1.test)("client-writable isAdmin is ignored (not part of the policy input)", () => {
    // Konteks hanya menerima claims + allowlist — TIADA cara memasukkan doc isAdmin.
    const ctx = { uid: "evil", claims: { isAdmin: true } };
    strict_1.default.equal((0, trustedAuthorizationPolicy_1.isTrustedOwner)(ctx, NO_ALLOWLIST), false);
    strict_1.default.equal((0, trustedAuthorizationPolicy_1.hasTrustedPermission)("places.migration.execute", ctx, NO_ALLOWLIST), false);
});
// Test 25: custom claim yang betul memberi kuasa.
(0, node_test_1.test)("correct custom claim authorizes", () => {
    strict_1.default.equal((0, trustedAuthorizationPolicy_1.isTrustedOwner)({ uid: "a", claims: { admin: true } }, NO_ALLOWLIST), true);
    strict_1.default.equal((0, trustedAuthorizationPolicy_1.isTrustedOwner)({ uid: "a", claims: { role: "owner" } }, NO_ALLOWLIST), true);
    strict_1.default.equal((0, trustedAuthorizationPolicy_1.hasTrustedPermission)("places.publish", { uid: "a", claims: { admin: true } }, NO_ALLOWLIST), true);
});
// Test 26: kebenaran tiada → tolak.
(0, node_test_1.test)("missing permission rejects", () => {
    strict_1.default.throws(() => (0, trustedAuthorizationPolicy_1.assertTrustedPermission)("places.rollback", { uid: "u", claims: {} }, NO_ALLOWLIST), (e) => e instanceof trustedAuthorizationPolicy_1.TrustedAuthorizationError && e.code === "permission_denied");
    strict_1.default.throws(() => (0, trustedAuthorizationPolicy_1.assertTrustedPermission)("places.rollback", { uid: "", claims: {} }, NO_ALLOWLIST), (e) => e instanceof trustedAuthorizationPolicy_1.TrustedAuthorizationError && e.code === "unauthenticated");
});
// Test 27: owner allowlist hanya berkuat kuasa bila dikonfigur secara eksplisit.
(0, node_test_1.test)("owner allowlist works only when explicitly configured", () => {
    strict_1.default.equal((0, trustedAuthorizationPolicy_1.isTrustedOwner)({ uid: "owner-uid", claims: {} }, NO_ALLOWLIST), false);
    strict_1.default.equal((0, trustedAuthorizationPolicy_1.isTrustedOwner)({ uid: "owner-uid", claims: {} }, WITH_ALLOWLIST), true);
    strict_1.default.equal((0, trustedAuthorizationPolicy_1.isTrustedOwner)({ uid: "other", claims: {} }, WITH_ALLOWLIST), false);
});
(0, node_test_1.test)("correction submission needs only authentication (no special permission)", () => {
    strict_1.default.equal((0, trustedAuthorizationPolicy_1.canSubmitCorrection)({ uid: "any-authed-user" }), true);
    strict_1.default.equal((0, trustedAuthorizationPolicy_1.canSubmitCorrection)({ uid: undefined }), false);
});
