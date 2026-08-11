/**
 * Phase 1.12 Part C + G — calon migrasi dan sebab tahan.
 *
 * Calon dibina secara deterministik daripada inventori. Apa-apa yang samar
 * DITAHAN, bukan diteka. Padanan nama-sahaja adalah sebab tahan yang keras:
 * "Restoran Ali" di Shah Alam dan "Restoran Ali" di Bangi adalah dua kedai.
 */
import { EpochMillis, isNonEmptyString, isValidLatLng } from "../common";
import { BranchAssessment, assessBranch } from "../dedup/branchDetection";
import { DEFAULT_DEDUP_CONFIG, DedupConfig } from "../dedup/config";
import { NormalizedIdentity, buildIdentity } from "../dedup/identityNormalizer";
import { DuplicateSignalSet, computeSignals } from "../dedup/duplicateSignals";
import { hashCanonical } from "../staging/hashing";
import { LegacyPlaceInventoryRecord } from "./legacyInventory";
import { LegacyIdentitySet } from "./migrationAlias";
import { LegacyPlaceReferenceImpact } from "./referenceImpact";
import {
  HoldReason,
  MIGRATION_ALGORITHM_VERSION,
  MIGRATION_CONFIG_VERSION,
  MigrationDecision,
  NON_EXECUTABLE_DECISIONS,
} from "./migrationTypes";

/** Snapshot canonical yang dicadangkan (belum diterbitkan, belum disahkan). */
export interface ProposedCanonicalSnapshot {
  canonicalName: string;
  normalizedName: string;
  address?: string;
  lat?: number;
  lng?: number;
  phones: string[];
  website?: string;
  providerPlaceId?: string;
  /** Keadaan jujur: tidak diketahui kekal tidak diketahui. */
  ratingKnown: boolean;
  priceKnown: boolean;
  hoursKnown: boolean;
}

export interface CandidateCompleteness {
  hasStableIdentity: boolean;
  hasLocation: boolean;
  hasContact: boolean;
  score: number;
}

export interface CandidateValidationResult {
  ok: boolean;
  issues: string[];
}

export interface LegacyPlaceMigrationCandidate {
  candidateId: string;
  legacyRecordIds: string[];
  legacyPlaceIds: string[];
  proposedCanonicalPlaceId: string;
  sourceSnapshots: string[];
  normalizedIdentity: NormalizedIdentity;
  duplicateSignals: DuplicateSignalSet | null;
  branchAssessment: BranchAssessment | null;
  proposedAliases: LegacyIdentitySet;
  proposedCanonicalSnapshot: ProposedCanonicalSnapshot;
  referenceImpact: LegacyPlaceReferenceImpact;
  completeness: CandidateCompleteness;
  validationResult: CandidateValidationResult;
  conflicts: string[];
  warnings: string[];
  migrationDecision: MigrationDecision;
  holdReasons: HoldReason[];
  contentHash: string;
  algorithmVersion: string;
  configVersion: string;
  createdAt: EpochMillis;
  updatedAt: EpochMillis;
}

/** ID canonical yang dicadangkan — deterministik daripada identiti stabil. */
export function proposedCanonicalPlaceId(
  stableKey: string,
): string {
  return `PLC-${hashCanonical({ stableKey }).slice(0, 24)}`;
}

/**
 * Kunci identiti stabil. Keutamaan: ID pembekal > ID tempat legasi.
 * Nama TIDAK PERNAH menjadi sebahagian daripada kunci — itu akan menggabungkan
 * cawangan berbeza yang berkongsi jenama.
 */
export function stableIdentityKey(
  records: readonly LegacyPlaceInventoryRecord[],
): string | null {
  const provider = records
    .map((r) => r.providerPlaceId)
    .filter(isNonEmptyString)
    .sort()[0];
  if (provider) return `provider:${provider}`;

  const legacy = records
    .map((r) => r.legacyPlaceId)
    .filter(isNonEmptyString)
    .sort()[0];
  if (legacy) return `legacy:${legacy}`;

  return null;
}

function identityFrom(
  records: readonly LegacyPlaceInventoryRecord[],
): NormalizedIdentity {
  const primary = records[0];
  return buildIdentity({
    displayName: primary.displayName,
    phones: records.map((r) => r.phone).filter(isNonEmptyString),
    website: records.map((r) => r.website).filter(isNonEmptyString)[0],
    address: records.map((r) => r.address).filter(isNonEmptyString)[0],
    lat: records.find((r) => r.lat !== undefined)?.lat,
    lng: records.find((r) => r.lng !== undefined)?.lng,
    providerPlaceId: records
      .map((r) => r.providerPlaceId)
      .filter(isNonEmptyString)[0],
  });
}

