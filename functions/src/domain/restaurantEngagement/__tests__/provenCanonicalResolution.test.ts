import assert from "node:assert/strict";
import {test} from "node:test";

import {
  resolveCanonicalPlaceIdWith,
  resolveProvenCanonicalPlaceIdWith,
  type CanonicalAliasRecord,
  type CanonicalResolutionDeps,
} from "../canonicalResolution";

/**
 * GATE 3F — STRICT canonical identity for the PUBLIC Follow surface.
 *
 * The lenient resolver is correct for server flows such as unfollow, which must
 * reach whatever id a follow was stored under. The strict resolver exists so a
 * raw provider/Google place id can never be handed to a client as a canonical
 * restaurant identity.
 */

function deps(options: {
  heads?: string[];
  aliases?: Record<string, CanonicalAliasRecord>;
}): CanonicalResolutionDeps {
  const heads = new Set(options.heads ?? []);
  const aliases = options.aliases ?? {};
  return {
    headExists: async (placeId) => heads.has(placeId),
    readAlias: async (placeId) => aliases[placeId] ?? null,
  };
}

test("1. an id with its own publication head is already canonical", async () => {
  const d = deps({heads: ["PLC-1"]});
  assert.equal(await resolveProvenCanonicalPlaceIdWith("PLC-1", d), "PLC-1");
});

test("2. an alias chain that reaches a head resolves to that canonical id", async () => {
  const d = deps({
    heads: ["PLC-1"],
    aliases: {"ChIJgoogle": {canonicalPlaceId: "PLC-1"}},
  });
  assert.equal(await resolveProvenCanonicalPlaceIdWith("ChIJgoogle", d), "PLC-1");
});

test("3. a registry alias mapping is proof even with NO publication head", async () => {
  // This is exactly the decoupled case: identity proven, profile absent.
  const d = deps({aliases: {"ChIJgoogle": {canonicalPlaceId: "PLC-unpublished"}}});
  assert.equal(
    await resolveProvenCanonicalPlaceIdWith("ChIJgoogle", d),
    "PLC-unpublished",
  );
});

test("4. an UNKNOWN provider id is NEVER echoed back as canonical", async () => {
  const d = deps({});
  // The lenient resolver returns the caller's own id (correct for unfollow)...
  assert.equal(await resolveCanonicalPlaceIdWith("ChIJraw", d), "ChIJraw");
  // ...but the public/strict resolver must fail closed.
  assert.equal(await resolveProvenCanonicalPlaceIdWith("ChIJraw", d), null);
});

test("5. a blocked alias fails closed", async () => {
  const d = deps({
    aliases: {"ChIJblocked": {status: "blocked", canonicalPlaceId: "PLC-1"}},
  });
  assert.equal(await resolveProvenCanonicalPlaceIdWith("ChIJblocked", d), null);
});

test("6. a cyclic alias chain fails closed", async () => {
  const d = deps({
    aliases: {
      "A": {canonicalPlaceId: "B"},
      "B": {canonicalPlaceId: "A"},
    },
  });
  assert.equal(await resolveProvenCanonicalPlaceIdWith("A", d), null);
});

test("7. a dangling alias (empty target) fails closed", async () => {
  const d = deps({aliases: {"A": {canonicalPlaceId: "   "}}});
  assert.equal(await resolveProvenCanonicalPlaceIdWith("A", d), null);
});

test("8. empty and oversized input fail closed", async () => {
  const d = deps({heads: ["PLC-1"]});
  assert.equal(await resolveProvenCanonicalPlaceIdWith("", d), null);
  assert.equal(await resolveProvenCanonicalPlaceIdWith("   ", d), null);
  assert.equal(await resolveProvenCanonicalPlaceIdWith("x".repeat(301), d), null);
});

test("9. hop budget is bounded and fails closed rather than looping", async () => {
  const aliases: Record<string, CanonicalAliasRecord> = {};
  for (let i = 0; i < 30; i += 1) aliases[`n${i}`] = {canonicalPlaceId: `n${i + 1}`};
  const d = deps({aliases});
  // Never reaches a head within the hop budget: the last mapped id is returned
  // by the walk, never the caller's own id.
  const result = await resolveProvenCanonicalPlaceIdWith("n0", d, 3);
  assert.notEqual(result, "n0");
  assert.equal(result, "n3");
});

test("10. the lenient resolver keeps its existing behaviour unchanged", async () => {
  const d = deps({
    heads: ["PLC-1"],
    aliases: {"ChIJgoogle": {canonicalPlaceId: "PLC-1"}},
  });
  assert.equal(await resolveCanonicalPlaceIdWith("PLC-1", d), "PLC-1");
  assert.equal(await resolveCanonicalPlaceIdWith("ChIJgoogle", d), "PLC-1");
  assert.equal(await resolveCanonicalPlaceIdWith("unknown", d), "unknown");
});
