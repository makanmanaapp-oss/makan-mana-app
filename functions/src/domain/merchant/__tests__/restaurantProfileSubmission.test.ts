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
    validateRestaurantProfileProposal("hours_update", {business_status: "active", opening_hours: {monday: {closed: false, all_day: false, sessions: [{open: "09:00", close: "14:00"}, {open: "17:00", close: "22:00"}]}}}).data,
    {business_status: "active", opening_hours: {monday: {closed: false, all_day: false, sessions: [{open: "09:00", close: "14:00"}, {open: "17:00", close: "22:00"}]}}},
  );
});

test("normalizes itemized food and drink menu proposals", () => {
  const result = validateRestaurantProfileProposal("menu_update", {
    menu_items: [
      {section: "makanan", name: "Nasi Lemak", price: 8.5, available: true},
      {section: "minuman", name: "Teh O Ais", category: "Teh", price: 3, imageUrl: "https://example.com/teh.jpg"},
    ],
  }).data.menu_items as Array<Record<string, unknown>>;

  assert.equal(result.length, 2);
  assert.deepEqual(result[0], {
    id: "menu-makanan-1",
    section: "makanan",
    category: "",
    name: "Nasi Lemak",
    description: "",
    price: 8.5,
    currency: "MYR",
    available: true,
    imageUrl: "",
    sortOrder: 0,
  });
  assert.equal(result[1].section, "minuman");
  assert.equal(result[1].currency, "MYR");
  assert.equal(result[1].sortOrder, 10);
});

test("rejects malformed menu items before they reach the merchant bridge", () => {
  assert.throws(
    () => validateRestaurantProfileProposal("menu_update", {menu_items: [{section: "makanan", name: "", price: 5}]}),
    /restaurant_profile_menu_item_name:0:required/,
  );
  assert.throws(
    () => validateRestaurantProfileProposal("menu_update", {menu_items: [{section: "dessert", name: "Cake"}]}),
    /restaurant_profile_menu_item_section_invalid:0/,
  );
  assert.throws(
    () => validateRestaurantProfileProposal("menu_update", {menu_items: [{section: "minuman", name: "Kopi", price: -1}]}),
    /restaurant_profile_menu_item_price_invalid:0/,
  );
  assert.throws(
    () => validateRestaurantProfileProposal("menu_update", {menu_items: [{section: "minuman", name: "Kopi", imageUrl: "javascript:bad"}]}),
    /restaurant_profile_menu_item_image_invalid:0/,
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
    () => validateRestaurantProfileProposal("profile_update", {short_description: "x".repeat(400 * 1024)}),
    /restaurant_profile_data_too_large/,
  );
});
