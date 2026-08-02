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
import { EpochMillis, isNonEmptyString } from "../common";
import { AliasResolution, MAX_ALIAS_HOPS, resolveCanonicalPlaceId } from "../dedup/aliasResolver";
import { hashCanonical } from "../staging/hashing";
import { AliasStatus, AliasType } from "./migrationTypes";

export interface LegacyAliasMapping {
  aliasId: string;
  aliasType: AliasType;
  /** Nilai ID legasi sebenar (kunci resolusi). */
  legacyValue: string;
  canonicalPlaceId: string;
  sourceLegacyRecordId: string;
  createdByMigrationPlanId: string;
  status: AliasStatus;
  createdAt: EpochMillis;
  supersededAt?: EpochMillis;
}

export interface AliasProposalInput {
  aliasType: AliasType;
  legacyValue: string;
  canonicalPlaceId: string;
  sourceLegacyRecordId: string;
  migrationPlanId: string;
}

/** ID alias deterministik: jenis + nilai legasi ialah kunci semula jadi. */
export function aliasId(aliasType: AliasType, legacyValue: string): string {
  return `ALS-${hashCanonical({ aliasType, legacyValue }).slice(0, 24)}`;
}

export function buildAliasProposal(
  input: AliasProposalInput,
  now: EpochMillis,
): LegacyAliasMapping {
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

export const ALIAS_CHECK_CODES = [
  "ok",
  "alias_collision",
  "circular_alias",
  "sibling_branch_target",
  "empty_alias_value",
  "alias_chain_too_long",
] as const;
export type AliasCheckCode = (typeof ALIAS_CHECK_CODES)[number];

export interface AliasCheckResult {
  ok: boolean;
  code: AliasCheckCode;
  /** Nilai canonical sedia ada apabila perlanggaran dikesan. */
  existingCanonicalPlaceId?: string;
}

const OK: AliasCheckResult = { ok: true, code: "ok" };

/**
 * Sahkan cadangan alias terhadap alias yang sedia ada.
 *
 * Peraturan yang dikuatkuasakan:
 * - satu ID legasi menyelesai kepada SATU ID canonical;
 * - alias sedia ada TIDAK PERNAH ditulis ganti secara senyap;
 * - rantaian bulat gagal dengan selamat;
 * - alias tidak boleh menunjuk kepada cawangan adik-beradik.
 */
export function checkAliasProposal(
  proposal: AliasProposalInput,
  existing: readonly LegacyAliasMapping[],
  options: {
    /** ID canonical yang merupakan cawangan berasingan bagi sasaran. */
    siblingBranchIds?: readonly string[];
    maxHops?: number;
  } = {},
): AliasCheckResult {
  if (!isNonEmptyString(proposal.legacyValue)) {
    return { ok: false, code: "empty_alias_value" };
  }

  // Perlanggaran: alias aktif/dicadang yang sama menunjuk ke tempat lain.
  const clash = existing.find(
    (a) =>
      a.legacyValue === proposal.legacyValue &&
      a.aliasType === proposal.aliasType &&
      (a.status === "active" || a.status === "proposed") &&
      a.canonicalPlaceId !== proposal.canonicalPlaceId,
  );
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
  const resolution = resolveCanonicalPlaceId(
    proposal.legacyValue,
    map,
    options.maxHops ?? MAX_ALIAS_HOPS,
  );
  if (resolution.status === "circular") {
    return { ok: false, code: "circular_alias" };
  }
  if (resolution.hops > (options.maxHops ?? MAX_ALIAS_HOPS)) {
    return { ok: false, code: "alias_chain_too_long" };
  }

  return OK;
}

/**
 * Bina peta resolusi daripada alias. Hanya alias aktif dan dicadang mengambil
 * bahagian — alias yang dibatalkan (`rolled_back`) sengaja diabaikan supaya
 * rollback benar-benar memulihkan tingkah laku lama.
 */
export function buildAliasMap(
  aliases: readonly LegacyAliasMapping[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const alias of aliases) {
    if (alias.status !== "active" && alias.status !== "proposed") continue;
    map.set(alias.legacyValue, alias.canonicalPlaceId);
  }
  return map;
}

/**
 * Selesaikan ID legasi kepada canonical. Alias tidak diketahui memulangkan
 * `not_found` yang eksplisit — TIDAK PERNAH menebak.
 */
export function resolveLegacyPlaceId(
  legacyPlaceId: string,
  aliases: readonly LegacyAliasMapping[],
  maxHops: number = MAX_ALIAS_HOPS,
): AliasResolution {
  return resolveCanonicalPlaceId(legacyPlaceId, buildAliasMap(aliases), maxHops);
}

/**
 * Tanda alias sebagai dibatalkan. Alias TIDAK PERNAH dipadam keras — sejarah
 * kekal boleh diaudit dan `resolveLegacyPlaceId` kembali ke `not_found`, yang
 * menyebabkan pembaca jatuh balik ke laluan legasi.
 */
export function markAliasRolledBack(
  alias: LegacyAliasMapping,
  now: EpochMillis,
): LegacyAliasMapping {
  return { ...alias, status: "rolled_back", supersededAt: now };
}

export function activateAlias(
  alias: LegacyAliasMapping,
): LegacyAliasMapping {
  return { ...alias, status: "active" };
}

/**
 * Semua nilai ID yang MESTI dikekalkan sebagai alias bagi satu identiti.
 * Ini adalah senarai lengkap yang dituntut oleh Part D.
 */
export interface LegacyIdentitySet {
  legacyDocumentIds: readonly string[];
  googlePlaceIds: readonly string[];
  internalPlaceIds: readonly string[];
  deepLinkPlaceIds: readonly string[];
  providerPlaceIds: readonly string[];
  merchantIds: readonly string[];
}

export function aliasProposalsFor(
  identity: LegacyIdentitySet,
  canonicalPlaceId: string,
  sourceLegacyRecordId: string,
  migrationPlanId: string,
): AliasProposalInput[] {
  const of = (aliasType: AliasType, values: readonly string[]) =>
    values
      .filter(isNonEmptyString)
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
  const seen = new Set<string>();
  return all
    .filter((p) => {
      const key = `${p.aliasType}|${p.legacyValue}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) =>
      `${a.aliasType}|${a.legacyValue}`.localeCompare(
        `${b.aliasType}|${b.legacyValue}`,
      ),
    );
}
