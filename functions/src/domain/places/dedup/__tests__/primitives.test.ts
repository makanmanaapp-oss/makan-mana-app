import test from "node:test";
import assert from "node:assert/strict";

import { geoProximity, nameSimilarity, normalizeName, buildIdentity } from "../index";

// 10. Geo helper same coordinates.
test("geo same coordinates → very strong", () => {
  const r = geoProximity({ lat: 3.15, lng: 101.7 }, { lat: 3.15, lng: 101.7 });
  assert.equal(r.valid, true);
  assert.equal(r.distanceMeters, 0);
  assert.equal(r.geoSimilarity, 1.0);
});

// 11. Geo helper close coordinates (~7 m).
test("geo close coordinates → very strong", () => {
  const r = geoProximity({ lat: 3.15, lng: 101.7 }, { lat: 3.15005, lng: 101.70005 });
  assert.ok(r.distanceMeters < 15);
  assert.equal(r.geoSimilarity, 1.0);
});

// 12. Geo helper moderate + far distance.
test("geo moderate and far distance", () => {
  const moderate = geoProximity({ lat: 3.15, lng: 101.7 }, { lat: 3.1509, lng: 101.7 });
  assert.ok(moderate.distanceMeters > 50 && moderate.distanceMeters <= 150);
  assert.equal(moderate.geoSimilarity, 0.5);
  const far = geoProximity({ lat: 3.1, lng: 101.6 }, { lat: 3.2, lng: 101.7 });
  assert.ok(far.distanceMeters > 150);
  assert.equal(far.geoSimilarity, 0.15);
});

test("geo invalid coordinates → not valid", () => {
  const r = geoProximity({ lat: undefined, lng: 101.7 }, { lat: 3.15, lng: 101.7 });
  assert.equal(r.valid, false);
  assert.equal(r.geoSimilarity, 0);
});

// 13. Name normalization deterministic + preserves branch text.
test("name normalization deterministic and branch-preserving", () => {
  assert.equal(normalizeName("Restoran Ali (Shah Alam)!"), normalizeName("Restoran Ali (Shah Alam)!"));
  assert.equal(normalizeName("Restoran Ali (Shah Alam)!"), "restoran ali shah alam");
  // Enam contoh mesti kekal berbeza.
  const names = [
    "Restoran Ali Shah Alam",
    "Restoran Ali Bangi",
    "Restoran Ali Cawangan 2",
    "Restoran Ali Express",
    "Ali Cafe",
    "Ali Restaurant",
  ].map(normalizeName);
  const unique = new Set(names);
  assert.equal(unique.size, names.length);
  // Nombor cawangan bermakna kekal.
  assert.match(normalizeName("Restoran Ali Cawangan 2"), /cawangan 2/);
});

// 14. Name similarity deterministic + branch names distinguishable.
test("name similarity deterministic and distinguishes branches", () => {
  const a = normalizeName("Restoran Ali Shah Alam");
  const b = normalizeName("Restoran Ali Bangi");
  assert.equal(nameSimilarity(a, b), nameSimilarity(a, b)); // deterministik
  assert.ok(nameSimilarity(a, b) < 1);
  assert.equal(nameSimilarity(a, a), 1);
});

test("buildIdentity normalizes phone to national digits", () => {
  const idA = buildIdentity({ displayName: "X", phones: ["03-1111 2222"] });
  const idB = buildIdentity({ displayName: "X", phones: ["0311112222"] });
  assert.deepEqual(idA.phoneDigits, idB.phoneDigits);
  assert.deepEqual(idA.phoneDigits, ["311112222"]);
});
