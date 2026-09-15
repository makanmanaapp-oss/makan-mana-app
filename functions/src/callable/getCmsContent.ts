import {HttpsError, onCall} from "firebase-functions/v2/https";
import {getStorage} from "firebase-admin/storage";

import {db} from "../config/firebase";
import {STORAGE_BUCKET} from "../config/constants";
import {attachCmsMediaReadUrls} from "../domain/cms/mediaReadUrl";
import {
  isCmsPlacement,
  PLACEMENT_RESTAURANT_DETAIL,
  SUPPORTED_LANGUAGES,
  SUPPORTED_REGIONS,
} from "../domain/cms/cmsTypes";
import {
  readPublicCmsCollections,
  readPublicCmsContent,
} from "../services/cmsReadService";

/**
 * WAVE 5 — the single runtime CMS projection for mobile.
 *
 * Returns only content that is active NOW by the server clock and eligible for
 * this viewer. The app renders what it is given; it never re-decides
 * visibility, so a device with a wrong clock cannot reveal scheduled content.
 *
 * The viewer's PLAN is read server-side from the user document rather than
 * accepted from the caller: a client asserting "I am pro" must not unlock
 * plan-targeted content. Language and region ARE client-supplied, because both
 * are the user's own display choice and neither gates anything sensitive —
 * they are still validated against the supported allowlists so an arbitrary
 * string can never widen a match.
 */
type Input = {
  placement?: unknown;
  canonicalPlaceId?: unknown;
  language?: unknown;
  region?: unknown;
  includeCollections?: unknown;
};

function allowed(value: unknown, list: readonly string[]): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return list.includes(clean) ? clean : null;
}

async function readViewerPlan(uid: string): Promise<string> {
  try {
    const snap = await db.collection("users").doc(uid).get();
    const plan = snap.exists ? snap.data()?.plan : null;
    return typeof plan === "string" && plan ? plan : "free";
  } catch {
    // Fail closed toward the LEAST access: an unreadable plan is 'free', so
    // pro-only content stays hidden rather than showing by accident.
    return "free";
  }
}

export const getCmsContent = onCall(
  {maxInstances: 10},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");

    const data = (request.data ?? {}) as Input;
    if (!isCmsPlacement(data.placement)) {
      throw new HttpsError("invalid-argument", "placement_invalid");
    }
    const placement = data.placement;

    const canonicalPlaceId = typeof data.canonicalPlaceId === "string"
      ? data.canonicalPlaceId.trim().slice(0, 300)
      : "";
    if (placement === PLACEMENT_RESTAURANT_DETAIL && !canonicalPlaceId) {
      throw new HttpsError("invalid-argument", "canonical_place_id_required");
    }

    try {
      const viewer = {
        language: allowed(data.language, SUPPORTED_LANGUAGES),
        region: allowed(data.region, SUPPORTED_REGIONS),
        plan: await readViewerPlan(uid),
      };

      const stored = await readPublicCmsContent({
        placement, viewer, canonicalPlaceId,
      });

      // B1 — mint a short-lived READ url per image. `cms/` stays private and
      // Storage rules stay deny-all for clients; this is the only way in, and
      // it is the same server-mediated pattern `group_images/` already uses.
      //
      // Signing is best effort BY DESIGN. If it fails the banner still ships
      // with `readUrl: null` and the app renders the text card, because a
      // signing outage must look like a missing picture, never like a broken
      // Home screen.
      const content = await attachCmsMediaReadUrls(
        stored,
        async (storagePath, expiresAtMs) => {
          const [url] = await getStorage()
            .bucket(STORAGE_BUCKET)
            .file(storagePath)
            .getSignedUrl({version: "v4", action: "read", expires: expiresAtMs});
          return url;
        },
        Date.now(),
        (storagePath, error) => {
          console.error("cms media read url failed", {
            placement,
            storagePath: storagePath.slice(0, 200),
            message: error instanceof Error ? error.message.slice(0, 200) : "unknown",
          });
        },
      );

      // Collections are only meaningful on discovery surfaces, and the caller
      // asks for them explicitly so Home does not pay for a read it ignores.
      const collections = data.includeCollections === true
        ? await readPublicCmsCollections({placement, viewer})
        : [];

      return {ok: true, placement, content, collections};
    } catch (error) {
      console.error("getCmsContent failed", {
        placement,
        message: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      });
      // A CMS failure must never break the surface it sits on: the app treats
      // an empty result exactly like "no banner today".
      return {ok: true, placement, content: [], collections: []};
    }
  },
);
