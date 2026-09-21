// MAKANMANA iOS WAVE 1 — pengesahan JWS App Store.
//
// Apple menghantar maklumat transaksi sebagai JWS yang DITANDATANGANI. Membaca
// muatannya tanpa mengesahkan tandatangan bersamaan mempercayai sesiapa sahaja
// yang boleh menghantar rentetan kepada kita — iaitu klien. Modul ini wujud
// supaya tiada laluan kod boleh membaca muatan tanpa melalui pengesahan.
//
// Tiada rangkaian. Tiada Firestore. Hanya `node:crypto`, supaya ia boleh diuji.
//
// AKAR AMANAH TIDAK DITANAM DI SINI. Sijil akar Apple ialah input, bukan
// pemalar, kerana menulis bait sijil yang saya tidak boleh sahkan akan menjadi
// konfigurasi rekaan yang menyamar sebagai keselamatan. Pemilik membekalkan
// Apple Root CA G3 melalui konfigurasi; lihat `appleSubscriptionService`.

import {createVerify, X509Certificate} from "node:crypto";

/** SATU-SATUNYA algoritma yang Apple gunakan, dan satu-satunya yang diterima. */
export const APPLE_JWS_ALG = "ES256";

export interface AppleJwsHeader {
  alg?: unknown;
  x5c?: unknown;
}

export interface ParsedJws {
  header: AppleJwsHeader;
  payload: Record<string, unknown>;
  /** `<header>.<payload>` — bait sebenar yang ditandatangani. */
  signingInput: string;
  /** Tandatangan mentah R||S (64 bait untuk ES256), bukan DER. */
  signature: Buffer;
  /** Rantaian sijil dalam susunan: daun, perantara, akar. */
  x5c: string[];
}

/** Ralat pengesahan yang boleh dibaca — tidak pernah mengandungi rahsia. */
export class AppleJwsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppleJwsError";
  }
}

function base64UrlToBuffer(part: string): Buffer {
  if (!/^[A-Za-z0-9_-]*$/.test(part)) {
    throw new AppleJwsError("segmen JWS bukan base64url yang sah");
  }
  return Buffer.from(part, "base64url");
}

/**
 * Pecahkan JWS dan nyahkod muatannya TANPA mengesahkan apa-apa.
 *
 * Dieksport hanya supaya pengesahan dan ujiannya boleh dibina di atasnya.
 * Kod aplikasi mesti memanggil {@link verifyAppleJws}, bukan ini.
 */
export function parseJws(jws: string): ParsedJws {
  if (typeof jws !== "string" || jws.length === 0) {
    throw new AppleJwsError("JWS kosong");
  }
  const segments = jws.split(".");
  if (segments.length !== 3) {
    throw new AppleJwsError(`JWS perlu 3 segmen, dapat ${segments.length}`);
  }
  const [headerSeg, payloadSeg, signatureSeg] = segments;

  let header: AppleJwsHeader;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlToBuffer(headerSeg).toString("utf8")) as AppleJwsHeader;
  } catch {
    throw new AppleJwsError("pengepala JWS bukan JSON yang sah");
  }
  try {
    payload = JSON.parse(base64UrlToBuffer(payloadSeg).toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    throw new AppleJwsError("muatan JWS bukan JSON yang sah");
  }
  if (header === null || typeof header !== "object") {
    throw new AppleJwsError("pengepala JWS bukan objek");
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AppleJwsError("muatan JWS bukan objek");
  }

  // Algoritma disemak DI SINI supaya kekeliruan-alg tidak boleh melepasi
  // walaupun pemanggil terlupa memeriksanya.
  if (header.alg !== APPLE_JWS_ALG) {
    throw new AppleJwsError(
      `alg mesti ${APPLE_JWS_ALG}, dapat ${String(header.alg)}`,
    );
  }

  const rawChain = header.x5c;
  if (!Array.isArray(rawChain) || rawChain.length < 2) {
    throw new AppleJwsError("x5c mesti rantaian sekurang-kurangnya 2 sijil");
  }
  const x5c = rawChain.map((entry, i) => {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new AppleJwsError(`x5c[${i}] bukan sijil base64`);
    }
    return entry;
  });

  return {
    header,
    payload,
    signingInput: `${headerSeg}.${payloadSeg}`,
    signature: base64UrlToBuffer(signatureSeg),
    x5c,
  };
}

/** Bina sijil daripada satu entri base64 DER dalam `x5c`. */
export function certificateFromX5c(entry: string): X509Certificate {
  try {
    return new X509Certificate(Buffer.from(entry, "base64"));
  } catch {
    throw new AppleJwsError("entri x5c bukan sijil X.509 yang sah");
  }
}

/** Adakah `cert` sah pada `nowMillis`. */
export function certificateValidAt(cert: X509Certificate, nowMillis: number): boolean {
  const from = Date.parse(cert.validFrom);
  const to = Date.parse(cert.validTo);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
  return nowMillis >= from && nowMillis <= to;
}

