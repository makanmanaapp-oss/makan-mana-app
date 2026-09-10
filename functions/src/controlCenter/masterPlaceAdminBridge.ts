import {createHash, timingSafeEqual} from "node:crypto";

import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {haversineMeters} from "../domain/places/dedup/geo";
import {storageCellForPlace} from "../domain/places/coverage/areaCandidatePool";
import {PlaceCandidate} from "../types/place";

const CONTROL_CENTER_ADMIN_BRIDGE_SECRET = defineSecret("CONTROL_CENTER_ADMIN_BRIDGE_SECRET");
const LEDGER = "control_center_master_place_commands";
const AREA_CACHE = "area_place_cache";
const MAX_CANDIDATES_PER_CELL = 400;
const DUPLICATE_DISTANCE_METERS = 150;

type Plain = Record<string, unknown>;
type CommandBody = {
  requestId?: unknown;
  commandType?: unknown;
  resourceType?: unknown;
  resourceId?: unknown;
  payload?: unknown;
  reason?: unknown;
};

class BridgeError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "BridgeError";
  }
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function requiredText(value: unknown, label: string, max = 240) {
  if (typeof value !== "string" || !value.trim()) throw new BridgeError(400, `${label} is required.`);
  return value.trim().slice(0, max);
}

function optionalText(value: unknown, max = 1000): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function objectValue(value: unknown): Plain {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Plain : {};
}

