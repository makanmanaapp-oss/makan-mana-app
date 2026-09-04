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
    serviceModes: ["dine_in"],
    amenities: ["parking"],
    priceRange: "mid",
    businessStatus: "active",
    openingHours: {monday: "08:00-18:00"},
    specialHours: [],
    halalStatus: "verified_halal",
    coverImageUrl: "https://images.example/b.jpg",
    mediaGallery: [{url: "https://images.example/b.jpg", isCover: true}],
  }, canonicalId);

  assert.ok(result);
  assert.equal(result.name, "Restoran B");
  assert.equal(result.whatsapp, "60122222222");
  assert.deepEqual(result.signatureDishes, ["Laksa Sarawak"]);
  assert.equal(result.priceBandId, "mid");
  assert.equal(result.media.length, 1);
});

test("rejects unpublished, blocked and nameless publication records", () => {
  assert.equal(projectPublicRestaurantProfileV2({publicationStatus: "approved", title: "A"}, canonicalId), null);
  assert.equal(projectPublicRestaurantProfileV2({publicationStatus: "published", blocked: true, title: "A"}, canonicalId), null);
  assert.equal(projectPublicRestaurantProfileV2({publicationStatus: "published"}, canonicalId), null);
});