/**
 * Sahkan rantaian x5c sampai ke satu akar yang DIPERCAYAI.
 *
 * Mengembalikan sijil daun, yang kunci awamnya menandatangani JWS. Melontar
 * jika mana-mana pautan gagal — tiada laluan "amaran dan teruskan".
 */
export function verifyCertificateChain(params: {
  x5c: string[];
  /** Sijil akar yang dipercayai, PEM atau DER-base64. Dibekalkan pemilik. */
  trustedRoots: string[];
  nowMillis: number;
}): X509Certificate {
  const {x5c, trustedRoots, nowMillis} = params;
  if (trustedRoots.length === 0) {
    throw new AppleJwsError(
      "tiada sijil akar dipercayai dikonfigurasikan; pengesahan gagal-tertutup",
    );
  }

  const chain = x5c.map(certificateFromX5c);
  for (const [i, cert] of chain.entries()) {
    if (!certificateValidAt(cert, nowMillis)) {
      throw new AppleJwsError(`sijil x5c[${i}] di luar tempoh sahnya`);
    }
  }

  // Setiap sijil mesti ditandatangani oleh yang seterusnya dalam rantaian.
  for (let i = 0; i < chain.length - 1; i++) {
    const child = chain[i];
    const issuer = chain[i + 1];
    if (!child.checkIssued(issuer) || !child.verify(issuer.publicKey)) {
      throw new AppleJwsError(
        `rantaian sijil terputus antara x5c[${i}] dan x5c[${i + 1}]`,
      );
    }
  }

  // Akar rantaian mesti ialah salah satu akar yang dipercayai, dibandingkan
  // mengikut BAIT dan bukan mengikut subjek — nama subjek boleh dipalsukan.
  const presentedRoot = chain[chain.length - 1];
  const presentedDer = presentedRoot.raw;
  const trusted = trustedRoots.some((root) => {
    try {
      const rootCert = root.includes("-----BEGIN")
        ? new X509Certificate(root)
        : new X509Certificate(Buffer.from(root, "base64"));
      return rootCert.raw.equals(presentedDer);
    } catch {
      return false;
    }
  });
  if (!trusted) {
    throw new AppleJwsError("akar rantaian bukan akar yang dipercayai");
  }

  return chain[0];
}

/** Sahkan tandatangan ES256 terhadap kunci awam yang diberikan. */
export function verifySignature(params: {
  signingInput: string;
  signature: Buffer;
  certificate: X509Certificate;
}): boolean {
  // ES256 dalam JWS ialah R||S mentah (64 bait), bukan DER. Memberitahu Node
  // sebaliknya akan menyebabkan setiap tandatangan sah ditolak.
  if (params.signature.length !== 64) return false;
  const verifier = createVerify("SHA256");
  verifier.update(params.signingInput);
  verifier.end();
  try {
    return verifier.verify(
      {key: params.certificate.publicKey, dsaEncoding: "ieee-p1363"},
      params.signature,
    );
  } catch {
    return false;
  }
}

/**
 * Sahkan sepenuhnya satu JWS Apple dan kembalikan muatannya.
 *
 * Ini SATU-SATUNYA cara kod aplikasi patut membaca muatan Apple.
 */
export function verifyAppleJws(params: {
  jws: string;
  trustedRoots: string[];
  nowMillis: number;
}): Record<string, unknown> {
  const parsed = parseJws(params.jws);
  const leaf = verifyCertificateChain({
    x5c: parsed.x5c,
    trustedRoots: params.trustedRoots,
    nowMillis: params.nowMillis,
  });
  const ok = verifySignature({
    signingInput: parsed.signingInput,
    signature: parsed.signature,
    certificate: leaf,
  });
  if (!ok) throw new AppleJwsError("tandatangan JWS tidak sah");
  return parsed.payload;
}

/** Tempoh hayat token klien App Store Server API. Apple hadkan kepada 60 minit. */
export const APP_STORE_JWT_TTL_SECONDS = 20 * 60;

export interface AppStoreJwtClaims {
  iss: string;
  iat: number;
  exp: number;
  aud: "appstoreconnect-v1";
  bid: string;
}

/**
 * Bina tuntutan JWT untuk App Store Server API.
 *
 * Tulen supaya bentuk tuntutan boleh diuji tanpa kunci. Penandatanganan berlaku
 * dalam lapisan perkhidmatan, di mana kunci persendirian berada.
 */
export function buildAppStoreJwtClaims(params: {
  issuerId: string;
  bundleId: string;
  nowMillis: number;
  ttlSeconds?: number;
}): AppStoreJwtClaims {
  const issuerId = params.issuerId.trim();
  const bundleId = params.bundleId.trim();
  if (issuerId.length === 0) throw new AppleJwsError("issuerId kosong");
  if (bundleId.length === 0) throw new AppleJwsError("bundleId kosong");
  const ttl = params.ttlSeconds ?? APP_STORE_JWT_TTL_SECONDS;
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 60 * 60) {
    throw new AppleJwsError("ttl JWT mesti antara 1 saat dan 60 minit");
  }
  const iat = Math.floor(params.nowMillis / 1000);
  return {iss: issuerId, iat, exp: iat + ttl, aud: "appstoreconnect-v1", bid: bundleId};
}
