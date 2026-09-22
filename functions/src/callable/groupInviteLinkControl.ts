// HOTFIX 4.6 — callable wrappers for secure group invite links.
// Real deps: crypto token + sha256 hash + Firestore + link-scoped signed GET.
// NOT deployed in this task — see REPORT for deploy + App Links config targets.

import {createHash, randomBytes} from "crypto";

import {FunctionsErrorCode, HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import * as core from "../domain/groupInviteLink/inviteLinkV2";
import {approvedStorageBucket} from "../services/egressTargets";
import {decideInviteBaseUrl} from "../domain/security/qaSurfaces";

// Firebase Hosting default domain the project controls. Android App Links must
// still be configured (assetlinks.json) to open the app — see REPORT.
//
// WAVE 3E: URL asas kini diputuskan oleh decideInviteBaseUrl. Produksi tidak
// berubah; setiap persekitaran lain MESTI mengkonfigurasikan INVITE_BASE_URL
// dan ia tidak boleh menunjuk ke Hosting produksi.

function deps(): core.InviteLinkDeps {
  const b = approvedStorageBucket();
  return {
    db,
    serverTimestamp: () => FieldValue.serverTimestamp(),
    increment: (n) => FieldValue.increment(n),
    now: () => Date.now(),
    randomToken: () => randomBytes(32).toString("base64url"),
    hashToken: (t) => createHash("sha256").update(t).digest("hex"),
    signReadUrl: async (path, expiresAtMs) => {
      const [url] = await b.file(path).getSignedUrl({version: "v4", action: "read", expires: expiresAtMs});
      return url;
    },
  };
}

function toHttps(e: unknown): never {
  if (e instanceof core.InviteLinkError) {
    throw new HttpsError(e.code as FunctionsErrorCode, e.message);
  }
  throw e;
}

export const createGroupInviteLinkV2 = onCall(async (req) => {
  try {
    // Diputuskan SEBELUM token dicipta: jemputan yang tidak boleh dikongsi tidak
    // sepatutnya meninggalkan token yatim dalam pangkalan data.
    const invite = decideInviteBaseUrl({env: process.env});
    if (!invite.ok) {
      console.warn(invite.reason);
      throw new HttpsError("failed-precondition", "invite_url_not_configured");
    }
    const r = await core.createGroupInviteLink(
      req.auth?.uid ?? null,
      (req.data ?? {}) as {groupId?: string; expiresInDays?: number; maxUses?: number | null},
      deps()
    );
    return {...r, url: `${invite.baseUrl}/invite/${r.token}`};
  } catch (e) {
    return toHttps(e);
  }
});

export const getGroupInviteLinkInfoV2 = onCall(async (req) => {
  try {
    const token = (req.data ?? {}).token as string | undefined;
    return await core.getGroupInviteLinkInfo(req.auth?.uid ?? null, token ?? "", deps());
  } catch (e) {
    return toHttps(e);
  }
});

export const joinGroupByInviteLinkV2 = onCall(async (req) => {
  try {
    const token = (req.data ?? {}).token as string | undefined;
    return await core.joinGroupByInviteLink(req.auth?.uid ?? null, token ?? "", deps());
  } catch (e) {
    return toHttps(e);
  }
});

export const revokeGroupInviteLinkV2 = onCall(async (req) => {
  try {
    const linkId = (req.data ?? {}).linkId as string | undefined;
    return await core.revokeGroupInviteLink(req.auth?.uid ?? null, linkId ?? "", deps());
  } catch (e) {
    return toHttps(e);
  }
});

export const listGroupInviteLinksV2 = onCall(async (req) => {
  try {
    const groupId = (req.data ?? {}).groupId as string | undefined;
    return await core.listGroupInviteLinks(req.auth?.uid ?? null, groupId ?? "", deps());
  } catch (e) {
    return toHttps(e);
  }
});
