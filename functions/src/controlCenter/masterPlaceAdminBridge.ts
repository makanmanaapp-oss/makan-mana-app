import {createHash, timingSafeEqual} from "node:crypto";

import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";

const CONTROL_CENTER_ADMIN_BRIDGE_SECRET = defineSecret("CONTROL_CENTER_ADMIN_BRIDGE_SECRET");
const LEDGER = "control_center_master_place_commands";

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

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value.slice(0, 100) : [];
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

function safeMenuItems(value: unknown): Plain[] {
  if (!Array.isArray(value)) return [];
  const out: Plain[] = [];
  for (let index = 0; index < value.length && out.length < 200; index++) {
    const raw = objectValue(value[index]);
    const section = raw.section === "makanan" || raw.section === "minuman"
      ? raw.section
      : null;
    const name = optionalText(raw.name, 120);
    if (!section || !name) continue;
    const priceRaw = finite(raw.price);
    const price = priceRaw !== null && priceRaw >= 0 && priceRaw <= 100000
      ? Math.round(priceRaw * 100) / 100
      : null;
    const sortRaw = finite(raw.sortOrder);
    const sortOrder = sortRaw !== null && Number.isInteger(sortRaw) && sortRaw >= 0 && sortRaw <= 100000
      ? sortRaw
      : index * 10;
    const imageRaw = optionalText(raw.imageUrl, 1000) ?? "";
    const imageUrl = /^https?:\/\//i.test(imageRaw) ? imageRaw : "";
    out.push({
      id: optionalText(raw.id, 120) ?? `menu-${section}-${index + 1}`,
      section,
      category: optionalText(raw.category, 80) ?? "",
      name,
      description: optionalText(raw.description, 400) ?? "",
      price,
      currency: "MYR",
      available: raw.available !== false,
      imageUrl,
      sortOrder,
    });
  }
  return out.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
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

  const result = await db.runTransaction(async (tx) => {
    const [registrySnap, headSnap, existingPublication] = await Promise.all([
      tx.get(registryRef),
      tx.get(headRef),
      tx.get(publicationRef),
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
    const mediaGallery = arrayValue(payload.mediaGallery);
    const openingHours = objectValue(payload.openingHours);
    const contact = objectValue(payload.contact);
    const addressFields = objectValue(payload.addressFields);
    const sourceType = optionalText(payload.sourceType, 80) ?? "makanmana_master_registry";
    const firebaseId = optionalText(payload.firebaseId, 240);
    const menuItems = safeMenuItems(payload.menuItems);
    const cuisineTags = arrayValue(payload.cuisineTags);
    const foodTags = arrayValue(payload.foodTags);
    const signatureDishes = arrayValue(payload.signatureDishes);
    const serviceModes = arrayValue(payload.serviceModes);
    const amenities = arrayValue(payload.amenities);
    const specialHours = arrayValue(payload.specialHours);
    const officialName = optionalText(payload.officialName, 240);
    const branchName = optionalText(payload.branchName, 240);
    const shortDescription = optionalText(payload.shortDescription, 1000);
    const editorialDescription = optionalText(payload.editorialDescription, 4000);
    const priceRange = optionalText(payload.priceRange, 40);
    const halalStatus = optionalText(payload.halalStatus, 80) ?? "unknown";
    const halalSource = optionalText(payload.halalSource, 500);
    const halalVerifiedAt = optionalText(payload.halalVerifiedAt, 80);
    const temporaryClosedFrom = optionalText(payload.temporaryClosedFrom, 80);
    const temporaryClosedUntil = optionalText(payload.temporaryClosedUntil, 80);
    const lastVerifiedAt = optionalText(payload.lastVerifiedAt, 80);

    const curated: Plain = {
      masterRegistryId,
      officialName,
      branchName,
      areaId: optionalText(payload.areaId, 100),
      addressFields,
      contact,
      primaryCategory: optionalText(payload.primaryCategory, 160),
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

    // Keep the immutable publication public-projectable in both the existing
    // flat compatibility shape and the Control Center curated envelope. The
    // public read service still decides which fields are safe to expose.
    tx.create(publicationRef, {
      ...oldPublication,
      publicationId,
      placeId: canonicalPlaceId,
      versionNumber,
      title: name,
      officialName,
      branchName,
      address,
      addressFields,
      lat: latitude,
      lng: longitude,
      publicationStatus: "published",
      blocked: businessStatus === "permanently_closed" ? true : oldPublication.blocked === true,
      ratingState: oldPublication.ratingState ?? "rating_hidden",
      priceState: oldPublication.priceState ?? "price_unknown",
      hoursState: oldPublication.hoursState ?? "hours_unknown",
      businessState: businessStatus,
      halalState: halalStatus,
      dietaryState: oldPublication.dietaryState ?? "dietary_unknown",
      allergenState: oldPublication.allergenState ?? "allergen_unknown",
      contact,
      primaryCategory: optionalText(payload.primaryCategory, 160),
      cuisineTags,
      foodTags,
      signatureDishes,
      menuItems,
      priceRange,
      serviceModes,
      amenities,
      shortDescription,
      editorialDescription,
      openingHours,
      specialHours,
      temporaryClosedFrom,
      temporaryClosedUntil,
      lastVerifiedAt,
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

    tx.set(db.collection("place_migration_audit").doc(`cc_master_${hash(requestId).slice(0, 24)}`), {
      type: "control_center_master_registry_publish",
      masterRegistryId,
      canonicalPlaceId,
      fromPublicationId: activePublicationId,
      toPublicationId: publicationId,
      versionNumber,
      requestIdHash: hash(requestId),
      at: FieldValue.serverTimestamp(),
    });

    return {canonicalPlaceId, publicationId, versionNumber, idempotent: false};
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
