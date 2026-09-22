import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {test} from "node:test";

import {DUMMY_PLACES} from "../../../data/dummyPlaces";
import {
  isFictionalPlaceId,
  isLearningEligiblePlaceId,
  isQaSyntheticPlaceId,
  isRealPlaceId,
  withoutFictionalPlaces,
} from "../realPlaceIdentity";
import {
  PLACES_STATUS_EMPTY,
  PLACES_STATUS_OK,
  PLACES_STATUS_UNAVAILABLE,
  placesOutcomeWireFields,
  truthfulPlacesOutcome,
} from "../truthfulPlacesOutcome";
import type {PlaceCandidate} from "../../../types/place";

/**
 * WAVE 4A — hasil tempat yang JUJUR (kelulusan pemilik).
 *
 * Sehingga Wave 3F, sepuluh restoran REKAAN dipaparkan kepada pengguna
 * produksi apabila Places gagal, apabila kunci API hilang, atau apabila
 * kawasan tiada hasil. Ujian ini mengunci gantiannya.
 */

function place(id: string): PlaceCandidate {
  return {
    placeId: id, name: `Tempat ${id}`, cuisine: "Melayu", emoji: "🍛", rating: 4,
    userRatingCount: 10, priceLevel: 1, distanceKm: 0.5, isOpen: true,
    address: "alamat", matchScore: 0, matchReasonKeys: [], priceEstimate: "RM5 - RM10",
  };
}

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

// ---------------------------------------------------------------------------
// Identiti
// ---------------------------------------------------------------------------

test("ID rekaan, sintetik dan sebenar dibezakan", () => {
  assert.equal(isFictionalPlaceId("dummy_nasi_lemak_bonda"), true);
  assert.equal(isFictionalPlaceId("ChIJ_sebenar"), false);
  assert.equal(isQaSyntheticPlaceId("qa_synthetic_01"), true);
  assert.equal(isRealPlaceId("ChIJ_sebenar"), true);
  assert.equal(isRealPlaceId("dummy_x"), false);
  assert.equal(isRealPlaceId("qa_synthetic_01"), false);
  // Ketiadaan ID bukan tempat sebenar.
  assert.equal(isRealPlaceId(null), false);
  assert.equal(isRealPlaceId(""), false);
  assert.equal(isRealPlaceId(undefined), false);
});

test("SETIAP DUMMY_PLACES dikenal pasti sebagai rekaan", () => {
  assert.ok(DUMMY_PLACES.length >= 10);
  for (const p of DUMMY_PLACES) {
    assert.equal(isFictionalPlaceId(p.placeId), true, p.placeId);
    assert.equal(isLearningEligiblePlaceId(p.placeId), false, p.placeId);
  }
  assert.deepEqual(withoutFictionalPlaces(DUMMY_PLACES), []);
});

test("penapis rekaan mengekalkan tempat sebenar mengikut susunan", () => {
  const mixed = [place("ChIJ_a"), ...DUMMY_PLACES, place("ChIJ_b")];
  assert.deepEqual(
    withoutFictionalPlaces(mixed).map((p) => p.placeId),
    ["ChIJ_a", "ChIJ_b"],
  );
  assert.deepEqual(withoutFictionalPlaces(null), []);
});

// ---------------------------------------------------------------------------
// Hasil
// ---------------------------------------------------------------------------

test("calon sebenar diteruskan tanpa diubah", () => {
  const places = [place("ChIJ_a"), place("ChIJ_b")];
  const out = truthfulPlacesOutcome({apiKeyPresent: true, candidates: places});
  assert.equal(out.status, PLACES_STATUS_OK);
  assert.deepEqual(out.places, places);
});

test("kawasan tanpa hasil -> OK_EMPTY, bukan gangguan dan bukan tempat rekaan", () => {
  for (const candidates of [[], null, undefined]) {
    const out = truthfulPlacesOutcome({apiKeyPresent: true, candidates});
    assert.equal(out.status, PLACES_STATUS_EMPTY);
    assert.deepEqual(out.places, []);
    assert.equal(out.status === PLACES_STATUS_EMPTY && out.retryable, false);
  }
});

test("ralat pembekal (termasuk had masa) -> UNAVAILABLE boleh dicuba semula", () => {
  const out = truthfulPlacesOutcome({apiKeyPresent: true, providerError: true});
  assert.equal(out.status, PLACES_STATUS_UNAVAILABLE);
  assert.equal(out.status === PLACES_STATUS_UNAVAILABLE && out.retryable, true);
  assert.equal(out.status === PLACES_STATUS_UNAVAILABLE && out.reason, "provider_error");
});

test("had masa TIDAK dilaporkan sebagai kawasan kosong", () => {
  // Pembekal melontar -> senarai calon kosong. Tanpa bendera providerError,
  // itu tidak boleh dibezakan daripada kawasan kosong sebenar.
  const timeout = truthfulPlacesOutcome({
    apiKeyPresent: true, providerError: true, candidates: [],
  });
  assert.equal(timeout.status, PLACES_STATUS_UNAVAILABLE);
  const genuinelyEmpty = truthfulPlacesOutcome({apiKeyPresent: true, candidates: []});
  assert.equal(genuinelyEmpty.status, PLACES_STATUS_EMPTY);
  assert.notEqual(timeout.status, genuinelyEmpty.status);
});

