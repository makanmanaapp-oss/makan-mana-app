import assert from "node:assert/strict";
import test from "node:test";

import {projectPublicRestaurantProfileV2} from "../publicRestaurantProfile";

const canonicalId = "canonical-restaurant-1";

test("projects modern immutable publication and strips private provenance", () => {
  const result = projectPublicRestaurantProfileV2({
    publicationStatus: "published",
    versionNumber: 7,
    publishedBy: "admin-secret-id",
    warnings: ["hours_stale"],
    eligibilitySnapshot: {overallFreshnessState: "stale"},
    snapshot: {
      place: {
        placeId: canonicalId,
        status: "active",
        verificationStatus: "merchant_verified",
        identity: {canonicalName: "Kedai Makan A", branchName: "Satok"},
        displaySnapshot: {name: "Kedai Makan A", address: "Jalan Satok, Kuching"},
        location: {lat: 1.55, lng: 110.34, locality: "Kuching", state: "Sarawak", postalCode: "93400"},
        contacts: {phones: ["0111111111"], website: "https://example.com"},
        media: {items: [
          {url: "https://images.example/hero.jpg", status: "approved", sourceType: "merchant", isFallback: false, approvedBy: "admin-secret-id"},
          {url: "https://images.example/rejected.jpg", status: "rejected", sourceType: "merchant", isFallback: false},
        ]},
        commercial: {priceState: "verified", priceBandId: "budget", averageSpend: 18, currency: "MYR"},
        hours: {hoursState: "known", periods: [{openMinuteOfWeek: 480, closeMinuteOfWeek: 1020}]},
        quality: {rating: 4.6, reviewCount: 120},
        tagSet: {tags: [
          {tagId: "malay", family: "cuisine", evidenceLevel: "verified", sourceType: "merchant", approvedBy: "admin-secret-id"},
          {tagId: "dine_in", family: "service", evidenceLevel: "reported", sourceType: "merchant"},
        ]},
        safetyEvidence: {
          halal: {state: "merchant_claimed", evidenceLevel: "reported", sourceType: "merchant"},
          dietaryReported: ["vegetarian_options"],
          allergenReported: ["peanut"],
          allergenEvidenceLevel: "reported",
        },
        freshness: {openingHours: {state: "stale"}},
        provenance: {phone: {approvedBy: "admin-secret-id", sourceRecordId: "private-source"}},
        updatedAt: 1700000000000,
      },
      displayState: {
        hours: {state: "hours_known", warningCode: "hours_stale"},
        price: {state: "price_verified", priceBandId: "budget", averageSpend: 18},
        rating: {state: "rating_shown", rating: 4.6, reviewCount: 120},
        business: {state: "operating", blockedFromPublic: false},
        safety: {halal: "halal_merchant_claimed", allergenUnknown: false, dietaryUnknown: false, warningCodes: []},
      },
    },
  }, canonicalId);

  assert.ok(result);
  assert.equal(result.canonicalPlaceId, canonicalId);
  assert.equal(result.publicationVersion, 7);
  assert.equal(result.name, "Kedai Makan A");
  assert.equal(result.branchName, "Satok");
  assert.equal(result.phone, "0111111111");
  assert.equal(result.priceState, "price_verified");
  assert.equal(result.rating, 4.6);
  assert.equal(result.halalState, "halal_merchant_claimed");
  assert.deepEqual(result.cuisineTags, ["malay"]);
  assert.deepEqual(result.serviceModes, ["dine_in"]);
  assert.equal(result.media.length, 1);
  assert.equal(result.freshnessState, "stale");
  assert.ok(!("publishedBy" in result));
  assert.ok(!("provenance" in result));
  assert.ok(!("sourceRecordId" in result));
  assert.ok(!("approvedBy" in result.tags[0]));
});

