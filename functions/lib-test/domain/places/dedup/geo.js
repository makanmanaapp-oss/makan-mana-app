"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.haversineMeters = haversineMeters;
exports.geoProximity = geoProximity;
/** Phase 1.4 — jarak geo tulen (Haversine) + geoSimilarity. */
const common_1 = require("../common");
const config_1 = require("./config");
function haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6_371_000; // meter
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}
function geoProximity(a, b, thresholds = config_1.GEO_THRESHOLDS) {
    if (a.lat === undefined ||
        a.lng === undefined ||
        b.lat === undefined ||
        b.lng === undefined ||
        !(0, common_1.isValidLatLng)(a.lat, a.lng) ||
        !(0, common_1.isValidLatLng)(b.lat, b.lng)) {
        return { distanceMeters: Infinity, geoSimilarity: config_1.GEO_SIMILARITY.invalid, valid: false };
    }
    const d = haversineMeters(a.lat, a.lng, b.lat, b.lng);
    let sim;
    if (d <= thresholds.veryStrongM)
        sim = config_1.GEO_SIMILARITY.veryStrong;
    else if (d <= thresholds.strongM)
        sim = config_1.GEO_SIMILARITY.strong;
    else if (d <= thresholds.moderateM)
        sim = config_1.GEO_SIMILARITY.moderate;
    else
        sim = config_1.GEO_SIMILARITY.weak;
    return { distanceMeters: Math.round(d * 100) / 100, geoSimilarity: sim, valid: true };
}
