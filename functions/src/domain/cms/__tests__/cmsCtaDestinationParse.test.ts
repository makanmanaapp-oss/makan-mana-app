/**
 * B5 DEF-2 — a destination that cannot be a URL must be refused when it is
 * AUTHORED, not silently at the moment somebody taps it.
 *
 * Found on a physical device: `https://[b5c` passed both validators because
 * both only checked that the string STARTS WITH "https://". The banner rendered
 * a CTA that looked live, `Uri.tryParse` returned null at activation, and the
 * tap did nothing and logged nothing. The operator had no way to see it.
 *
 * The two sides disagree about malformed input in ways that matter, so the rule
 * cannot be "it parses":
 *   "https://"             JS `new URL` throws;  Dart parses with an EMPTY host
 *   "https://exa mple.com" JS `new URL` throws;  Dart parses host "exa%20mple.com"
 * Hence: no whitespace, must parse, scheme must be https, host must be present.
 * `test/features/cms/cms_cta_destination_parse_test.dart` asserts the same table
 * on the client.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {validateCtaDestination} from "../cmsLifecycle";

// Refused, with the reason an operator can act on.
const MALFORMED = [
  "https://[b5c",              // the device fixture
  "https://",                  // scheme only, no host
  "https://exa mple.com",      // raw space
  "https:// makanmana.app",
  "https://[",
  "https://]",
];

// Everything the contract already promised keeps working.
const EXTERNAL_OK = [
  "https://makanmana.app/promo",
  "https://makanmana.app:8443/x",
  "https://xn--n3h.example/x",
  "https://makanmana.app/x?a=1&b=2#frag",
];

const INTERNAL_OK = ["/explore", "/restaurant/canon-1", "/home", "/profile"];

test("DEF-2: a malformed https destination is refused at authoring time", () => {
  for (const bad of MALFORMED) {
    const result = validateCtaDestination(bad);
    assert.equal(result.ok, false, `must refuse ${JSON.stringify(bad)}`);
    assert.equal(result.error, "cta_destination_malformed",
      `${JSON.stringify(bad)} should name the malformed-URL reason, not a scheme error`);
  }
});

test("DEF-2: valid external destinations are untouched", () => {
  for (const good of EXTERNAL_OK) {
    const result = validateCtaDestination(good);
    assert.equal(result.ok, true, `must accept ${good}`);
    assert.equal(result.value, good);
  }
});

test("DEF-2: internal routes are untouched", () => {
  for (const good of INTERNAL_OK) {
    assert.equal(validateCtaDestination(good).ok, true, `must accept ${good}`);
  }
});

test("DEF-2: the earlier rules still fail closed and keep their own reasons", () => {
  assert.equal(validateCtaDestination("javascript:alert(1)").error, "cta_scheme_not_allowed");
  assert.equal(validateCtaDestination("java script:alert(1)").error, "cta_scheme_not_allowed");
  assert.equal(validateCtaDestination("http://insecure.example").error, "cta_scheme_not_allowed");
  assert.equal(validateCtaDestination("/admin").error, "cta_route_not_allowed");
  // Absent is still "no CTA", not an error.
  assert.equal(validateCtaDestination(undefined).ok, true);
  assert.equal(validateCtaDestination("").ok, true);
});

test("DEF-2: the authoring bridge surfaces the reason to the operator", () => {
  // The operator never calls the validator directly - they enqueue a command.
  // The bridge must keep handing the reason back rather than swallowing it,
  // otherwise a refused banner looks like a generic failure.
  const bridge = readFileSync(
    resolve(process.cwd(), "src/controlCenter/cmsAdminBridge.ts"), "utf8");
  assert.ok(bridge.includes("validateCtaDestination(payload.ctaDestination)"),
    "the bridge must validate the destination it was given");
  assert.ok(bridge.includes("return {ok: false, error: v.error};"),
    "the validator's reason must reach the caller unchanged");
});
