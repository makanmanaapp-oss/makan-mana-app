"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.7 Part R — ujian sel geografi (1-8).
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
// 1. Koordinat sama menghasilkan sel sama.
(0, node_test_1.default)("1. koordinat sama → cellId sama (stabil merentas pengguna)", () => {
    const a = (0, index_1.getCoverageCellId)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng);
    const b = (0, index_1.getCoverageCellId)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng);
    strict_1.default.equal(a, b);
    strict_1.default.equal(a.length, index_1.DEFAULT_CELL_RESOLUTION);
    // ID BUKAN koordinat mentah.
    strict_1.default.equal(a.includes("."), false);
    strict_1.default.equal(a.includes(String(fixtures_1.CENTER.lat)), false);
});
// 2. Koordinat berdekatan diselesaikan secara boleh-diramal.
(0, node_test_1.default)("2. koordinat sangat dekat berkongsi sel; jauh tidak", () => {
    const base = (0, index_1.getCoverageCellId)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng);
    // 10 m ke utara — hampir pasti sel sama pada resolusi 6 (~1.2 km).
    const near = (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 10, 0);
    strict_1.default.equal((0, index_1.getCoverageCellId)(near.lat, near.lng), base);
    // 50 km ke utara — mesti sel berbeza.
    const far = (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 50_000, 0);
    strict_1.default.notEqual((0, index_1.getCoverageCellId)(far.lat, far.lng), base);
});
(0, node_test_1.default)("2b. resolusi berbeza menghasilkan ID berbeza panjang", () => {
    strict_1.default.equal((0, index_1.getCoverageCellId)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng, 4).length, 4);
    strict_1.default.equal((0, index_1.getCoverageCellId)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng, 8).length, 8);
    // Prefix konsisten: resolusi kasar ialah awalan resolusi halus.
    const fine = (0, index_1.getCoverageCellId)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng, 8);
    strict_1.default.equal(fine.startsWith((0, index_1.getCoverageCellId)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng, 4)), true);
});
// 3. Latitud tidak sah GAGAL.
(0, node_test_1.default)("3. latitud tidak sah melempar", () => {
    strict_1.default.throws(() => (0, index_1.getCoverageCellId)(91, 101), index_1.InvalidCoordinateError);
    strict_1.default.throws(() => (0, index_1.getCoverageCellId)(-90.001, 101), index_1.InvalidCoordinateError);
    strict_1.default.throws(() => (0, index_1.getCoverageCellId)(NaN, 101), index_1.InvalidCoordinateError);
});
// 4. Longitud tidak sah GAGAL.
(0, node_test_1.default)("4. longitud tidak sah melempar", () => {
    strict_1.default.throws(() => (0, index_1.getCoverageCellId)(3, 181), index_1.InvalidCoordinateError);
    strict_1.default.throws(() => (0, index_1.getCoverageCellId)(3, -180.5), index_1.InvalidCoordinateError);
    strict_1.default.throws(() => (0, index_1.getCoverageCellId)(3, Infinity), index_1.InvalidCoordinateError);
});
(0, node_test_1.default)("4b. cellId tidak sah melempar semasa nyahkod", () => {
    strict_1.default.throws(() => (0, index_1.getCoverageCellBounds)("ail"), index_1.InvalidCellIdError); // a,i,l bukan base32
    strict_1.default.throws(() => (0, index_1.getCoverageCellBounds)(""), index_1.InvalidCellIdError);
    strict_1.default.throws(() => (0, index_1.getCoverageCellCenter)("!!!"), index_1.InvalidCellIdError);
});
// 5. Sel jiran DETERMINISTIK.
(0, node_test_1.default)("5. senarai jiran deterministik (susunan & kandungan sama)", () => {
    const cell = (0, index_1.getCoverageCellId)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng);
    const a = (0, index_1.getNeighboringCoverageCells)(cell);
    const b = (0, index_1.getNeighboringCoverageCells)(cell);
    strict_1.default.deepEqual(a, b);
});
// 6. Senarai jiran TERBATAS.
(0, node_test_1.default)("6. jiran terbatas kepada 8 dan tidak termasuk sel pusat", () => {
    const cell = (0, index_1.getCoverageCellId)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng);
    const n = (0, index_1.getNeighboringCoverageCells)(cell);
    strict_1.default.ok(n.length <= 8, `dapat ${n.length}`);
    strict_1.default.equal(n.includes(cell), false, "sel pusat DIKECUALIKAN secara konsisten");
    strict_1.default.equal(new Set(n).size, n.length, "tiada pendua");
});
(0, node_test_1.default)("6b. jiran di kutub kekal sah dan terbatas", () => {
    const north = (0, index_1.getCoverageCellId)(89.9, 0, 4);
    const n = (0, index_1.getNeighboringCoverageCells)(north);
    strict_1.default.ok(n.length <= 8);
    strict_1.default.equal(new Set(n).size, n.length);
    for (const c of n)
        strict_1.default.doesNotThrow(() => (0, index_1.getCoverageCellBounds)(c));
});
(0, node_test_1.default)("6c. jiran merentas antimeridian kekal sah", () => {
    const edge = (0, index_1.getCoverageCellId)(0, 179.99, 4);
    const n = (0, index_1.getNeighboringCoverageCells)(edge);
    strict_1.default.ok(n.length <= 8);
    for (const c of n)
        strict_1.default.doesNotThrow(() => (0, index_1.getCoverageCellBounds)(c));
});
// 7. Satu sel rumah diberikan.
(0, node_test_1.default)("7. satu sel rumah untuk satu koordinat", () => {
    const home = (0, index_1.getCoverageCellId)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng);
    const bounds = (0, index_1.getCoverageCellBounds)(home);
    strict_1.default.ok(fixtures_1.CENTER.lat >= bounds.minLat && fixtures_1.CENTER.lat <= bounds.maxLat);
    strict_1.default.ok(fixtures_1.CENTER.lng >= bounds.minLng && fixtures_1.CENTER.lng <= bounds.maxLng);
    const center = (0, index_1.getCoverageCellCenter)(home);
    strict_1.default.ok(Math.abs(center.lat - fixtures_1.CENTER.lat) < 0.02);
    strict_1.default.ok(Math.abs(center.lng - fixtures_1.CENTER.lng) < 0.02);
});
// 8. Sel boleh-cari tiada pendua.
(0, node_test_1.default)("8. sel boleh-cari = pusat + jiran, tiada pendua, pusat dahulu", () => {
    const home = (0, index_1.getCoverageCellId)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng);
    const searchable = (0, index_1.getSearchableCellIds)(home);
    strict_1.default.equal(searchable[0], home, "pusat DAHULU");
    strict_1.default.equal(new Set(searchable).size, searchable.length, "tiada pendua");
    strict_1.default.ok(searchable.length <= 9);
});
(0, node_test_1.default)("8b. koordinat sempadan menyertakan jiran yang meliputi radius", () => {
    const bounds = (0, index_1.getCoverageCellBounds)((0, index_1.getCoverageCellId)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng));
    // Titik betul-betul di tepi timur sel.
    const edgeLng = bounds.maxLng - 1e-9;
    const edgeCell = (0, index_1.getCoverageCellId)(fixtures_1.CENTER.lat, edgeLng);
    const searchable = (0, index_1.getSearchableCellIds)(edgeCell);
    // Sel di seberang sempadan timur mesti berada dalam senarai boleh-cari.
    const acrossCell = (0, index_1.getCoverageCellId)(fixtures_1.CENTER.lat, bounds.maxLng + 1e-6);
    strict_1.default.ok(searchable.includes(acrossCell), "sel merentas sempadan mesti boleh dicari");
});
(0, node_test_1.default)("resolusi dipilih supaya cincin 3x3 meliputi radius", () => {
    // Radius kecil boleh guna resolusi halus.
    strict_1.default.equal((0, index_1.resolutionForRadius)(300, 6), 6);
    // Radius besar mesti turun ke resolusi lebih kasar.
    strict_1.default.ok((0, index_1.resolutionForRadius)(10_000, 6) < 6);
});
(0, node_test_1.default)("getQueryCellIds terbatas dan deterministik", () => {
    const a = (0, index_1.getQueryCellIds)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng, 1000);
    const b = (0, index_1.getQueryCellIds)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng, 1000);
    strict_1.default.deepEqual(a.cellIds, b.cellIds);
    strict_1.default.ok(a.cellIds.length <= index_1.MAX_QUERIED_CELLS);
    strict_1.default.equal(a.cellIds[0], a.centerCellId);
    strict_1.default.equal(new Set(a.cellIds).size, a.cellIds.length);
});
