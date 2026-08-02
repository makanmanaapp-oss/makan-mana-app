/**
 * Phase 1.3 — asas saluran normalisasi (tulen). HANYA adapter generik/provider
 * terkawal (cukup untuk fixture). Parser Google/CSV/PDF penuh = fasa kemudian.
 * TIDAK PERNAH mereka harga/rating/waktu/halal/alahan.
 */
import { EpochMillis, clamp01, isCanonicalId, isFiniteNumber, isValidLatLng } from "../common";
import { PriceDisplayState, PRICE_DISPLAY_STATES } from "../placeCommercial";
import { CanonicalTagEvidence } from "../placeTags";
import { NormalizedPlaceCandidate, ProposedLocation } from "./normalizedCandidate";
import { PlaceSourceSnapshot } from "./sourceSnapshot";
import { hashNormalizedCandidate } from "./hashing";

export interface NormalizationInput {
  snapshot: PlaceSourceSnapshot;
  raw: Record<string, unknown>;
  now: EpochMillis;
  candidateId: string;
}

export interface NormalizationOutput {
  candidate: NormalizedPlaceCandidate;
  errors: string[];
  warnings: string[];
  /** Hash deterministik payload calon (idempotency). */
  candidateHash: string;
}

export interface NormalizationService {
  normalize(input: NormalizationInput): NormalizationOutput;
}

function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length > 0 ? s : undefined;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Adapter generik: memetakan raw terkawal → calon sedar-bukti. Deterministik. */
export class GenericProviderNormalizer implements NormalizationService {
  normalize(input: NormalizationInput): NormalizationOutput {
    const { snapshot, raw, now, candidateId } = input;
    const errors: string[] = [];
    const warnings: string[] = [];

    const name = str(raw.name) ?? str(raw.displayName);
    if (!name) errors.push("missing_name");
    const safeName = name ?? "";

    const location: ProposedLocation = {};
    if (isFiniteNumber(raw.lat) && isFiniteNumber(raw.lng) && isValidLatLng(raw.lat, raw.lng)) {
      location.lat = raw.lat as number;
      location.lng = raw.lng as number;
    } else {
      warnings.push("missing_or_invalid_coordinates");
    }
    const address = str(raw.address);
    if (address) location.address = address;

    const phones: string[] = [];
    const phone = str(raw.phone);
    if (phone) phones.push(phone);
    const website = str(raw.website);

    // Harga: hanya guna keadaan sah yang DIBERI — jangan reka.
    const priceState: PriceDisplayState =
      (PRICE_DISPLAY_STATES as readonly string[]).includes(raw.priceState as string)
        ? (raw.priceState as PriceDisplayState)
        : "unknown";
    if (priceState === "unknown") warnings.push("price_unknown");

    // Waktu: hanya "known" bila sumber sahkan; jika tidak "unknown".
    const hoursKnown = raw.hasHours === true;
    if (!hoursKnown) warnings.push("hours_unknown");

    // Rating/ulasan: kekal undefined bila tiada/tidak sah.
    const rating =
      isFiniteNumber(raw.rating) && (raw.rating as number) >= 0 && (raw.rating as number) <= 5
        ? (raw.rating as number)
        : undefined;
    const reviewCount =
      isFiniteNumber(raw.reviewCount) && (raw.reviewCount as number) >= 0
        ? Math.floor(raw.reviewCount as number)
        : undefined;

    const tags: CanonicalTagEvidence[] = [];
    for (const [key, family] of [
      ["placeTypeTagId", "place_type"],
      ["cuisineTagId", "cuisine"],
    ] as const) {
      const id = str(raw[key]);
      if (id && isCanonicalId(id)) {
        tags.push({
          tagId: id,
          family,
          evidenceLevel: "reported",
          confidence: 0.6,
          sourceType: snapshot.sourceType,
          sourceRecordId: snapshot.sourceRecordId,
        });
      } else if (id && !isCanonicalId(id)) {
        warnings.push(`non_canonical_tag_dropped:${key}`);
      }
    }

    // Keyakinan deterministik ikut kehadiran medan.
    let confidence = 0.3;
    if (name) confidence += 0.1;
    if (location.lat !== undefined) confidence += 0.25;
    if (phones.length > 0) confidence += 0.1;
    if (rating !== undefined) confidence += 0.15;
    if (priceState === "verified") confidence += 0.1;
    if (tags.length > 0) confidence += 0.1;
    confidence = clamp01(Math.round(confidence * 100) / 100);

    const candidate: NormalizedPlaceCandidate = {
      candidateId,
      sourceSnapshotId: snapshot.snapshotId,
      importBatchId: snapshot.importBatchId,
      proposedIdentity: {
        canonicalName: safeName,
        normalizedName: normalizeName(safeName),
        alternateNames: [],
      },
      proposedLocation: location,
      proposedContacts: { phones, website },
      proposedDisplay: { name: safeName, address },
      proposedCommercial: { priceState },
      proposedHours: { hoursState: hoursKnown ? "known" : "unknown" },
      proposedQuality: { rating, reviewCount, ratingSource: rating !== undefined ? snapshot.sourceType : undefined },
      proposedTags: { tags },
      proposedSafetyEvidence: {
        halal: { state: "unknown", evidenceLevel: "unknown" },
        dietaryReported: [],
        allergenReported: [],
        allergenEvidenceLevel: "unknown",
      },
      fieldEvidence: {
        displayName: {
          value: safeName,
          sourceType: snapshot.sourceType,
          sourceRecordId: snapshot.sourceRecordId,
          evidenceLevel: "reported",
          confidence: 0.7,
          fetchedAt: snapshot.fetchedAt,
        },
        ...(rating !== undefined
          ? {
              rating: {
                value: rating,
                sourceType: snapshot.sourceType,
                evidenceLevel: "reported",
                confidence: 0.6,
                fetchedAt: snapshot.fetchedAt,
              },
            }
          : {}),
      },
      normalizationWarnings: warnings,
      normalizationErrors: errors,
      candidateConfidence: confidence,
      createdAt: now,
      updatedAt: now,
    };

    return {
      candidate,
      errors,
      warnings,
      candidateHash: hashNormalizedCandidate({
        ...candidate,
        createdAt: 0,
        updatedAt: 0,
      }),
    };
  }
}
