// HOTFIX 4.5C — pembalut callable untuk imej grup server-mediated V2.
//
// Membina deps SEBENAR (bucket + signed URL v4 melalui Admin SDK) dan memanggil
// logik domain tulen (groupImageV2). Kod kuasa/pengesahan diuji berasingan
// terhadap emulator (domain/groupImage/__tests__). TIDAK DI-DEPLOY dalam task
// ini — lihat REPORT untuk sasaran deploy + prasyarat IAM signBlob.

import {randomUUID} from "crypto";

import {getStorage} from "firebase-admin/storage";
import {FunctionsErrorCode, HttpsError, onCall} from "firebase-functions/v2/https";

import {STORAGE_BUCKET} from "../config/constants";
import {db, FieldValue} from "../config/firebase";
import * as core from "../domain/groupImage/groupImageV2";

function makeDeps(): core.GroupImageDeps {
  const b = getStorage().bucket(STORAGE_BUCKET);
  return {
    db,
    bucket: b as unknown as core.StorageBucketLike,
    fieldDelete: () => FieldValue.delete(),
    serverTimestamp: () => FieldValue.serverTimestamp(),
    randomId: () => randomUUID().replace(/-/g, ""),
    now: () => Date.now(),
    signUploadUrl: async (path, contentType, expiresAtMs) => {
      const [url] = await b.file(path).getSignedUrl({
        version: "v4",
        action: "write",
        expires: expiresAtMs,
        contentType,
      });
      return url;
    },
    signReadUrl: async (path, expiresAtMs) => {
      const [url] = await b.file(path).getSignedUrl({
        version: "v4",
        action: "read",
        expires: expiresAtMs,
      });
      return url;
    },
  };
}

/** Petakan GroupImageError domain → HttpsError; selainnya lempar semula. */
function toHttps(e: unknown): never {
  if (e instanceof core.GroupImageError) {
    throw new HttpsError(e.code as FunctionsErrorCode, e.message);
  }
  throw e;
}

export const prepareGroupImageUploadV2 = onCall(async (req) => {
  try {
    return await core.prepareGroupImageUpload(
      req.auth?.uid ?? null,
      (req.data ?? {}) as {groupId?: string},
      makeDeps()
    );
  } catch (e) {
    return toHttps(e);
  }
});

export const finalizeGroupImageUploadV2 = onCall(async (req) => {
  try {
    return await core.finalizeGroupImageUpload(
      req.auth?.uid ?? null,
      (req.data ?? {}) as {groupId?: string; objectPath?: string},
      makeDeps()
    );
  } catch (e) {
    return toHttps(e);
  }
});

export const getGroupImageUrlV2 = onCall(async (req) => {
  try {
    const groupId = (req.data ?? {}).groupId as string | undefined;
    return await core.getGroupImageUrl(req.auth?.uid ?? null, groupId ?? "", makeDeps());
  } catch (e) {
    return toHttps(e);
  }
});

export const getGroupImageUrlsV2 = onCall(async (req) => {
  try {
    const groupIds = (req.data ?? {}).groupIds;
    return await core.getGroupImageUrls(req.auth?.uid ?? null, groupIds, makeDeps());
  } catch (e) {
    return toHttps(e);
  }
});

export const removeGroupImageV2 = onCall(async (req) => {
  try {
    const groupId = (req.data ?? {}).groupId as string | undefined;
    return await core.removeGroupImage(req.auth?.uid ?? null, groupId ?? "", makeDeps());
  } catch (e) {
    return toHttps(e);
  }
});