function completenessOf(
  identity: NormalizedIdentity,
  hasStableIdentity: boolean,
): CandidateCompleteness {
  const hasLocation =
    identity.lat !== undefined &&
    identity.lng !== undefined &&
    isValidLatLng(identity.lat, identity.lng);
  const hasContact =
    identity.phoneDigits.length > 0 || identity.websiteDomain !== undefined;
  const score =
    (hasStableIdentity ? 0.5 : 0) + (hasLocation ? 0.3 : 0) + (hasContact ? 0.2 : 0);
  return { hasStableIdentity, hasLocation, hasContact, score };
}

function snapshotOf(
  identity: NormalizedIdentity,
  records: readonly LegacyPlaceInventoryRecord[],
): ProposedCanonicalSnapshot {
  return {
    canonicalName: identity.displayName,
    normalizedName: identity.normalizedName,
    address: records.map((r) => r.address).filter(isNonEmptyString)[0],
    lat: identity.lat,
    lng: identity.lng,
    phones: identity.phoneDigits,
    website: records.map((r) => r.website).filter(isNonEmptyString)[0],
    providerPlaceId: identity.providerPlaceId,
    // Keadaan jujur — kami TIDAK mereka rating/harga/waktu yang tiada.
    ratingKnown: records.some((r) => typeof r.rating === "number" && r.rating > 0),
    priceKnown: records.some((r) => isNonEmptyString(r.priceEstimate)),
    hoursKnown: records.some((r) => r.isOpen !== undefined),
  };
}

export interface BuildCandidateInput {
  records: readonly LegacyPlaceInventoryRecord[];
  referenceImpact: LegacyPlaceReferenceImpact;
  /** Identiti calon lain dalam kumpulan yang sama (untuk semakan cawangan). */
  siblingIdentities?: readonly NormalizedIdentity[];
  /** Alias sedia ada yang sudah menunjuk ke sesuatu (untuk already_mapped). */
  existingCanonicalPlaceId?: string;
  /** Perlanggaran alias yang dikesan oleh perancang. */
  aliasCollisions?: readonly string[];
  config?: DedupConfig;
}

/**
 * Bina satu calon migrasi. Tulen dan deterministik: input yang sama
 * menghasilkan `contentHash` yang sama.
 */