test("kunci hilang -> UNAVAILABLE, salah konfigurasi, tidak dicuba semula", () => {
  const out = truthfulPlacesOutcome({
    apiKeyPresent: false, candidates: [place("ChIJ_a")],
  });
  assert.equal(out.status, PLACES_STATUS_UNAVAILABLE);
  assert.equal(out.status === PLACES_STATUS_UNAVAILABLE && out.reason, "not_configured");
  assert.equal(out.status === PLACES_STATUS_UNAVAILABLE && out.retryable, false);
});

test("TIADA hasil yang pernah mengandungi DUMMY_PLACES", () => {
  const mixed = [...DUMMY_PLACES, place("ChIJ_real")];
  const out = truthfulPlacesOutcome({apiKeyPresent: true, candidates: mixed});
  assert.deepEqual(out.places.map((p) => p.placeId), ["ChIJ_real"]);
  const onlyDummy = truthfulPlacesOutcome({apiKeyPresent: true, candidates: DUMMY_PLACES});
  assert.equal(onlyDummy.status, PLACES_STATUS_EMPTY);
});

test("medan wayar tidak mendedahkan diagnostik dalaman", () => {
  const notConfigured = placesOutcomeWireFields(
    truthfulPlacesOutcome({apiKeyPresent: false}),
  );
  assert.deepEqual(Object.keys(notConfigured).sort(), ["places", "reason", "retryable", "status"]);
  assert.equal(notConfigured.reason, "not_configured");
  // Sebab ialah enum tertutup — tiada mesej pembekal, tiada nama kunci.
  assert.ok(["provider_error", "not_configured"].includes(notConfigured.reason!));
  const ok = placesOutcomeWireFields(
    truthfulPlacesOutcome({apiKeyPresent: true, candidates: [place("ChIJ_a")]}),
  );
  assert.deepEqual(Object.keys(ok).sort(), ["places", "status"]);
});

// ---------------------------------------------------------------------------
// Pendawaian — 7 tapak pelayan daripada audit Wave 3F
// ---------------------------------------------------------------------------

test("getNearbyPlaces dan getSuggestions TIDAK LAGI mengimport DUMMY_PLACES", () => {
  for (const file of ["src/callable/getNearbyPlaces.ts", "src/callable/getSuggestions.ts"]) {
    const text = source(file);
    assert.equal(/DUMMY_PLACES/.test(text), false, `${file} masih merujuk DUMMY_PLACES`);
    assert.ok(/truthfulPlacesOutcome/.test(text), `${file} tidak menggunakan hasil jujur`);
  }
});

test("submitFeedback menolak tempat bukan-sebenar dan tidak mencari nama rekaan", () => {
  const text = source("src/callable/submitFeedback.ts");
  assert.equal(/DUMMY_PLACES/.test(text), false);
  assert.ok(/isRealPlaceId\(placeId\)/.test(text));
  // Pagar mesti mendahului SEBARANG tulisan.
  const guard = text.indexOf("isRealPlaceId(placeId)");
  const firstWrite = text.indexOf(".set(");
  const firstAdd = text.indexOf(".add(");
  assert.ok(guard > 0 && guard < firstWrite, "pagar selepas tulisan pertama");
  assert.ok(guard < firstAdd, "pagar selepas add pertama");
});

test("Home/Spin: cabang sintetik mendahului SEBARANG laluan Places", () => {
  const text = source("src/callable/getSuggestions.ts");
  const synthetic = text.indexOf("decideSyntheticPlaces({env: process.env})");
  const apiKeyBranch = text.indexOf("} else if (apiKey) {");
  const firstProviderCall = Math.min(
    ...["searchNearby(", "getExpandedPool(", "getAreaCandidatePool("]
      .map((needle) => text.indexOf(needle))
      .filter((i) => i > 0),
  );
  assert.ok(synthetic > 0, "getSuggestions tiada cabang sintetik");
  assert.ok(synthetic < apiKeyBranch, "cabang sintetik selepas cabang apiKey");
  assert.ok(synthetic < firstProviderCall, "cabang sintetik selepas panggilan pembekal");
});

test("sesi tersimpan tidak pernah menyajikan semula tempat rekaan", () => {
  const text = source("src/services/algorithm2SessionService.ts");
  assert.ok(/isFictionalPlaceId\(id\)/.test(text));
});

test("spin yang tidak berhasil memulangkan kuota yang ditempah", () => {
  const text = source("src/callable/getSuggestions.ts");
  assert.ok(/releaseSpin\(uid\)/.test(text));
  const release = text.indexOf("releaseSpin(uid)");
  const noPlacesLog = text.indexOf("getSuggestions.noPlaces");
  assert.ok(release > 0 && release < noPlacesLog);
});
