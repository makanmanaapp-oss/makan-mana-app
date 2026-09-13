import {createHash, timingSafeEqual} from "node:crypto";

import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {storageCellForPlace} from "../domain/places/coverage/areaCandidatePool";
import {
  buildMasterRegistryCandidate,
  upsertMasterRegistryCandidate,
} from "../domain/places/canonical/masterRegistryCandidate";

const CONTROL_CENTER_ADMIN_BRIDGE_SECRET = defineSecret("CONTROL_CENTER_ADMIN_BRIDGE_SECRET");
const LEDGER = "control_center_master_place_commands";
const C_AREA = "area_place_cache";

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
  const areaRef = db.collection(C_AREA).doc(areaCellId);

  const businessStatus = optionalText(payload.businessStatus, 60) ?? "active";
  const coverImageUrl = optionalText(payload.coverImageUrl, 2000);
  const mediaGallery = arrayValue(payload.mediaGallery, 24);
  const openingHours = objectValue(payload.openingHours);
  const contact = objectValue(payload.contact);
  const addressFields = objectValue(payload.addressFields);
  const sourceType = optionalText(payload.sourceType, 80) ?? "makanmana_master_registry";
  const firebaseId = optionalText(payload.firebaseId, 240);
  const officialName = optionalText(payload.officialName, 240);
  const branchName = optionalText(payload.branchName, 240);
  const areaId = optionalText(payload.areaId, 100);
  const primaryCategory = optionalText(payload.primaryCategory, 160);
  const cuisineTags = arrayValue(payload.cuisineTags);
  const foodTags = arrayValue(payload.foodTags);
  const signatureDishes = arrayValue(payload.signatureDishes);
  const menuItems = arrayValue(payload.menuItems, 200);
  const priceRange = optionalText(payload.priceRange, 40);
  const halalStatus = optionalText(payload.halalStatus, 80) ?? "unknown";
  const halalSource = optionalText(payload.halalSource, 500);
  const halalVerifiedAt = optionalText(payload.halalVerifiedAt, 80);
  const serviceModes = arrayValue(payload.serviceModes);
  const amenities = arrayValue(payload.amenities);
  const shortDescription = optionalText(payload.shortDescription, 1000);
  const editorialDescription = optionalText(payload.editorialDescription, 4000);
  const specialHours = arrayValue(payload.specialHours, 64);
  const temporaryClosedFrom = optionalText(payload.temporaryClosedFrom, 80);
  const temporaryClosedUntil = optionalText(payload.temporaryClosedUntil, 80);
  const lastVerifiedAt = optionalText(payload.lastVerifiedAt, 80);
  const dataQualityScore = typeof payload.dataQualityScore === "number" ? payload.dataQualityScore : null;

  const curated: Plain = {
    masterRegistryId,
    officialName,
    branchName,
    areaId,
    addressFields,
    contact,
    primaryCategory,
    cuisineTags,
    foodTags,
    signatureDishes,
    menuItems,
    priceRange,
    halalStatus,
    halalSource,
    halalVerifiedAt,
    serviceModes,
    amenities,
    shortDescription,
    editorialDescription,
    businessStatus,
    openingHours,
    specialHours,
    temporaryClosedFrom,
    temporaryClosedUntil,
    lastVerifiedAt,
    coverImageUrl,
    mediaGallery,
    dataQualityScore,
  };

  const candidate = buildMasterRegistryCandidate({
    canonicalPlaceId,
    name,
    address,
    latitude,
    longitude,
    primaryCategory,
    cuisineTags,
    priceRange,
    businessStatus,
    openingHours,
    coverImageUrl,
    nowMs: now,
  });

  const result = await db.runTransaction(async (tx) => {
    // Firestore transaction rule: complete all reads before writes.
    const [registrySnap, headSnap, existingPublication, areaSnap] = await Promise.all([
      tx.get(registryRef),
      tx.get(headRef),
      tx.get(publicationRef),
      tx.get(areaRef),
    ]);

    const materializedCandidates = upsertMasterRegistryCandidate(
      areaSnap.data()?.candidates,
      candidate,
      firebaseId ? [firebaseId] : [],
    );

    if (existingPublication.exists) {
      // Idempotent retries also heal candidate materialization if the original
      // publish happened before candidate-pool integration existed.
      tx.set(areaRef, {
        cellId: areaCellId,
        candidates: materializedCandidates,
        registryUpdatedAt: now,
        updatedAt: now,
      }, {merge: true});
      return {
        canonicalPlaceId,
        publicationId,
        versionNumber: existingPublication.data()?.versionNumber ?? 1,
        idempotent: true,
        candidateMaterialized: true,
        areaCellId,
      };
    }

    const activePublicationId = optionalText(headSnap.data()?.activePublicationId, 240);
    const activeSnap = activePublicationId ? await tx.get(db.collection("place_publications").doc(activePublicationId)) : null;
    const oldPublication = activeSnap?.exists ? (activeSnap.data() ?? {}) as Plain : {};
    const oldVersion = typeof oldPublication.versionNumber === "number" ? oldPublication.versionNumber : 0;
    const versionNumber = oldVersion + 1;

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

    // Flatten the bounded public fields required by Restaurant Profile V2.
    // controlCenterCurated remains as the immutable admin snapshot, but mobile
    // projection must not depend on reading private/nested admin-only shapes.
    tx.create(publicationRef, {
      ...oldPublication,
      publicationId,
      placeId: canonicalPlaceId,
      versionNumber,
      title: name,
      name,
      officialName,
      branchName,
      address,
      addressFields,
      latitude,
      longitude,
      lat: latitude,
      lng: longitude,
      contact,
      primaryCategory,
      cuisineTags,
      foodTags,
      signatureDishes,
      menuItems,
      priceRange,
      halalStatus,
      halalSource,
      halalVerifiedAt,
      serviceModes,
      amenities,
      shortDescription,
      editorialDescription,
      businessStatus,
      openingHours,
      specialHours,
      temporaryClosedFrom,
      temporaryClosedUntil,
      lastVerifiedAt,
      publicationStatus: "published",
      blocked: businessStatus === "permanently_closed" ? true : oldPublication.blocked === true,
      ratingState: oldPublication.ratingState ?? "rating_hidden",
      priceState: oldPublication.priceState ?? "price_unknown",
      hoursState: Object.keys(openingHours).length > 0 ? "hours_known" : (oldPublication.hoursState ?? "hours_unknown"),
      businessState: businessStatus,
      halalState: halalStatus,
      dietaryState: oldPublication.dietaryState ?? "dietary_unknown",
      allergenState: oldPublication.allergenState ?? "allergen_unknown",
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

    tx.set(areaRef, {
      cellId: areaCellId,
      candidates: materializedCandidates,
      registryUpdatedAt: now,
      updatedAt: now,
    }, {merge: true});

    tx.set(db.collection("place_migration_audit").doc(`cc_master_${hash(requestId).slice(0, 24)}`), {
      type: "control_center_master_registry_publish",
      masterRegistryId,
      canonicalPlaceId,
      fromPublicationId: activePublicationId,
      toPublicationId: publicationId,
      versionNumber,
      candidateMaterialized: true,
      areaCellId,
      requestIdHash: hash(requestId),
      at: FieldValue.serverTimestamp(),
    });

    return {
      canonicalPlaceId,
      publicationId,
      versionNumber,
      idempotent: false,
      candidateMaterialized: true,
      areaCellId,
    };
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