test("projects only bounded public menu fields and structured two-session hours", () => {
  const result = projectPublicRestaurantProfileV2({
    publicationStatus: "published",
    name: "Restoran Menu",
    menuItems: [
      {
        id: "nasi-1",
        section: "makanan",
        category: "Nasi",
        name: "Nasi Lemak",
        description: "Sambal dan telur",
        price: 8.5,
        currency: "MYR",
        available: true,
        imageUrl: "https://example.com/nasi.jpg",
        sortOrder: 10,
        approvedBy: "private-admin",
        costPrice: 3.2,
      },
      {
        section: "minuman",
        name: "Teh O Ais",
        price: 3,
        imageUrl: "javascript:alert(1)",
        sortOrder: 20,
      },
      {section: "dessert", name: "Invalid section", price: 4},
      {section: "makanan", name: "", price: 1},
    ],
    openingHours: {
      monday: {
        closed: false,
        all_day: false,
        sessions: [
          {open: "09:00", close: "14:00", privateNote: "hide"},
          {open: "17:00", close: "22:00", privateNote: "hide"},
          {open: "23:00", close: "23:30"},
        ],
        internalSource: "private",
      },
      tuesday: {closed: true, sessions: [{open: "invalid", close: "18:00"}]},
      wednesday: {all_day: true},
      hackedDay: {closed: false, sessions: [{open: "00:00", close: "23:59"}]},
    },
    specialHours: [
      {date: "2026-09-16", note: "Cuti Malaysia", closed: true, approvedBy: "private-admin"},
      {date: "bad-date", note: "Bad"},
    ],
  }, canonicalId);

  assert.ok(result);
  assert.equal(result.menuItems.length, 2);
  assert.deepEqual(result.menuItems[0], {
    id: "nasi-1",
    section: "makanan",
    category: "Nasi",
    name: "Nasi Lemak",
    description: "Sambal dan telur",
    price: 8.5,
    currency: "MYR",
    available: true,
    imageUrl: "https://example.com/nasi.jpg",
    sortOrder: 10,
  });
  assert.equal(result.menuItems[1].imageUrl, "");
  assert.ok(!("approvedBy" in result.menuItems[0]));
  assert.ok(!("costPrice" in result.menuItems[0]));

  assert.deepEqual(result.openingHours?.monday, {
    closed: false,
    all_day: false,
    sessions: [
      {open: "09:00", close: "14:00"},
      {open: "17:00", close: "22:00"},
    ],
  });
  assert.deepEqual(result.openingHours?.tuesday, {
    closed: true,
    all_day: false,
    sessions: [],
  });
  assert.deepEqual(result.openingHours?.wednesday, {
    closed: false,
    all_day: true,
    sessions: [],
  });
  assert.equal(result.openingHours?.hackedDay, undefined);
});

test("supports bounded flattened master-publication compatibility shape", () => {
  const result = projectPublicRestaurantProfileV2({
    publicationStatus: "published",
    versionNumber: 3,
    name: "Restoran B",
    officialName: "RESTORAN B SDN BHD",
    branchName: "Miri",
    address: "Miri, Sarawak",
    latitude: 4.39,
    longitude: 113.99,
    contact: {
      phone: "0122222222",
      whatsapp: "60122222222",
      website: "https://b.example",
      instagram: "restoranb",
    },
    cuisineTags: ["sarawak"],
    foodTags: ["laksa"],
    signatureDishes: ["Laksa Sarawak"],
    menuItems: [
      {section: "makanan", name: "Laksa Sarawak", price: 12, currency: "MYR", available: true},
      {section: "minuman", name: "Kopi O", price: null, currency: "MYR", available: true},
    ],
    serviceModes: ["dine_in"],
    amenities: ["parking"],
    priceRange: "mid",
    businessStatus: "active",
    openingHours: {
      monday: {closed: false, all_day: false, sessions: [{open: "08:00", close: "18:00"}]},
    },
    specialHours: [],
    halalStatus: "verified_halal",
    coverImageUrl: "https://images.example/b.jpg",
    mediaGallery: [{url: "https://images.example/b.jpg", isCover: true}],
  }, canonicalId);

  assert.ok(result);
  assert.equal(result.name, "Restoran B");
  assert.equal(result.whatsapp, "60122222222");
  assert.deepEqual(result.signatureDishes, ["Laksa Sarawak"]);
  assert.equal(result.menuItems.length, 2);
  assert.equal(result.menuItems[0].price, 12);
  assert.equal(result.menuItems[1].price, null);
  assert.equal(result.priceBandId, "mid");
  assert.equal(result.media.length, 1);
  assert.equal(result.hoursState, "hours_known");
});

test("rejects unpublished, blocked and nameless publication records", () => {
  assert.equal(projectPublicRestaurantProfileV2({publicationStatus: "approved", title: "A"}, canonicalId), null);
  assert.equal(projectPublicRestaurantProfileV2({publicationStatus: "published", blocked: true, title: "A"}, canonicalId), null);
  assert.equal(projectPublicRestaurantProfileV2({publicationStatus: "published"}, canonicalId), null);
});
