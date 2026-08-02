"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALIAS_CHECK_CODES = void 0;
exports.aliasId = aliasId;
exports.buildAliasProposal = buildAliasProposal;
exports.checkAliasProposal = checkAliasProposal;
exports.buildAliasMap = buildAliasMap;
exports.resolveLegacyPlaceId = resolveLegacyPlaceId;
exports.markAliasRolledBack = markAliasRolledBack;
exports.activateAlias = activateAlias;
exports.aliasProposalsFor = aliasProposalsFor;
/**
 * Phase 1.12 Part D — pengekalan ID legasi melalui alias.
 *
 * Ini adalah bahagian yang menghalang favorites, meals, history, suggestions
 * dan deep link daripada pecah. Setiap ID legasi kekal boleh diselesaikan
 * SELAMANYA; ia tidak pernah dipadam, hanya ditandakan.
 *
 * Menggunakan semula `resolveCanonicalPlaceId` Phase 1.4 supaya hanya ADA SATU
 * pelaksanaan resolusi alias dalam pangkalan kod.
 */
const common_1 = require("../common");
const aliasResolver_1 = require("../dedup/aliasResolver");
const hashing_1 = require("../staging/hashing");
/** ID alias deterministik: jenis + nilai legasi ialah kunci semula jadi. */
function aliasId(aliasType, legacyValue) {
    return `ALS-${(0, hashing_1.hashCanonical)({ aliasType, legacyValue }).slice(0, 24)}`;
}
function buildAliasProposal(input, now) {
    return {
        aliasId: aliasId(input.aliasType, input.legacyValue),
        aliasType: input.aliasType,
        legacyValue: input.legacyValue,
        canonicalPlaceId: input.canonicalPlaceId,
        sourceLegacyRecordId: input.sourceLegacyRecordId,
        createdByMigrationPlanId: input.migrationPlanId,
        status: "proposed",
        createdAt: now,
    };
}
// ---------------------------------------------------------------------------
// Semakan keselamatan alias
// ---------------------------------------------------------------------------
exports.ALIAS_CHECK_CODES = [
    "ok",
    "alias_collision",
    "circular_alias",
    "sibling_branch_target",
    "empty_alias_value",
    "alias_chain_too_long",
];
const OK = { ok: true, code: "ok" };
/**
 * Sahkan cadangan alias terhadap alias yang sedia ada.
 *
 * Peraturan yang dikuatkuasakan:
 * - satu ID legasi menyelesai kepada SATU ID canonical;
 * - alias sedia ada TIDAK PERNAH ditulis ganti secara senyap;
 * - rantaian bulat gagal dengan selamat;
 * - alias tidak boleh menunjuk kepada cawangan adik-beradik.
 */
function checkAliasProposal(proposal, existing, options = {}) {
    if (!(0, common_1.isNonEmptyString)(proposal.legacyValue)) {
        return { ok: false, code: "empty_alias_value" };
    }
    // Perlanggaran: alias aktif/dicadang yang sama menunjuk ke tempat lain.
    const clash = existing.find((a) => a.legacyValue === proposal.legacyValue &&
        a.aliasType === proposal.aliasType &&
        (a.status === "active" || a.status === "proposed") &&
        a.canonicalPlaceId !== proposal.canonicalPlaceId);
    if (clash) {
        return {
            ok: false,
            code: "alias_collision",
            existingCanonicalPlaceId: clash.canonicalPlaceId,
        };
    }
    // Cawangan adik-beradik tidak boleh dijadikan sasaran alias — itulah
    // bagaimana dua cawangan berasingan tersilap digabungkan.
    if (options.siblingBranchIds?.includes(proposal.canonicalPlaceId)) {
        return { ok: false, code: "sibling_branch_target" };
    }
    // Rantaian: simulasi peta alias termasuk cadangan ini.
    const map = buildAliasMap([
        ...existing,
        { ...buildAliasProposal(proposal, 0) },
    ]);
    const resolution = (0, aliasResolver_1.resolveCanonicalPlaceId)(proposal.legacyValue, map, options.maxHops ?? aliasResolver_1.MAX_ALIAS_HOPS);
    if (resolution.status === "circular") {
        return { ok: false, code: "circular_alias" };
    }
    if (resolution.hops > (options.maxHops ?? aliasResolver_1.MAX_ALIAS_HOPS)) {
        return { ok: false, code: "alias_chain_too_long" };
    }
    return OK;
}
/**
 * Bina peta resolusi daripada alias. Hanya alias aktif dan dicadang mengambil
 * bahagian — alias yang dibatalkan (`rolled_back`) sengaja diabaikan supaya
 * rollback benar-benar memulihkan tingkah laku lama.
 */
function buildAliasMap(aliases) {
    const map = new Map();
    for (const alias of aliases) {
        if (alias.status !== "active" && alias.status !== "proposed")
            continue;
        map.set(alias.legacyValue, alias.canonicalPlaceId);
    }
    return map;
}
/**
 * Selesaikan ID legasi kepada canonical. Alias tidak diketahui memulangkan
 * `not_found` yang eksplisit — TIDAK PERNAH menebak.
 */
function resolveLegacyPlaceId(legacyPlaceId, aliases, maxHops = aliasResolver_1.MAX_ALIAS_HOPS) {
    return (0, aliasResolver_1.resolveCanonicalPlaceId)(legacyPlaceId, buildAliasMap(aliases), maxHops);
}
/**
 * Tanda alias sebagai dibatalkan. Alias TIDAK PERNAH dipadam keras — sejarah
 * kekal boleh diaudit dan `resolveLegacyPlaceId` kembali ke `not_found`, yang
 * menyebabkan pembaca jatuh balik ke laluan legasi.
 */
function markAliasRolledBack(alias, now) {
    return { ...alias, status: "rolled_back", supersededAt: now };
}
function activateAlias(alias) {
    return { ...alias, status: "active" };
}
function aliasProposalsFor(identity, canonicalPlaceId, sourceLegacyRecordId, migrationPlanId) {
    const of = (aliasType, values) => values
        .filter(common_1.isNonEmptyString)
        .map((legacyValue) => ({
        aliasType,
        legacyValue,
        canonicalPlaceId,
        sourceLegacyRecordId,
        migrationPlanId,
    }));
    const all = [
        ...of("legacy_document_id", identity.legacyDocumentIds),
        ...of("google_place_id", identity.googlePlaceIds),
        ...of("internal_place_id", identity.internalPlaceIds),
        ...of("deep_link_place_id", identity.deepLinkPlaceIds),
        ...of("provider_place_id", identity.providerPlaceIds),
        ...of("merchant_id", identity.merchantIds),
    ];
    // Nyahduplikasi mengikut (jenis, nilai) dan isih supaya output deterministik.
    const seen = new Set();
    return all
        .filter((p) => {
        const key = `${p.aliasType}|${p.legacyValue}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    })
        .sort((a, b) => `${a.aliasType}|${a.legacyValue}`.localeCompare(`${b.aliasType}|${b.legacyValue}`));
}
