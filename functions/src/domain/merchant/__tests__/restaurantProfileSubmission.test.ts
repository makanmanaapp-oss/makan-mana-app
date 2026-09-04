import assert from "node:assert/strict";
import {test} from "node:test";

import {
  parseRestaurantProfileSubmissionType,
  validateRestaurantProfileProposal,
} from "../restaurantProfileSubmission";

test("accepts the four Restaurant Profile V2 proposal types", () => {
  for (const type of ["profile_update", "hours_update", "contact_update", "menu_update"]) {
    assert.equal(parseRestaurantProfileSubmissionType(type), type);
  }
});

test("accepts fields only when they belong to the selected proposal type", () => {
  assert.deepEqual(
    validateRestaurantProfileProposal("contact_update", {phone: "0111111111", instagram: "makanmana"}).data,
    {phone: "0111111111", instagram: "makanmana"},
  );
  assert.deepEqual(
    validateRestaurantProfileProposal("hours_update", {business_status: "active", opening_hours: {mon: []}}).data,
    {business_status: "active", opening_hours: {mon: []}},
  );
  assert.deepEqual(
    validateRestaurantProfileProposal("menu_update", {signature_dishes: ["Nasi Lemak"], price_range: "budget"}).data,
    {signature_dishes: ["Nasi Lemak"], price_range: "budget"},
  );
});

test("rejects safety certification fields", () => {
  for (const key of ["halal_status", "halal_verified_at", "allergen_verified", "dietary_verified"]) {
    assert.throws(
      () => validateRestaurantProfileProposal("profile_update", {[key]: "forged"}),
      new RegExp(`restaurant_profile_field_forbidden:${key}`),
    );
  }
});

test("rejects system, apply and publication fields", () => {
  for (const key of [
    "registry_status", "firebase_id", "source_snapshot", "data_quality_score",
    "apply_status", "applied_by", "apply_reason", "published_at", "publication_requested",
  ]) {
    assert.throws(
      () => validateRestaurantProfileProposal("profile_update", {[key]: "forged"}),
      new RegExp(`restaurant_profile_field_forbidden:${key}`),
    );
  }
});

test("rejects unknown or cross-type fields instead of silently stripping", () => {
  assert.throws(
    () => validateRestaurantProfileProposal("contact_update", {phone: "011", opening_hours: {}}),
    /restaurant_profile_field_not_allowed:opening_hours/,
  );
  assert.throws(
    () => validateRestaurantProfileProposal("profile_update", {totally_unknown: true}),
    /restaurant_profile_field_not_allowed:totally_unknown/,
  );
});

test("rejects unsupported type, empty body and oversized proposal", () => {
  assert.throws(
    () => validateRestaurantProfileProposal("media_update", {phone: "011"}),
    /restaurant_profile_submission_type_invalid/,
  );
  assert.throws(
    () => validateRestaurantProfileProposal("profile_update", {}),
    /restaurant_profile_data_empty/,
  );
  assert.throws(
    () => validateRestaurantProfileProposal("profile_update", {short_description: "x".repeat(40 * 1024)}),
    /restaurant_profile_data_too_large/,
  );
});
