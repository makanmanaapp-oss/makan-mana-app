import {timingSafeEqual} from "node:crypto";

import {defineSecret} from "firebase-functions/params";
import {getStorage} from "firebase-admin/storage";
import {onRequest} from "firebase-functions/v2/https";

import {STORAGE_BUCKET} from "../config/constants";
import {
  UPLOAD_URL_TTL_MS,
  approveUpload,
} from "../domain/cms/mediaUpload";

/**
 * WAVE 5 — CMS media upload handoff.
 *
 * The Control Center cannot write Firebase Storage directly: it has no admin
 * SDK and no service-account secret, and introducing one would add a credential
 * to a surface that does not otherwise hold any. Instead it asks HERE, over the
 * bridge secret it already holds, and receives a SHORT-LIVED signed PUT URL.
 *
 * What makes that safe is that the URL is bound to a server-composed path and
 * to the declared content type. The console cannot choose where the object
 * lands, cannot escape the cms/ prefix, and cannot change the type afterwards —
 * the signature stops covering the request if it tries.
 *
 * Reuses the proven groupImageV2 handoff shape rather than inventing an upload
 * pipeline, and reuses CMS_ADMIN_BRIDGE_SECRET rather than adding a secret.
 *
 * NOT DEPLOYED.
 */

const CMS_ADMIN_BRIDGE_SECRET = defineSecret("CMS_ADMIN_BRIDGE_SECRET");

function bearerToken(header: string | undefined): string {
  if (!header?.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const controlCenterCmsMediaUpload = onRequest(
  {secrets: [CMS_ADMIN_BRIDGE_SECRET], timeoutSeconds: 30, memory: "256MiB", maxInstances: 3},
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).json({status: "ERROR", errorCode: "METHOD_NOT_ALLOWED"});
      return;
    }

    const secret = CMS_ADMIN_BRIDGE_SECRET.value();
    const presented = bearerToken(request.header("authorization"));
    if (!secret || !presented || !safeEqual(presented, secret)) {
      response.status(401).json({status: "ERROR", errorCode: "UNAUTHENTICATED"});
      return;
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const approved = approveUpload({
      contentType: body.contentType,
      byteSize: body.byteSize,
      filename: body.filename,
      stagingId: body.stagingId,
    });
    if (!approved.ok || !approved.value) {
      response.status(400).json({status: "ERROR", errorCode: approved.error.toUpperCase()});
      return;
    }

    try {
      const bucket = getStorage().bucket(STORAGE_BUCKET);
      const expiresAtMs = Date.now() + UPLOAD_URL_TTL_MS;
      const [uploadUrl] = await bucket.file(approved.value.storagePath).getSignedUrl({
        version: "v4",
        action: "write",
        expires: expiresAtMs,
        // Binding the type means a PUT that changes it fails the signature —
        // the declared type cannot be swapped after approval.
        contentType: approved.value.contentType,
      });

      response.status(200).json({
        status: "OK",
        uploadUrl,
        expiresAtMs,
        // The ONLY path the console may then reference in CMS content.
        media: {
          storagePath: approved.value.storagePath,
          contentType: approved.value.contentType,
          byteSize: approved.value.byteSize,
          filename: approved.value.filename,
        },
      });
    } catch (error) {
      console.error("cms media upload handoff failed", {
        message: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      });
      response.status(500).json({status: "ERROR", errorCode: "INTERNAL_ERROR"});
    }
  },
);
