/**
 * WAVE 5 — CMS lifecycle, targeting, CTA safety and media governance.
 *
 * These are the decisions that keep operator-authored content from becoming a
 * delivery mechanism: what is live, who sees it, where a CTA may send someone,
 * and what a "media reference" is allowed to point at.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  compareCmsOrder,
  decideCmsTransition,
  effectiveCmsStatus,
  isCmsPubliclyVisible,
  validateCmsMedia,
  validateCmsPlacement,
  validateCmsTitle,
  validateCmsWindow,
  validateCtaDestination,
  validatePriority,
  validateTargeting,
  viewerMatchesTargeting,
} from "../cmsLifecycle";
import {
  CMS_STATUS_ACTIVE,
  CMS_STATUS_ARCHIVED,
  CMS_STATUS_DRAFT,
  CMS_STATUS_EXPIRED,
  CMS_STATUS_PAUSED,
  CMS_STATUS_SCHEDULED,
  DEFAULT_TARGETING,
} from "../cmsTypes";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 8, 12, 0, 0);

// ── VISIBILITY ─────────────────────────────────────────────────────────────

test("1. draft content is never public", () => {
  assert.equal(isCmsPubliclyVisible(CMS_STATUS_DRAFT, NOW - HOUR, NOW + HOUR, NOW), false);
});

test("2. paused content is never public", () => {
  assert.equal(isCmsPubliclyVisible(CMS_STATUS_PAUSED, NOW - HOUR, NOW + HOUR, NOW), false);
});

test("3. expired content is never public, even when storage says active", () => {
  assert.equal(isCmsPubliclyVisible(CMS_STATUS_ACTIVE, NOW - 3 * HOUR, NOW - HOUR, NOW), false);
  assert.equal(effectiveCmsStatus(CMS_STATUS_ACTIVE, NOW - 3 * HOUR, NOW - HOUR, NOW),
    CMS_STATUS_EXPIRED);
});

test("4. content scheduled for the future is never public yet", () => {
  assert.equal(isCmsPubliclyVisible(CMS_STATUS_ACTIVE, NOW + HOUR, NOW + 2 * HOUR, NOW), false);
  assert.equal(effectiveCmsStatus(CMS_STATUS_SCHEDULED, NOW + HOUR, NOW + 2 * HOUR, NOW),
    CMS_STATUS_SCHEDULED);
});

test("5. active content inside its window is public", () => {
  assert.equal(isCmsPubliclyVisible(CMS_STATUS_ACTIVE, NOW - HOUR, NOW + HOUR, NOW), true);
  // A scheduled row whose window has opened is live without anyone rewriting it.
  assert.equal(isCmsPubliclyVisible(CMS_STATUS_SCHEDULED, NOW - HOUR, NOW + HOUR, NOW), true);
});

test("6. archived content is never public and is terminal", () => {
  assert.equal(isCmsPubliclyVisible(CMS_STATUS_ARCHIVED, NOW - HOUR, NOW + HOUR, NOW), false);
  for (const requested of [CMS_STATUS_ACTIVE, CMS_STATUS_DRAFT, CMS_STATUS_PAUSED] as const) {
    const d = decideCmsTransition({
      stored: CMS_STATUS_ARCHIVED, startsAtMs: NOW - HOUR, endsAtMs: NOW + HOUR,
      requested, nowMs: NOW,
    });
    assert.equal(d.ok, false, `archived -> ${requested} must be refused`);
  }
});

test("7. visibility flips exactly AT endsAt", () => {
  const ends = NOW + HOUR;
  assert.equal(isCmsPubliclyVisible(CMS_STATUS_ACTIVE, NOW, ends, ends - 1), true);
  assert.equal(isCmsPubliclyVisible(CMS_STATUS_ACTIVE, NOW, ends, ends), false);
});

// ── TRANSITIONS ────────────────────────────────────────────────────────────

test("8. invalid transitions are rejected and expiry cannot be commanded", () => {
  assert.equal(decideCmsTransition({
    stored: CMS_STATUS_ACTIVE, startsAtMs: NOW - HOUR, endsAtMs: NOW + HOUR,
    requested: CMS_STATUS_EXPIRED, nowMs: NOW,
  }).reason, "status_not_settable");

  const resurrect = decideCmsTransition({
    stored: CMS_STATUS_PAUSED, startsAtMs: NOW - 3 * HOUR, endsAtMs: NOW - HOUR,
    requested: CMS_STATUS_ACTIVE, nowMs: NOW,
  });
  assert.equal(resurrect.ok, false);
  assert.match(resurrect.reason, /expired/);
});

test("9. pause and resume work while the window is open", () => {
  assert.equal(decideCmsTransition({
    stored: CMS_STATUS_ACTIVE, startsAtMs: NOW - HOUR, endsAtMs: NOW + HOUR,
    requested: CMS_STATUS_PAUSED, nowMs: NOW,
  }).ok, true);
  assert.equal(decideCmsTransition({
    stored: CMS_STATUS_PAUSED, startsAtMs: NOW - HOUR, endsAtMs: NOW + HOUR,
    requested: CMS_STATUS_ACTIVE, nowMs: NOW,
  }).ok, true);
});

// ── TARGETING ──────────────────────────────────────────────────────────────

test("10. targeting defaults to everyone and validates its allowlists", () => {
  assert.deepEqual(validateTargeting(undefined).value, DEFAULT_TARGETING);
  assert.deepEqual(validateTargeting({kind: "language", values: ["ms", "en"]}).value,
    {kind: "language", values: ["en", "ms"]});
  assert.equal(validateTargeting({kind: "gender", values: ["x"]}).error, "targeting_kind_invalid");
  assert.equal(validateTargeting({kind: "language", values: ["kl"]}).error, "targeting_values_invalid");
  assert.equal(validateTargeting({kind: "region", values: []}).error, "targeting_values_required");
  // Targeting every value IS "all"; one meaning, one representation.
  assert.deepEqual(
    validateTargeting({kind: "plan", values: ["free", "plus", "pro"]}).value,
    DEFAULT_TARGETING);
});

test("11. wrong language targeting omits the content", () => {
  const t = validateTargeting({kind: "language", values: ["ta"]}).value!;
  assert.equal(viewerMatchesTargeting(t, {language: "ta"}), true);
  assert.equal(viewerMatchesTargeting(t, {language: "ms"}), false);
  // An unknown viewer attribute never satisfies a gate.
  assert.equal(viewerMatchesTargeting(t, {language: null}), false);
});

test("12. wrong region targeting omits the content", () => {
  const t = validateTargeting({kind: "region", values: ["Selangor"]}).value!;
  assert.equal(viewerMatchesTargeting(t, {region: "Selangor"}), true);
  assert.equal(viewerMatchesTargeting(t, {region: "Johor"}), false);
  assert.equal(viewerMatchesTargeting(t, {}), false);
});

test("13. plan targeting treats an unknown plan as free", () => {
  const t = validateTargeting({kind: "plan", values: ["pro"]}).value!;
  assert.equal(viewerMatchesTargeting(t, {plan: "pro"}), true);
  assert.equal(viewerMatchesTargeting(t, {plan: null}), false);
  assert.equal(viewerMatchesTargeting(DEFAULT_TARGETING, {}), true);
});

// ── CTA SAFETY ─────────────────────────────────────────────────────────────

test("14. executable and handoff schemes are refused", () => {
  for (const bad of [
    "javascript:alert(1)", "JavaScript:alert(1)", "  javascript:alert(1)",
    "java script:alert(1)", "data:text/html,<script>", "file:///etc/passwd",
    "intent://scan/#Intent;scheme=zxing;end", "vbscript:msgbox", "about:blank",
    "blob:https://x", "market://details?id=x", "tel:+60123456789",
  ]) {
    assert.equal(validateCtaDestination(bad).error, "cta_scheme_not_allowed",
      `${bad} must be refused`);
  }
});

test("15. only allowlisted internal routes and https are accepted", () => {
  assert.equal(validateCtaDestination("/explore").ok, true);
  assert.equal(validateCtaDestination("/restaurant/canon-1").ok, true);
  assert.equal(validateCtaDestination("https://makanmana.app/promo").ok, true);
  assert.equal(validateCtaDestination("/admin").error, "cta_route_not_allowed",
    "an internal route outside the allowlist is refused");
  assert.equal(validateCtaDestination("http://insecure.example").error, "cta_scheme_not_allowed");
  // Absent is fine — a banner need not have a CTA.
  assert.equal(validateCtaDestination(undefined).ok, true);
});

test("16. raw markup is refused in every text field", () => {
  assert.equal(validateCmsTitle("<script>alert(1)</script>").error, "title_markup_not_allowed");
  assert.equal(validateCmsTitle("Promo hebat!").ok, true);
});

// ── MEDIA GOVERNANCE ───────────────────────────────────────────────────────

function media(overrides: Record<string, unknown> = {}) {
  return {
    storagePath: "cms/banners/raya-2026.webp",
    contentType: "image/webp",
    byteSize: 240_000,
    width: 1200,
    height: 600,
    altText: "Promosi Raya",
    ...overrides,
  };
}

test("17. an unsupported media type is refused", () => {
  assert.equal(validateCmsMedia(media({contentType: "image/svg+xml"})).error, "media_type_not_allowed");
  assert.equal(validateCmsMedia(media({contentType: "text/html"})).error, "media_type_not_allowed");
  assert.equal(validateCmsMedia(media()).ok, true);
});

test("18. oversized media is refused", () => {
  assert.equal(validateCmsMedia(media({byteSize: 5 * 1024 * 1024})).error, "media_too_large");
  assert.equal(validateCmsMedia(media({byteSize: 0})).error, "media_size_invalid");
});

test("19. media must live under the prefix this domain owns", () => {
  assert.equal(validateCmsMedia(media({storagePath: "users/private/photo.jpg"})).error,
    "media_path_not_allowed");
  assert.equal(validateCmsMedia(media({storagePath: "cms/../users/x.jpg"})).error,
    "media_path_not_allowed");
  assert.equal(validateCmsMedia(media({storagePath: ""})).error, "media_path_required");
});

test("20. implausible dimensions are refused", () => {
  assert.equal(validateCmsMedia(media({width: 10})).error, "media_dimensions_invalid");
  assert.equal(validateCmsMedia(media({height: 99999})).error, "media_dimensions_invalid");
  assert.equal(validateCmsMedia(media({width: 1200.5})).error, "media_dimensions_invalid");
});

test("21. media is optional — a text-only banner is valid", () => {
  const v = validateCmsMedia(undefined);
  assert.equal(v.ok, true);
  assert.equal(v.value, null);
});

// ── PLACEMENT, WINDOW, ORDER ───────────────────────────────────────────────

test("22. placement is an allowlist of surfaces the app can render", () => {
  assert.equal(validateCmsPlacement("home_top").ok, true);
  assert.equal(validateCmsPlacement("restaurant_detail").ok, true);
  assert.equal(validateCmsPlacement("checkout_banner").error, "placement_invalid");
});

test("23. the schedule must be bounded, ordered and not already closed", () => {
  assert.equal(validateCmsWindow(NOW, NOW + HOUR, NOW).ok, true);
  assert.equal(validateCmsWindow(NOW + HOUR, NOW, NOW).error, "window_invalid");
  assert.equal(validateCmsWindow(NOW - 3 * HOUR, NOW - HOUR, NOW).error, "window_already_closed");
  assert.equal(validateCmsWindow(undefined, NOW + HOUR, NOW).error, "starts_at_required");
});

test("24. ordering is deterministic and never depends on read order", () => {
  const items = [
    {priority: 100, startsAtMs: NOW, contentId: "b"},
    {priority: 10, startsAtMs: NOW + HOUR, contentId: "c"},
    {priority: 100, startsAtMs: NOW, contentId: "a"},
    {priority: 100, startsAtMs: NOW - HOUR, contentId: "d"},
  ];
  const sorted = [...items].sort(compareCmsOrder).map((i) => i.contentId);
  assert.deepEqual(sorted, ["c", "d", "a", "b"]);
  // Reversing the input must not change the result.
  const reversed = [...items].reverse().sort(compareCmsOrder).map((i) => i.contentId);
  assert.deepEqual(reversed, sorted);
});

test("25. priority is bounded and defaults sensibly", () => {
  assert.equal(validatePriority(undefined).value, 100);
  assert.equal(validatePriority(0).value, 0);
  assert.equal(validatePriority(-1).error, "priority_out_of_range");
  assert.equal(validatePriority(1.5).error, "priority_invalid");
});
