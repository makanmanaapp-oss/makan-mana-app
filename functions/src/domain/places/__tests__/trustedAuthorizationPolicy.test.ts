/**
 * Phase 1.14B — ujian dasar kebenaran DIPERCAYAI.
 * Membuktikan medan boleh-tulis-klien (isAdmin doc) TIDAK PERNAH dipercayai.
 */
import assert from "node:assert/strict";
import {test} from "node:test";

import {
  TrustedAuthorizationError,
  assertTrustedPermission,
  canSubmitCorrection,
  hasTrustedPermission,
  isTrustedOwner,
} from "../trustedAuthorizationPolicy";

const NO_ALLOWLIST = {ownerAllowlist: []};
const WITH_ALLOWLIST = {ownerAllowlist: ["owner-uid"]};

// Test 24: isAdmin boleh-tulis-klien DIABAIKAN (bukan input kepada dasar).
test("client-writable isAdmin is ignored (not part of the policy input)", () => {
  // Konteks hanya menerima claims + allowlist — TIADA cara memasukkan doc isAdmin.
  const ctx = {uid: "evil", claims: {isAdmin: true} as Record<string, unknown>};
  assert.equal(isTrustedOwner(ctx, NO_ALLOWLIST), false);
  assert.equal(hasTrustedPermission("places.migration.execute", ctx, NO_ALLOWLIST), false);
});

// Test 25: custom claim yang betul memberi kuasa.
test("correct custom claim authorizes", () => {
  assert.equal(isTrustedOwner({uid: "a", claims: {admin: true}}, NO_ALLOWLIST), true);
  assert.equal(isTrustedOwner({uid: "a", claims: {role: "owner"}}, NO_ALLOWLIST), true);
  assert.equal(hasTrustedPermission("places.publish", {uid: "a", claims: {admin: true}}, NO_ALLOWLIST), true);
});

// Test 26: kebenaran tiada → tolak.
test("missing permission rejects", () => {
  assert.throws(
    () => assertTrustedPermission("places.rollback", {uid: "u", claims: {}}, NO_ALLOWLIST),
    (e: unknown) => e instanceof TrustedAuthorizationError && e.code === "permission_denied",
  );
  assert.throws(
    () => assertTrustedPermission("places.rollback", {uid: "", claims: {}}, NO_ALLOWLIST),
    (e: unknown) => e instanceof TrustedAuthorizationError && e.code === "unauthenticated",
  );
});

// Test 27: owner allowlist hanya berkuat kuasa bila dikonfigur secara eksplisit.
test("owner allowlist works only when explicitly configured", () => {
  assert.equal(isTrustedOwner({uid: "owner-uid", claims: {}}, NO_ALLOWLIST), false);
  assert.equal(isTrustedOwner({uid: "owner-uid", claims: {}}, WITH_ALLOWLIST), true);
  assert.equal(isTrustedOwner({uid: "other", claims: {}}, WITH_ALLOWLIST), false);
});

test("correction submission needs only authentication (no special permission)", () => {
  assert.equal(canSubmitCorrection({uid: "any-authed-user"}), true);
  assert.equal(canSubmitCorrection({uid: undefined}), false);
});
