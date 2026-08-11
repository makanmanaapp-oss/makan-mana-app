/**
 * Phase 1.7 Part R — ujian sel geografi (1-8).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_CELL_RESOLUTION,
  InvalidCellIdError,
  InvalidCoordinateError,
  MAX_QUERIED_CELLS,
  getCoverageCellBounds,
  getCoverageCellCenter,
  getCoverageCellId,
  getNeighboringCoverageCells,
  getQueryCellIds,
  getSearchableCellIds,
  resolutionForRadius,
} from "../index";
import { CENTER, offsetMeters } from "./fixtures";

// 1. Koordinat sama menghasilkan sel sama.
test("1. koordinat sama → cellId sama (stabil merentas pengguna)", () => {
  const a = getCoverageCellId(CENTER.lat, CENTER.lng);
  const b = getCoverageCellId(CENTER.lat, CENTER.lng);
  assert.equal(a, b);
  assert.equal(a.length, DEFAULT_CELL_RESOLUTION);
  // ID BUKAN koordinat mentah.
  assert.equal(a.includes("."), false);
  assert.equal(a.includes(String(CENTER.lat)), false);
});

// 2. Koordinat berdekatan diselesaikan secara boleh-diramal.
test("2. koordinat sangat dekat berkongsi sel; jauh tidak", () => {
  const base = getCoverageCellId(CENTER.lat, CENTER.lng);
  // 10 m ke utara — hampir pasti sel sama pada resolusi 6 (~1.2 km).
  const near = offsetMeters(CENTER, 10, 0);
  assert.equal(getCoverageCellId(near.lat, near.lng), base);
  // 50 km ke utara — mesti sel berbeza.
  const far = offsetMeters(CENTER, 50_000, 0);
  assert.notEqual(getCoverageCellId(far.lat, far.lng), base);
});

test("2b. resolusi berbeza menghasilkan ID berbeza panjang", () => {
  assert.equal(getCoverageCellId(CENTER.lat, CENTER.lng, 4).length, 4);
  assert.equal(getCoverageCellId(CENTER.lat, CENTER.lng, 8).length, 8);
  // Prefix konsisten: resolusi kasar ialah awalan resolusi halus.
  const fine = getCoverageCellId(CENTER.lat, CENTER.lng, 8);
  assert.equal(fine.startsWith(getCoverageCellId(CENTER.lat, CENTER.lng, 4)), true);
});

// 3. Latitud tidak sah GAGAL.
test("3. latitud tidak sah melempar", () => {
  assert.throws(() => getCoverageCellId(91, 101), InvalidCoordinateError);
  assert.throws(() => getCoverageCellId(-90.001, 101), InvalidCoordinateError);
  assert.throws(() => getCoverageCellId(NaN, 101), InvalidCoordinateError);
});

// 4. Longitud tidak sah GAGAL.
test("4. longitud tidak sah melempar", () => {
  assert.throws(() => getCoverageCellId(3, 181), InvalidCoordinateError);
  assert.throws(() => getCoverageCellId(3, -180.5), InvalidCoordinateError);
  assert.throws(() => getCoverageCellId(3, Infinity), InvalidCoordinateError);
});

test("4b. cellId tidak sah melempar semasa nyahkod", () => {
  assert.throws(() => getCoverageCellBounds("ail"), InvalidCellIdError); // a,i,l bukan base32
  assert.throws(() => getCoverageCellBounds(""), InvalidCellIdError);
  assert.throws(() => getCoverageCellCenter("!!!"), InvalidCellIdError);
});

// 5. Sel jiran DETERMINISTIK.
test("5. senarai jiran deterministik (susunan & kandungan sama)", () => {
  const cell = getCoverageCellId(CENTER.lat, CENTER.lng);
  const a = getNeighboringCoverageCells(cell);
  const b = getNeighboringCoverageCells(cell);
  assert.deepEqual(a, b);
});

// 6. Senarai jiran TERBATAS.
test("6. jiran terbatas kepada 8 dan tidak termasuk sel pusat", () => {
  const cell = getCoverageCellId(CENTER.lat, CENTER.lng);
  const n = getNeighboringCoverageCells(cell);
  assert.ok(n.length <= 8, `dapat ${n.length}`);
  assert.equal(n.includes(cell), false, "sel pusat DIKECUALIKAN secara konsisten");
  assert.equal(new Set(n).size, n.length, "tiada pendua");
});

test("6b. jiran di kutub kekal sah dan terbatas", () => {
  const north = getCoverageCellId(89.9, 0, 4);
  const n = getNeighboringCoverageCells(north);
  assert.ok(n.length <= 8);
  assert.equal(new Set(n).size, n.length);
  for (const c of n) assert.doesNotThrow(() => getCoverageCellBounds(c));
});

test("6c. jiran merentas antimeridian kekal sah", () => {
  const edge = getCoverageCellId(0, 179.99, 4);
  const n = getNeighboringCoverageCells(edge);
  assert.ok(n.length <= 8);
  for (const c of n) assert.doesNotThrow(() => getCoverageCellBounds(c));
});

// 7. Satu sel rumah diberikan.
test("7. satu sel rumah untuk satu koordinat", () => {
  const home = getCoverageCellId(CENTER.lat, CENTER.lng);
  const bounds = getCoverageCellBounds(home);
  assert.ok(CENTER.lat >= bounds.minLat && CENTER.lat <= bounds.maxLat);
  assert.ok(CENTER.lng >= bounds.minLng && CENTER.lng <= bounds.maxLng);
  const center = getCoverageCellCenter(home);
  assert.ok(Math.abs(center.lat - CENTER.lat) < 0.02);
  assert.ok(Math.abs(center.lng - CENTER.lng) < 0.02);
});

// 8. Sel boleh-cari tiada pendua.
test("8. sel boleh-cari = pusat + jiran, tiada pendua, pusat dahulu", () => {
  const home = getCoverageCellId(CENTER.lat, CENTER.lng);
  const searchable = getSearchableCellIds(home);
  assert.equal(searchable[0], home, "pusat DAHULU");
  assert.equal(new Set(searchable).size, searchable.length, "tiada pendua");
  assert.ok(searchable.length <= 9);
});

test("8b. koordinat sempadan menyertakan jiran yang meliputi radius", () => {
  const bounds = getCoverageCellBounds(getCoverageCellId(CENTER.lat, CENTER.lng));
  // Titik betul-betul di tepi timur sel.
  const edgeLng = bounds.maxLng - 1e-9;
  const edgeCell = getCoverageCellId(CENTER.lat, edgeLng);
  const searchable = getSearchableCellIds(edgeCell);
  // Sel di seberang sempadan timur mesti berada dalam senarai boleh-cari.
  const acrossCell = getCoverageCellId(CENTER.lat, bounds.maxLng + 1e-6);
  assert.ok(
    searchable.includes(acrossCell),
    "sel merentas sempadan mesti boleh dicari",
  );
});

test("resolusi dipilih supaya cincin 3x3 meliputi radius", () => {
  // Radius kecil boleh guna resolusi halus.
  assert.equal(resolutionForRadius(300, 6), 6);
  // Radius besar mesti turun ke resolusi lebih kasar.
  assert.ok(resolutionForRadius(10_000, 6) < 6);
});

test("getQueryCellIds terbatas dan deterministik", () => {
  const a = getQueryCellIds(CENTER.lat, CENTER.lng, 1000);
  const b = getQueryCellIds(CENTER.lat, CENTER.lng, 1000);
  assert.deepEqual(a.cellIds, b.cellIds);
  assert.ok(a.cellIds.length <= MAX_QUERIED_CELLS);
  assert.equal(a.cellIds[0], a.centerCellId);
  assert.equal(new Set(a.cellIds).size, a.cellIds.length);
});
