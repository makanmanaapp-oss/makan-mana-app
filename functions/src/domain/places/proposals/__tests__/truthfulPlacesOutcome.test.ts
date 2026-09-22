import {strict as assert} from "node:assert";
import {readdirSync, readFileSync, statSync} from "node:fs";
import {join, relative, resolve} from "node:path";
import {test} from "node:test";

import {DUMMY_PLACES} from "../../../../data/dummyPlaces";
import type {PlaceCandidate} from "../../../../types/place";
import {truthfulPlacesOutcome} from "../truthfulPlacesOutcome";

/**
 * WAVE 3F — CADANGAN gantian jujur untuk DUMMY_PLACES. TIDAK DIDAWAI.
 *
 * Ujian ini menerangkan tingkah laku yang DICADANGKAN. Ia tidak menguji kod
 * produksi, dan ujian terakhir menegaskan cadangan ini kekal terasing.
 */

function place(id: string): PlaceCandidate {
  return {
    placeId: id, name: `Tempat ${id}`, cuisine: "Melayu", emoji: "🍛", rating: 4,
    userRatingCount: 10, priceLevel: 1, distanceKm: 0.5, isOpen: true,
    address: "alamat", matchScore: 0, matchReasonKeys: [], priceEstimate: "RM5 - RM10",
  };
}

test("calon sebenar diteruskan tanpa diubah", () => {
  const places = [place("ChIJ_a"), place("ChIJ_b")];
  const out = truthfulPlacesOutcome({apiKeyPresent: true, candidates: places});
  assert.equal(out.status, "OK");
  assert.deepEqual(out.places, places);
});

test("kawasan tanpa hasil -> OK_EMPTY, bukan tempat rekaan", () => {
  for (const candidates of [[], null, undefined]) {
    const out = truthfulPlacesOutcome({apiKeyPresent: true, candidates});
    assert.equal(out.status, "OK_EMPTY");
    assert.deepEqual(out.places, []);
  }
});

test("ralat pembekal -> PLACES_UNAVAILABLE, boleh dicuba semula", () => {
  const out = truthfulPlacesOutcome({apiKeyPresent: true, providerError: true});
  assert.equal(out.status, "PLACES_UNAVAILABLE");
  assert.equal(out.status === "PLACES_UNAVAILABLE" && out.retryable, true);
  assert.equal(out.status === "PLACES_UNAVAILABLE" && out.reason, "provider_error");
  assert.deepEqual(out.places, []);
});

test("kunci tiada -> PLACES_UNAVAILABLE, salah konfigurasi, tidak dicuba semula", () => {
  const out = truthfulPlacesOutcome({apiKeyPresent: false, candidates: [place("ChIJ_a")]});
  assert.equal(out.status, "PLACES_UNAVAILABLE");
  assert.equal(out.status === "PLACES_UNAVAILABLE" && out.reason, "not_configured");
  assert.equal(out.status === "PLACES_UNAVAILABLE" && out.retryable, false);
});

test("TIADA hasil yang pernah mengandungi DUMMY_PLACES", () => {
  // Walaupun dummy lama mengalir masuk melalui cache, ia ditapis keluar.
  const mixed = [...DUMMY_PLACES, place("ChIJ_real")];
  const out = truthfulPlacesOutcome({apiKeyPresent: true, candidates: mixed});
  assert.deepEqual(out.places.map((p) => p.placeId), ["ChIJ_real"]);
  const onlyDummy = truthfulPlacesOutcome({apiKeyPresent: true, candidates: DUMMY_PLACES});
  assert.equal(onlyDummy.status, "OK_EMPTY");
});

test("cadangan ini TIDAK diimport oleh mana-mana kod produksi", () => {
  // Mendawainya ialah perubahan tingkah laku produksi yang memerlukan
  // kelulusan pemilik. Ujian ini menghalangnya daripada didawai secara senyap.
  const src = resolve(process.cwd(), "src");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return name === "__tests__" ? [] : walk(full);
      return name.endsWith(".ts") ? [full] : [];
    });
  const importers = walk(src)
    .filter((f) => !f.includes(join("domain", "places", "proposals")))
    .filter((f) => /truthfulPlacesOutcome|places\/proposals/.test(readFileSync(f, "utf8")))
    .map((f) => relative(process.cwd(), f));
  assert.deepEqual(importers, []);
});