function arrayValue(value: unknown, max = 100): unknown[] {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function tokenFrom(header: string | undefined) {
  return header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function secretMatches(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function normalizedName(value: unknown): string {
  return optionalText(value, 240)?.toLocaleLowerCase("en-MY").replace(/[^a-z0-9]+/g, " ").trim() ?? "";
}

function priceLevelFromRange(value: unknown): number {
  const text = optionalText(value, 40)?.toLowerCase() ?? "";
  if (["budget", "cheap", "murah", "$"].includes(text)) return 1;
  if (["moderate", "mid", "sederhana", "$$"].includes(text)) return 2;
  if (["premium", "expensive", "mahal", "$$$"].includes(text)) return 3;
  if (["luxury", "fine_dining", "$$$$"].includes(text)) return 4;
  return 0;
}

function firstText(values: unknown[]): string | null {
  for (const value of values) {
    const text = optionalText(value, 160);
    if (text) return text;
  }
  return null;
}

function candidateFromPublication(params: {
  canonicalPlaceId: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  payload: Plain;
  coverImageUrl: string | null;
  businessStatus: string;
}): PlaceCandidate {
  const cuisineTags = arrayValue(params.payload.cuisineTags)
    .map((v) => optionalText(v, 120))
    .filter((v): v is string => v !== null);
  const cuisine = firstText([
    cuisineTags[0],
    params.payload.primaryCategory,
    "Makanan",
  ]) ?? "Makanan";
  const priceLevel = priceLevelFromRange(params.payload.priceRange);
  return {
    placeId: params.canonicalPlaceId,
    canonicalPlaceId: params.canonicalPlaceId,
    dataSource: "canonical",
    name: params.name,
    cuisine,
    emoji: "🍽️",
    rating: 0,
    userRatingCount: 0,
    priceLevel,
    distanceKm: 0,
    isOpen: params.businessStatus !== "temporarily_closed" && params.businessStatus !== "permanently_closed",
    address: params.address ?? "",
    matchScore: 0,
    matchReasonKeys: [],
    negativeSignals: [
      ...(priceLevel <= 0 ? ["price_unknown"] : []),
      "hours_unverified",
    ],
    priceEstimate: priceLevel > 0 ? "$".repeat(priceLevel) : "",
    photoUrl: params.coverImageUrl,
    openingPeriods: null,
    lat: params.latitude,
    lng: params.longitude,
  };
}

function isSamePhysicalPlace(existing: PlaceCandidate, canonical: PlaceCandidate): boolean {
  if (existing.canonicalPlaceId === canonical.canonicalPlaceId || existing.placeId === canonical.placeId) return true;
  if (!normalizedName(existing.name) || normalizedName(existing.name) !== normalizedName(canonical.name)) return false;
  if (typeof existing.lat !== "number" || typeof existing.lng !== "number" ||
      typeof canonical.lat !== "number" || typeof canonical.lng !== "number") return false;
  return haversineMeters(existing.lat, existing.lng, canonical.lat, canonical.lng) <= DUPLICATE_DISTANCE_METERS;
}

function mergeProviderEvidence(canonical: PlaceCandidate, duplicate: PlaceCandidate | undefined): PlaceCandidate {
  if (!duplicate) return canonical;
  return {
    ...canonical,
    // MakanMana-curated identity/content wins. Provider metrics are retained only
    // where the curated publication has no equivalent measurement.
    rating: duplicate.rating > 0 ? duplicate.rating : canonical.rating,
    userRatingCount: duplicate.userRatingCount > 0 ? duplicate.userRatingCount : canonical.userRatingCount,
    priceLevel: canonical.priceLevel > 0 ? canonical.priceLevel : duplicate.priceLevel,
    priceEstimate: canonical.priceEstimate || duplicate.priceEstimate,
    photoUrl: canonical.photoUrl ?? duplicate.photoUrl ?? null,
    openingPeriods: canonical.openingPeriods ?? duplicate.openingPeriods ?? null,
  };
}

async function resolveCanonicalId(payload: Plain, masterRegistryId: string) {
  const explicit = optionalText(payload.canonicalPlaceId, 240);
  if (explicit && (await db.collection("place_registry").doc(explicit).get()).exists) return explicit;

  const firebaseId = optionalText(payload.firebaseId, 240);
  if (firebaseId) {
    if ((await db.collection("place_registry").doc(firebaseId).get()).exists) return firebaseId;
    const alias = await db.collection("place_migration_aliases").doc(firebaseId).get();
    const target = optionalText(alias.data()?.canonicalPlaceId, 240);
    if (target) return target;
  }

  return `CCM-${hash(masterRegistryId).slice(0, 32)}`;
}

async function publishMasterPlace(resourceId: string, payload: Plain, requestId: string): Promise<Plain> {
  const masterRegistryId = optionalText(payload.masterRegistryId, 100) ?? resourceId;
  const name = requiredText(payload.name, "payload.name", 240);
  const address = optionalText(payload.address, 1600);
  const latitude = finite(payload.latitude);
  const longitude = finite(payload.longitude);
  if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new BridgeError(400, "Master registry place requires valid coordinates.");
  }

  const canonicalPlaceId = await resolveCanonicalId(payload, masterRegistryId);
  const publicationId = `CCMASTER-${hash(requestId).slice(0, 24)}`;
  const now = Date.now();
  const registryRef = db.collection("place_registry").doc(canonicalPlaceId);
  const headRef = db.collection("place_publication_heads").doc(canonicalPlaceId);
  const publicationRef = db.collection("place_publications").doc(publicationId);
  const areaCellId = storageCellForPlace(latitude, longitude);
  const areaRef = db.collection(AREA_CACHE).doc(areaCellId);

  const result = await db.runTransaction(async (tx) => {
    const [registrySnap, headSnap, existingPublication, areaSnap] = await Promise.all([
      tx.get(registryRef),
      tx.get(headRef),
      tx.get(publicationRef),
      tx.get(areaRef),
    ]);

    if (existingPublication.exists) {
      return {
        canonicalPlaceId,
        publicationId,
        versionNumber: existingPublication.data()?.versionNumber ?? 1,
        idempotent: true,
      };
    }

    const activePublicationId = optionalText(headSnap.data()?.activePublicationId, 240);
    const activeSnap = activePublicationId ? await tx.get(db.collection("place_publications").doc(activePublicationId)) : null;
    const oldPublication = activeSnap?.exists ? (activeSnap.data() ?? {}) as Plain : {};
    const oldVersion = typeof oldPublication.versionNumber === "number" ? oldPublication.versionNumber : 0;
    const versionNumber = oldVersion + 1;

    const businessStatus = optionalText(payload.businessStatus, 60) ?? "active";
    const coverImageUrl = optionalText(payload.coverImageUrl, 2000);
    const mediaGallery = arrayValue(payload.mediaGallery, 100);
    const menuItems = arrayValue(payload.menuItems, 200);
    const openingHours = objectValue(payload.openingHours);
    const contact = objectValue(payload.contact);
    const addressFields = objectValue(payload.addressFields);
    const sourceType = optionalText(payload.sourceType, 80) ?? "makanmana_master_registry";
    const firebaseId = optionalText(payload.firebaseId, 240);

    const curated: Plain = {
      masterRegistryId,
      officialName: optionalText(payload.officialName, 240),
      branchName: optionalText(payload.branchName, 240),
      areaId: optionalText(payload.areaId, 100),
      addressFields,
      contact,
      primaryCategory: optionalText(payload.primaryCategory, 160),
      cuisineTags: arrayValue(payload.cuisineTags),
      foodTags: arrayValue(payload.foodTags),
      signatureDishes: arrayValue(payload.signatureDishes),
      menuItems,
      priceRange: optionalText(payload.priceRange, 40),
      halalStatus: optionalText(payload.halalStatus, 80) ?? "unknown",
      halalSource: optionalText(payload.halalSource, 500),
      halalVerifiedAt: optionalText(payload.halalVerifiedAt, 80),
      serviceModes: arrayValue(payload.serviceModes),
      amenities: arrayValue(payload.amenities),
      shortDescription: optionalText(payload.shortDescription, 1000),
      editorialDescription: optionalText(payload.editorialDescription, 4000),
      businessStatus,
      openingHours,
      specialHours: arrayValue(payload.specialHours),
      temporaryClosedFrom: optionalText(payload.temporaryClosedFrom, 80),
      temporaryClosedUntil: optionalText(payload.temporaryClosedUntil, 80),
      lastVerifiedAt: optionalText(payload.lastVerifiedAt, 80),
      coverImageUrl,
      mediaGallery,
      dataQualityScore: typeof payload.dataQualityScore === "number" ? payload.dataQualityScore : null,
    };

    tx.set(registryRef, {
      ...(registrySnap.exists ? {} : {createdAt: now}),
      canonicalPlaceId,
      ...(firebaseId ? {firebaseId} : {}),
      displayName: name,
      lat: latitude,
      lng: longitude,
      address,
      provenanceSource: sourceType,
      controlCenterMasterRegistryId: masterRegistryId,
      controlCenterCurated: curated,
      lifecycleStatus: registrySnap.data()?.lifecycleStatus ?? "active",
      updatedAt: now,
      controlCenterRequestId: requestId,
    }, {merge: true});

    tx.create(publicationRef, {
      ...oldPublication,
      publicationId,
      placeId: canonicalPlaceId,
      versionNumber,
      title: name,
      officialName: optionalText(payload.officialName, 240),
      branchName: optionalText(payload.branchName, 240),
      address,
      addressFields,
      lat: latitude,
      lng: longitude,
      publicationStatus: "published",
      blocked: businessStatus === "permanently_closed" ? true : oldPublication.blocked === true,
      ratingState: oldPublication.ratingState ?? "rating_hidden",
      priceState: oldPublication.priceState ?? "price_unknown",
      hoursState: oldPublication.hoursState ?? "hours_unknown",
      businessState: oldPublication.businessState ?? "status_unknown",
      halalState: oldPublication.halalState ?? "halal_unknown",
      dietaryState: oldPublication.dietaryState ?? "dietary_unknown",
      allergenState: oldPublication.allergenState ?? "allergen_unknown",
      contact,
      primaryCategory: optionalText(payload.primaryCategory, 160),
      cuisineTags: arrayValue(payload.cuisineTags),
      foodTags: arrayValue(payload.foodTags),
      signatureDishes: arrayValue(payload.signatureDishes),
      menuItems,
      serviceModes: arrayValue(payload.serviceModes),
      amenities: arrayValue(payload.amenities),
      shortDescription: optionalText(payload.shortDescription, 1000),
      editorialDescription: optionalText(payload.editorialDescription, 4000),
      openingHours,
      specialHours: arrayValue(payload.specialHours),
      temporaryClosedFrom: optionalText(payload.temporaryClosedFrom, 80),
      temporaryClosedUntil: optionalText(payload.temporaryClosedUntil, 80),
      lastVerifiedAt: optionalText(payload.lastVerifiedAt, 80),
      coverImageUrl,
      mediaGallery,
      controlCenterCurated: curated,
      controlCenterMasterRegistryId: masterRegistryId,
      controlCenterBusinessStatus: businessStatus,
      controlCenterRequestId: requestId,
      sourceCanonicalVersion: "control-center-master-v2",
      contentHash: hash(JSON.stringify({canonicalPlaceId, name, address, latitude, longitude, curated})),
      publishedAt: now,
      createdAt: now,
    });

    tx.set(headRef, {placeId: canonicalPlaceId, activePublicationId: publicationId, updatedAt: now}, {merge: true});

    if (firebaseId && firebaseId !== canonicalPlaceId) {
      tx.set(db.collection("place_migration_aliases").doc(firebaseId), {
        canonicalPlaceId,
        aliasType: "control_center_firebase_id",
        status: "active",
        updatedAt: now,
        controlCenterRequestId: requestId,
      }, {merge: true});
    }

    // Put every approved Control Center place into the same geographic candidate
    // store used by Algorithm 2. This makes a standalone curated place discoverable
    // even when Google has never returned it. Curated identity/content wins over an
    // exact-name provider duplicate within 150 m; provider rating/photo evidence is
    // retained when MakanMana has no replacement.
    const canonicalBase = candidateFromPublication({
      canonicalPlaceId,
      name,
      address,
      latitude,
      longitude,
      payload,
      coverImageUrl,
      businessStatus,
    });
    const existingCandidates = Array.isArray(areaSnap.data()?.candidates)
      ? (areaSnap.data()!.candidates as PlaceCandidate[])
      : [];
    const duplicates = existingCandidates.filter((item) => isSamePhysicalPlace(item, canonicalBase));
    const providerEvidence = duplicates
      .filter((item) => item.dataSource !== "canonical")
      .sort((a, b) => b.userRatingCount - a.userRatingCount)[0];
    const canonicalCandidate = mergeProviderEvidence(canonicalBase, providerEvidence);
    const remaining = existingCandidates.filter((item) => !isSamePhysicalPlace(item, canonicalBase));
    tx.set(areaRef, {
      cellId: areaCellId,
      candidates: [canonicalCandidate, ...remaining].slice(0, MAX_CANDIDATES_PER_CELL),
      updatedAt: now,
      curatedUpdatedAt: now,
    }, {merge: true});

    tx.set(db.collection("place_migration_audit").doc(`cc_master_${hash(requestId).slice(0, 24)}`), {
      type: "control_center_master_registry_publish",
      masterRegistryId,
      canonicalPlaceId,
      fromPublicationId: activePublicationId,
      toPublicationId: publicationId,
      versionNumber,
      areaCellId,
      requestIdHash: hash(requestId),
      at: FieldValue.serverTimestamp(),
    });

    return {canonicalPlaceId, publicationId, versionNumber, areaCellId, idempotent: false};
  });

  return {masterRegistryId, published: true, ...result};
}

/** Dedicated secret-gated authority for permanent MakanMana Master Place Registry publication. */
export const controlCenterMasterPlaceAdminBridge = onRequest(
  {
    invoker: "public",
    secrets: [CONTROL_CENTER_ADMIN_BRIDGE_SECRET],
    timeoutSeconds: 120,
    memory: "512MiB",
    maxInstances: 2,
  },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).json({message: "POST required."});
      return;
    }

    const secret = CONTROL_CENTER_ADMIN_BRIDGE_SECRET.value();
    const presented = tokenFrom(request.header("authorization"));
    if (!secret || !presented || !secretMatches(presented, secret)) {
      response.status(401).json({message: "Unauthorized master place bridge request."});
      return;
    }

    let requestId = "";
    try {
      const body = (request.body ?? {}) as CommandBody;
      requestId = requiredText(body.requestId, "requestId", 160);
      const commandType = requiredText(body.commandType, "commandType", 120);
      const resourceType = requiredText(body.resourceType, "resourceType", 120);
      const resourceId = requiredText(body.resourceId, "resourceId", 240);
      const reason = requiredText(body.reason, "reason", 1000);
      if (reason.length < 8) throw new BridgeError(400, "reason must contain at least 8 characters.");
      if (commandType !== "place.publish_master_registry" || resourceType !== "place_registry_master") {
        throw new BridgeError(400, "Unsupported command/resource combination for master place bridge.");
      }

      const ledgerRef = db.collection(LEDGER).doc(hash(requestId));
      const ledger = await ledgerRef.get();
      if (ledger.data()?.status === "succeeded") {
        response.status(200).json({status: "OK", requestId, commandType, idempotent: true, ...objectValue(ledger.data()?.result)});
        return;
      }

      await ledgerRef.set({
        requestIdHash: hash(requestId),
        resourceIdHash: hash(resourceId),
        reasonHash: hash(reason),
        status: "processing",
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});

      const result = await publishMasterPlace(resourceId, objectValue(body.payload), requestId);
      await ledgerRef.set({status: "succeeded", result, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      response.status(200).json({status: "OK", requestId, commandType, ...result});
    } catch (error) {
      if (requestId) {
        await db.collection(LEDGER).doc(hash(requestId)).set({
          status: "failed",
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : "unknown",
          failedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true}).catch(() => undefined);
      }
      const status = error instanceof BridgeError ? error.status : 500;
      console.error("Control Center master place bridge failed", {
        status,
        message: error instanceof Error ? error.message.slice(0, 500) : "unknown",
      });
      response.status(status).json({message: error instanceof Error ? error.message : "Master place bridge failed."});
    }
  },
);