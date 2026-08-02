"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENRICHMENT_FIELD_ALLOWLIST = exports.LOCATION_FRESH_TTL_MS = exports.ENRICHMENT_SCHEMA_VERSION = exports.ENRICHMENT_SOURCE_API = exports.ENRICHMENT_SOURCE = exports.PLACE_DETAILS_FIELD_MASK = void 0;
exports.normalizeName = normalizeName;
exports.displayNamesCompatible = displayNamesCompatible;
exports.providerResponseChecksum = providerResponseChecksum;
exports.mapProviderResponse = mapProviderResponse;
exports.buildEnrichmentFieldUpdate = buildEnrichmentFieldUpdate;
exports.assertFieldsAllowlisted = assertFieldsAllowlisted;
exports.isLocationFresh = isLocationFresh;
exports.mayOverwrite = mayOverwrite;
/**
 * Phase 1.14C.1 — TRUSTED LOCATION ENRICHMENT (domain TULEN, tiada I/O).
 *
 * Memetakan respons Google Places *Details* (New) kepada set medan lokasi
 * dipercayai yang DIBENARKAN sahaja untuk digabung (merge) ke place_details.
 *
 * KESELAMATAN:
 *  - JANGAN percaya koordinat klien (tiada input klien di sini langsung).
 *  - JANGAN guna places_cache sebagai kebenaran satu-tempat.
 *  - JANGAN reka nilai yang tiada — medan hilang kekal null/held.
 *  - Identiti mesti sepadan dengan ID pembekal yang DIMINTA (bukan carian nama).
 *  - Rangkaian + tulisan Firestore hanya dalam scripts/placeLocationEnrichment.ts.
 */
const common_1 = require("../common");
const hashing_1 = require("../staging/hashing");
/** Field mask minimum untuk Place Details (New). */
exports.PLACE_DETAILS_FIELD_MASK = [
    "id",
    "displayName",
    "formattedAddress",
    "location",
    "businessStatus",
    "regularOpeningHours",
    "currentOpeningHours",
    "googleMapsUri",
].join(",");
exports.ENRICHMENT_SOURCE = "google_places_details";
exports.ENRICHMENT_SOURCE_API = "places.googleapis.com/v1/places";
exports.ENRICHMENT_SCHEMA_VERSION = 1;
/** Kesegaran lokasi: 30 hari (kedai jarang berpindah; koordinat stabil). */
exports.LOCATION_FRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * Senarai putih medan yang DIBENARKAN ditulis ke place_details oleh enrichment.
 * Apa-apa medan lain TIDAK boleh disentuh (Part D/J). Cap masa server ditambah
 * oleh CLI (providerFetchedAt, locationVerifiedAt, locationFreshUntil).
 */
