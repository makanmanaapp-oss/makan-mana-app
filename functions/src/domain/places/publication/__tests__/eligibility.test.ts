/**
 * Phase 1.6 Part O — ujian enjin kelayakan penerbitan (25-30).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluatePublicationEligibility,
  withEligibilityOverrides,
} from "../index";
import {
  eligiblePlace,
  freshInputsAt,
  lowCompletenessPlace,
  permanentlyClosed,
  safetyConflictPlace,
  unknownHoursPlace,
  unknownPricePlace,
  unresolvedDuplicatePlace,
  T,
  DAY,
} from "./fixtures";

const ctx = (over: Record<string, unknown> = {}) => ({
  now: T + 1000,
  freshnessInputs: freshInputsAt(T),
  ...over,
});

// 25. Kedai sah adalah LAYAK.
test("25. kedai lengkap+segar+approved adalah layak", () => {
  const r = evaluatePublicationEligibility(eligiblePlace(), ctx());
  assert.equal(r.eligible, true, `blocked: ${r.blockingReasons.join(",")}`);
  assert.deepEqual(r.blockingReasons, []);
  assert.equal(r.completenessResult.meetsMinimum, true);
  assert.equal(r.freshnessResult.overallFreshnessState, "fresh");
  assert.equal(r.version, "eligibility_v1");
});

// 26. Completeness rendah MENYEKAT.
test("26. completeness di bawah ambang menyekat", () => {
  const r = evaluatePublicationEligibility(lowCompletenessPlace(), ctx());
  assert.equal(r.eligible, false);
  assert.ok(r.blockingReasons.includes("below_minimum_completeness"));
  assert.ok(r.requiredActions.includes("improve_completeness"));
});

test("26b. completeness sederhana (0.60-0.79) layak DENGAN amaran label", () => {
  const p = eligiblePlace();
  p.completeness = { ...p.completeness, overallScore: 0.7 };
  const r = evaluatePublicationEligibility(p, ctx());
  assert.equal(r.eligible, true);
  assert.ok(r.warnings.includes("completeness_needs_labels"));
});

// 27. Duplikat belum selesai MENYEKAT.
test("27. duplikat belum selesai menyekat", () => {
  const r = evaluatePublicationEligibility(unresolvedDuplicatePlace(), ctx());
  assert.equal(r.eligible, false);
  assert.ok(r.blockingReasons.includes("unresolved_duplicate"));
  assert.ok(r.requiredActions.includes("resolve_duplicate"));
});

test("27b. duplikat daripada konteks dedup luaran juga menyekat", () => {
  const r = evaluatePublicationEligibility(
    eligiblePlace(),
    ctx({ hasUnresolvedDuplicate: true }),
  );
  assert.equal(r.eligible, false);
  assert.ok(r.blockingReasons.includes("unresolved_duplicate"));
});

test("27c. rekod yang telah digabung tidak boleh terbit sebagai entiti sendiri", () => {
  const p = eligiblePlace();
  p.mergeState = {
    mergeStatus: "merged",
    duplicateOf: "mm_pub_0001",
    preservedSourceRefs: [],
  };
  const r = evaluatePublicationEligibility(p, ctx());
  assert.equal(r.eligible, false);
  assert.ok(r.blockingReasons.includes("merged_or_superseded_alias"));
});

// 28. Konflik keselamatan MENYEKAT.
test("28. konflik keselamatan halal menyekat", () => {
  const r = evaluatePublicationEligibility(safetyConflictPlace(), ctx());
  assert.equal(r.eligible, false);
  assert.ok(r.blockingReasons.includes("unresolved_safety_conflict"));
  assert.ok(r.safetyResult.conflictCodes.includes("halal_certified_vs_non_halal_report"));
  assert.ok(r.requiredActions.includes("resolve_safety_conflict"));
});

// 29. Harga tidak diketahui hanya MEMBERI AMARAN.
test("29. harga unknown hanya memberi amaran (tidak menyekat)", () => {
  const r = evaluatePublicationEligibility(unknownPricePlace(), ctx());
  assert.equal(r.eligible, true, `blocked: ${r.blockingReasons.join(",")}`);
  assert.ok(r.warnings.includes("unknown_price"));
});

// 30. Waktu tidak diketahui: amaran ATAU sekatan mengikut polisi.
test("30. waktu unknown memberi amaran mengikut polisi lalai", () => {
  const r = evaluatePublicationEligibility(unknownHoursPlace(), ctx());
  assert.equal(r.eligible, true);
  assert.ok(r.warnings.includes("unknown_hours"));
});

test("30b. waktu unknown MENYEKAT bila polisi dikonfigurasi begitu", () => {
  const config = withEligibilityOverrides({ unknownHoursBlocksPublication: true });
  const r = evaluatePublicationEligibility(unknownHoursPlace(), ctx({ config }));
  assert.equal(r.eligible, false);
  assert.ok(r.blockingReasons.includes("invalid_business_status"));
});

// Sekatan lain yang diwajibkan Part G.
test("kedai tutup kekal disekat", () => {
  const r = evaluatePublicationEligibility(permanentlyClosed(), ctx());
  assert.equal(r.eligible, false);
  assert.ok(r.blockingReasons.includes("permanently_closed"));
  assert.equal(r.statusResult.permanentlyClosed, true);
});

test("rekod belum approved disekat (approved != published)", () => {
  const p = eligiblePlace();
  p.publicationStatus = "needs_review";
  const r = evaluatePublicationEligibility(p, ctx());
  assert.equal(r.eligible, false);
  assert.ok(r.blockingReasons.includes("not_approved"));
  assert.ok(r.requiredActions.includes("approve_record"));
});

test("identiti tidak stabil disekat", () => {
  const p = eligiblePlace();
  p.identity = { ...p.identity, canonicalName: "  ", normalizedName: "" };
  const r = evaluatePublicationEligibility(p, ctx());
  assert.ok(r.blockingReasons.includes("missing_stable_identity"));
});

test("lokasi tidak sah disekat", () => {
  const p = eligiblePlace();
  p.location = { ...p.location, lat: 999, lng: 0 };
  const r = evaluatePublicationEligibility(p, ctx());
  assert.ok(r.blockingReasons.includes("invalid_location"));
  assert.ok(r.requiredActions.includes("fix_location"));
});

test("verification rejected/tidak dibenarkan disekat", () => {
  const rejected = eligiblePlace();
  rejected.verificationStatus = "rejected";
  assert.ok(
    evaluatePublicationEligibility(rejected, ctx()).blockingReasons.includes(
      "verification_rejected",
    ),
  );

  const unverified = eligiblePlace();
  unverified.verificationStatus = "unverified";
  assert.ok(
    evaluatePublicationEligibility(unverified, ctx()).blockingReasons.includes(
      "verification_not_allowed",
    ),
  );
});

test("provenance wajib yang hilang disekat", () => {
  const p = eligiblePlace();
  p.provenance = {};
  const r = evaluatePublicationEligibility(p, ctx());
  assert.ok(r.blockingReasons.includes("missing_required_provenance"));
  assert.ok(r.requiredActions.includes("attach_provenance"));
});

test("tag tidak diluluskan disekat", () => {
  const r = evaluatePublicationEligibility(
    eligiblePlace(),
    ctx({ unapprovedTagIds: ["Nasi Lemak"] }),
  );
  assert.ok(r.blockingReasons.includes("invalid_or_unapproved_tags"));
  assert.ok(r.requiredActions.includes("review_tags"));
});

test("keadaan media/fallback tidak sah disekat", () => {
  const p = eligiblePlace();
  p.media = { canonicalMediaId: "missing_media", items: [] };
  const r = evaluatePublicationEligibility(p, ctx());
  assert.ok(r.blockingReasons.includes("invalid_media_fallback_state"));

  const pending = eligiblePlace();
  pending.media = {
    canonicalMediaId: "m1",
    items: [
      {
        mediaId: "m1",
        url: "https://example.test/a.jpg",
        status: "pending",
        sourceType: "provider",
        isFallback: false,
      },
    ],
  };
  assert.ok(
    evaluatePublicationEligibility(pending, ctx()).blockingReasons.includes(
      "invalid_media_fallback_state",
    ),
  );
});

// Freshness kritikal luput MENYEKAT (ujian 13 pada peringkat kelayakan).
test("freshness kritikal luput menyekat penerbitan", () => {
  const inputs = freshInputsAt(T);
  inputs.openingHours = { fetchedAt: T - 61 * DAY };
  const r = evaluatePublicationEligibility(
    eligiblePlace(),
    ctx({ freshnessInputs: inputs }),
  );
  assert.equal(r.eligible, false);
  assert.ok(r.blockingReasons.includes("expired_critical_freshness"));
  assert.ok(r.requiredActions.includes("refresh_critical_fields"));
});

test("medan bukan-kritikal stale layak DENGAN amaran", () => {
  const inputs = freshInputsAt(T);
  inputs.rating = { fetchedAt: T - 100 * DAY }; // stale, bukan expired
  const r = evaluatePublicationEligibility(
    eligiblePlace(),
    ctx({ freshnessInputs: inputs }),
  );
  assert.equal(r.eligible, true, `blocked: ${r.blockingReasons.join(",")}`);
  assert.ok(r.warnings.includes("stale_rating"));
  assert.ok(r.warnings.includes("stale_non_critical_field"));
});

test("amaran bukti lemah: ulasan sedikit + tag inferred + alergen tidak lengkap", () => {
  const p = eligiblePlace();
  p.quality = { rating: 4.9, reviewCount: 2 };
  p.tagSet = {
    tags: [
      {
        tagId: "cafe",
        family: "place_type",
        evidenceLevel: "inferred",
        confidence: 0.2,
        sourceType: "makanmana",
      },
    ],
  };
  p.safetyEvidence = {
    halal: { state: "unknown", evidenceLevel: "unknown" },
    dietaryReported: [],
    allergenReported: [],
    allergenEvidenceLevel: "unknown",
  };
  const r = evaluatePublicationEligibility(p, ctx());
  assert.equal(r.eligible, true);
  assert.ok(r.warnings.includes("low_review_evidence"));
  assert.ok(r.warnings.includes("inferred_tags"));
  assert.ok(r.warnings.includes("incomplete_allergen_data"));
});

test("status community_unverified memberi amaran, bukan sekatan", () => {
  const p = eligiblePlace();
  p.status = "community_unverified";
  p.verificationStatus = "community_reported";
  const r = evaluatePublicationEligibility(p, ctx());
  assert.equal(r.eligible, true);
  assert.ok(r.warnings.includes("community_reported_status"));
});