export function buildMigrationCandidate(
  input: BuildCandidateInput,
  now: EpochMillis,
): LegacyPlaceMigrationCandidate {
  const config = input.config ?? DEFAULT_DEDUP_CONFIG;
  const records = [...input.records].sort((a, b) =>
    a.legacyRecordId.localeCompare(b.legacyRecordId),
  );
  const holdReasons: HoldReason[] = [];
  const conflicts: string[] = [];
  const warnings: string[] = [];

  const identity = identityFrom(records);
  const stableKey = stableIdentityKey(records);
  const canonicalPlaceId = stableKey
    ? proposedCanonicalPlaceId(stableKey)
    : proposedCanonicalPlaceId(`unstable:${records[0].legacyRecordId}`);

  // --- Identiti stabil -----------------------------------------------------
  if (!stableKey) {
    holdReasons.push("missing_stable_identity");
  }
  // Padanan nama-sahaja: nama wujud tetapi tiada ID pembekal DAN tiada lokasi.
  const hasProvider = isNonEmptyString(identity.providerPlaceId);
  const hasLocation =
    identity.lat !== undefined &&
    identity.lng !== undefined &&
    isValidLatLng(identity.lat, identity.lng);
  if (!hasProvider && !hasLocation) {
    holdReasons.push("name_only_match");
  }

  // --- Lokasi --------------------------------------------------------------
  const anyCoordinate = records.some(
    (r) => r.lat !== undefined || r.lng !== undefined,
  );
  if (!anyCoordinate) {
    holdReasons.push("missing_location");
  } else if (!hasLocation) {
    holdReasons.push("invalid_location");
  }

  // --- Bentuk legasi -------------------------------------------------------
  for (const record of records) {
    if (record.inventoryStatus === "blocked") {
      holdReasons.push("malformed_legacy_data");
    }
    if (record.warnings.includes("no_stable_identity_beyond_name")) {
      holdReasons.push("name_only_match");
    }
    if (record.source === "unknown") {
      holdReasons.push("source_provenance_missing");
    }
  }

  // --- Cawangan ------------------------------------------------------------
  let branchAssessment: BranchAssessment | null = null;
  let duplicateSignals: DuplicateSignalSet | null = null;
  for (const sibling of input.siblingIdentities ?? []) {
    const assessment = assessBranch(identity, sibling, config);
    duplicateSignals = computeSignals(identity, sibling, config);
    if (assessment.isLikelySeparateBranch) {
      branchAssessment = assessment;
      holdReasons.push("branch_conflict");
      conflicts.push(`branch:${assessment.reasons.join(",")}`);
      break;
    }
    branchAssessment = assessment;
  }

  // --- Perlanggaran alias --------------------------------------------------
  if ((input.aliasCollisions?.length ?? 0) > 0) {
    holdReasons.push("alias_collision");
    conflicts.push(`alias_collision:${input.aliasCollisions!.join(",")}`);
  }

  // --- Rujukan kritikal ----------------------------------------------------
  if (input.referenceImpact.warnings.includes("unknown_reference_path")) {
    holdReasons.push("unknown_reference_path");
    warnings.push("unknown_reference_path");
  }
  if (
    input.referenceImpact.criticalReferences > 0 &&
    input.referenceImpact.otherReferencePaths.length > 0
  ) {
    // Rujukan kritikal + laluan tidak dikenali = kita tidak boleh menjamin
    // penulisan semula yang lengkap.
    holdReasons.push("critical_reference_unresolved");
  }

  // --- Pengesahan snapshot canonical ---------------------------------------
  const snapshot = snapshotOf(identity, records);
  const validationIssues: string[] = [];
  if (!isNonEmptyString(snapshot.canonicalName)) {
    validationIssues.push("canonical_name_empty");
  }
  if (!hasLocation) {
    validationIssues.push("location_required_for_canonical_place");
  }
  if (validationIssues.length > 0) {
    holdReasons.push("canonical_validation_failed");
  }

  // --- Keputusan -----------------------------------------------------------
  const uniqueHolds = [...new Set(holdReasons)].sort();
  let decision: MigrationDecision;
  if (input.existingCanonicalPlaceId) {
    decision = "already_mapped";
  } else if (uniqueHolds.includes("branch_conflict")) {
    decision = "branch_conflict";
  } else if (
    uniqueHolds.includes("missing_stable_identity") ||
    uniqueHolds.includes("name_only_match")
  ) {
    decision = "insufficient_identity";
  } else if (uniqueHolds.includes("alias_collision")) {
    decision = "blocked";
  } else if (uniqueHolds.includes("ambiguous_duplicate")) {
    decision = "ambiguous";
  } else if (uniqueHolds.length > 0) {
    decision = "review_required";
  } else {
    decision = "ready";
  }

  const proposedAliases: LegacyIdentitySet = {
    legacyDocumentIds: [
      ...new Set(records.map((r) => r.legacyDocumentPath)),
    ].sort(),
    googlePlaceIds: [...new Set(records.map((r) => r.legacyPlaceId))].sort(),
    internalPlaceIds: [...new Set(records.map((r) => r.legacyRecordId))].sort(),
    deepLinkPlaceIds: [...new Set(records.map((r) => r.legacyPlaceId))].sort(),
    providerPlaceIds: [
      ...new Set(records.map((r) => r.providerPlaceId).filter(isNonEmptyString)),
    ].sort(),
    merchantIds: [],
  };

  const candidateId = `MCD-${hashCanonical({
    canonicalPlaceId,
    legacyRecordIds: records.map((r) => r.legacyRecordId).sort(),
  }).slice(0, 24)}`;

  // Cincang kandungan MENGECUALIKAN cap masa supaya dry-run berulang stabil.
  const contentHash = hashCanonical({
    candidateId,
    canonicalPlaceId,
    legacyRecordHashes: records
      .map((r) => ({ id: r.legacyRecordId, hash: r.rawContentHash }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    snapshot,
    proposedAliases,
    decision,
    holdReasons: uniqueHolds,
    algorithmVersion: MIGRATION_ALGORITHM_VERSION,
    configVersion: MIGRATION_CONFIG_VERSION,
  });

  return {
    candidateId,
    legacyRecordIds: records.map((r) => r.legacyRecordId),
    legacyPlaceIds: [...new Set(records.map((r) => r.legacyPlaceId))].sort(),
    proposedCanonicalPlaceId: input.existingCanonicalPlaceId ?? canonicalPlaceId,
    sourceSnapshots: records.map((r) => r.legacyDocumentPath),
    normalizedIdentity: identity,
    duplicateSignals,
    branchAssessment,
    proposedAliases,
    proposedCanonicalSnapshot: snapshot,
    referenceImpact: input.referenceImpact,
    completeness: completenessOf(identity, stableKey !== null),
    validationResult: {
      ok: validationIssues.length === 0,
      issues: validationIssues,
    },
    conflicts: [...new Set(conflicts)].sort(),
    warnings: [...new Set(warnings)].sort(),
    migrationDecision: decision,
    holdReasons: uniqueHolds,
    contentHash,
    algorithmVersion: MIGRATION_ALGORITHM_VERSION,
    configVersion: MIGRATION_CONFIG_VERSION,
    createdAt: now,
    updatedAt: now,
  };
}

/** Calon boleh dilaksanakan HANYA bila sedia dan tiada sebab tahan. */
export function candidateIsExecutable(
  candidate: LegacyPlaceMigrationCandidate,
): boolean {
  if (candidate.holdReasons.length > 0) return false;
  if (NON_EXECUTABLE_DECISIONS.includes(candidate.migrationDecision)) return false;
  return candidate.migrationDecision === "ready";
}