exports.ENRICHMENT_FIELD_ALLOWLIST = [
    "location",
    "formattedAddress",
    "businessStatus",
    "regularOpeningHours",
    "currentOpeningHours",
    "googleMapsUri",
    "locationSource",
    "locationSourceApi",
    "locationFieldMask",
    "locationResponseChecksum",
    "enrichmentSchemaVersion",
    "providerFetchedAt",
    "locationVerifiedAt",
    "locationFreshUntil",
];
function str(v) {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}
function num(v) {
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
/** Normalisasi nama untuk semakan cawangan (huruf kecil, alfanumerik sahaja). */
function normalizeName(name) {
    return name
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9 ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
/**
 * Semakan keselamatan cawangan. Kerana kita mengambil mengikut ID pembekal
 * yang TEPAT, identiti sudah dijamin oleh padanan ID; ini pengawal sekunder
 * terhadap tempat yang dinamakan semula/diguna semula secara mengejut.
 * Serasi jika: nama ternormal sama, satu subrentetan yang lain, atau pertindihan
 * token Jaccard >= 0.3. Jika tidak → tahan (BRANCH_MISMATCH).
 */
function displayNamesCompatible(existing, fetched) {
    const a = (0, common_1.isNonEmptyString)(existing) ? normalizeName(existing) : "";
    const b = (0, common_1.isNonEmptyString)(fetched) ? normalizeName(fetched) : "";
    // Tiada nama sedia ada untuk dibandingkan → tidak boleh menolak atas nama.
    if (!a || !b)
        return true;
    if (a === b)
        return true;
    if (a.includes(b) || b.includes(a))
        return true;
    const ta = new Set(a.split(" ").filter(Boolean));
    const tb = new Set(b.split(" ").filter(Boolean));
    let inter = 0;
    for (const t of ta)
        if (tb.has(t))
            inter++;
    const union = new Set([...ta, ...tb]).size;
    return union > 0 && inter / union >= 0.3;
}
/** Cincang respons deterministik untuk idempotensi + pengesahan. */
function providerResponseChecksum(raw) {
    return (0, hashing_1.hashCanonical)({
        id: raw.id ?? null,
        lat: raw.location?.latitude ?? null,
        lng: raw.location?.longitude ?? null,
        addr: str(raw.formattedAddress),
        biz: str(raw.businessStatus),
        uri: str(raw.googleMapsUri),
    });
}
/**
 * Petakan respons pembekal → keputusan enrichment. TULEN: masa disuntik.
 *
 * @param requestedProviderId ID pembekal yang DIMINTA (= place_details doc.id).
 * @param existingDisplayName nama sedia ada dalam place_details (semakan cawangan).
 * @param raw respons mentah pembekal (atau null jika 404/ralat).
 */
function mapProviderResponse(requestedProviderId, existingDisplayName, raw, now, ttlMs = exports.LOCATION_FRESH_TTL_MS) {
    if (!(0, common_1.isNonEmptyString)(requestedProviderId)) {
        return { providerPlaceId: requestedProviderId, fetchClass: "HELD", reason: "empty_provider_id" };
    }
    if (raw == null) {
        return { providerPlaceId: requestedProviderId, fetchClass: "PROVIDER_NOT_FOUND", reason: "no_response" };
    }
    const returnedId = str(raw.id);
    if (returnedId && returnedId !== requestedProviderId) {
        return {
            providerPlaceId: requestedProviderId,
            fetchClass: "ID_MISMATCH",
            reason: "returned_id_differs",
        };
    }
    if (!displayNamesCompatible(existingDisplayName, raw.displayName?.text)) {
        return {
            providerPlaceId: requestedProviderId,
            fetchClass: "BRANCH_MISMATCH",
            reason: "display_name_incompatible",
        };
    }
    const lat = num(raw.location?.latitude);
    const lng = num(raw.location?.longitude);
    if (lat === undefined || lng === undefined || !(0, common_1.isValidLatLng)(lat, lng)) {
        return {
            providerPlaceId: requestedProviderId,
            fetchClass: "LOCATION_MISSING",
            reason: "no_valid_coordinates",
        };
    }
    const enrichment = {
        providerPlaceId: requestedProviderId,
        latitude: lat,
        longitude: lng,
        formattedAddress: str(raw.formattedAddress),
        businessStatus: str(raw.businessStatus),
        regularOpeningHours: raw.regularOpeningHours ?? null,
        currentOpeningHours: raw.currentOpeningHours ?? null,
        googleMapsUri: str(raw.googleMapsUri),
        source: exports.ENRICHMENT_SOURCE,
        sourceApi: exports.ENRICHMENT_SOURCE_API,
        sourceFieldMask: exports.PLACE_DETAILS_FIELD_MASK,
        fetchedAt: now,
        freshUntil: now + ttlMs,
        responseChecksum: providerResponseChecksum(raw),
        schemaVersion: exports.ENRICHMENT_SCHEMA_VERSION,
    };
    return { providerPlaceId: requestedProviderId, fetchClass: "FETCH_READY", enrichment };
}
/**
 * Bina objek medan DIBENARKAN untuk merge ke place_details. Nilai cap masa
 * (providerFetchedAt/locationVerifiedAt/locationFreshUntil) diisi oleh CLI
 * dengan serverTimestamp; di sini kita bawa millis untuk audit tempatan.
 */
function buildEnrichmentFieldUpdate(e) {
    return {
        location: { latitude: e.latitude, longitude: e.longitude },
        formattedAddress: e.formattedAddress,
        businessStatus: e.businessStatus,
        regularOpeningHours: e.regularOpeningHours,
        currentOpeningHours: e.currentOpeningHours,
        googleMapsUri: e.googleMapsUri,
        locationSource: e.source,
        locationSourceApi: e.sourceApi,
        locationFieldMask: e.sourceFieldMask,
        locationResponseChecksum: e.responseChecksum,
        enrichmentSchemaVersion: e.schemaVersion,
    };
}
/** Setiap kunci mesti berada dalam senarai putih (tiada tulisan luar skop). */
function assertFieldsAllowlisted(fields) {
    const allow = new Set(exports.ENRICHMENT_FIELD_ALLOWLIST);
    for (const key of Object.keys(fields)) {
        if (!allow.has(key)) {
            throw new Error(`enrichment field '${key}' is NOT in the write allowlist`);
        }
    }
}
/** Adakah dokumen sedia ada sudah cukup segar → langkau fetch/tulis semula. */
function isLocationFresh(doc, now) {
    if (!doc)
        return false;
    const loc = doc.location;
    const hasCoords = loc !== undefined && (0, common_1.isValidLatLng)(num(loc.latitude), num(loc.longitude));
    const freshUntil = toMillis(doc.locationFreshUntil);
    return hasCoords && freshUntil !== undefined && freshUntil > now;
}
/** Adakah kita boleh menimpa? Hanya jika tiada koordinat sah / tidak segar. */
function mayOverwrite(doc, now) {
    return !isLocationFresh(doc, now);
}
function toMillis(v) {
    if (typeof v === "number" && Number.isFinite(v))
        return v;
    const t = v;
    if (t && typeof t.toMillis === "function")
        return t.toMillis();
    return undefined;
}
