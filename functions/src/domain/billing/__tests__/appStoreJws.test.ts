import {strict as assert} from "node:assert";
import {createSign, generateKeyPairSync, type KeyObject} from "node:crypto";
import {test} from "node:test";

import {
  APP_STORE_JWT_TTL_SECONDS,
  APPLE_JWS_ALG,
  AppleJwsError,
  buildAppStoreJwtClaims,
  certificateValidAt,
  parseJws,
  verifyAppleJws,
  verifyCertificateChain,
  verifySignature,
} from "../appStoreJws";

/**
 * Ujian ini menjana kunci ES256 SEBENAR dan menandatangani muatan sebenar,
 * supaya pengesahan tandatangan benar-benar dijalankan dan bukan diandaikan.
 * Tiada kredensial Apple diperlukan dan tiada rangkaian disentuh.
 */

const NOW = 1_700_000_000_000;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function makeKeys(): {privateKey: KeyObject; publicKey: KeyObject} {
  return generateKeyPairSync("ec", {namedCurve: "prime256v1"});
}

/** Bina JWS ES256 yang ditandatangani dengan betul (x5c ialah pemegang tempat). */
function signJws(params: {
  privateKey: KeyObject;
  payload: Record<string, unknown>;
  alg?: string;
  x5c?: unknown;
}): string {
  // `in` dan bukan `??`: `x5c: undefined` ialah kes ujian yang SAH dan tidak
  // boleh diam-diam menjadi rantaian yang sah.
  const header: Record<string, unknown> = {
    alg: params.alg ?? APPLE_JWS_ALG,
    x5c: "x5c" in params
      ? params.x5c
      : ["sijil-daun-pemegang-tempat", "sijil-perantara"],
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(
    JSON.stringify(params.payload),
  )}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({
    key: params.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${b64url(signature)}`;
}

test("parseJws menerima JWS yang berbentuk betul", () => {
  const {privateKey} = makeKeys();
  const jws = signJws({privateKey, payload: {productId: "makanmana_pro_monthly"}});
  const parsed = parseJws(jws);
  assert.equal(parsed.header.alg, APPLE_JWS_ALG);
  assert.equal(parsed.payload.productId, "makanmana_pro_monthly");
  assert.equal(parsed.signature.length, 64, "ES256 ialah R||S mentah");
  assert.equal(parsed.x5c.length, 2);
});

test("parseJws MENOLAK alg selain ES256 — kekeliruan-alg", () => {
  const {privateKey} = makeKeys();
  for (const alg of ["none", "HS256", "RS256", "ES384"]) {
    const jws = signJws({privateKey, payload: {a: 1}, alg});
    assert.throws(() => parseJws(jws), AppleJwsError, `alg ${alg} patut ditolak`);
  }
});

test("parseJws MENOLAK JWS cacat", () => {
  assert.throws(() => parseJws(""), AppleJwsError);
  assert.throws(() => parseJws("hanya.dua"), AppleJwsError);
  assert.throws(() => parseJws("a.b.c.d"), AppleJwsError);
  assert.throws(() => parseJws("!!!.@@@.###"), AppleJwsError);
  // Muatan bukan objek.
  const bad = `${b64url(JSON.stringify({alg: APPLE_JWS_ALG, x5c: ["a", "b"]}))}.${b64url(
    JSON.stringify([1, 2, 3]),
  )}.${b64url("x")}`;
  assert.throws(() => parseJws(bad), AppleJwsError);
});

test("parseJws MENOLAK x5c yang hilang atau terlalu pendek", () => {
  const {privateKey} = makeKeys();
  for (const x5c of [undefined, [], ["hanya-satu"], "bukan-array", [123, 456]]) {
    const jws = signJws({privateKey, payload: {a: 1}, x5c});
    assert.throws(() => parseJws(jws), AppleJwsError, `x5c ${JSON.stringify(x5c)}`);
  }
});

test("verifySignature: tandatangan sah lulus, yang diusik GAGAL", () => {
  const {privateKey, publicKey} = makeKeys();
  const jws = signJws({privateKey, payload: {productId: "pro", n: 7}});
  const parsed = parseJws(jws);

  // Sijil palsu yang hanya mendedahkan kunci awam — cukup untuk verifySignature.
  const fakeCert = {publicKey} as unknown as import("node:crypto").X509Certificate;

  assert.equal(
    verifySignature({
      signingInput: parsed.signingInput,
      signature: parsed.signature,
      certificate: fakeCert,
    }),
    true,
    "tandatangan sah patut lulus",
  );

  // Muatan diusik → input tandatangan berbeza → mesti gagal.
  const tampered = parsed.signingInput.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
  assert.equal(
    verifySignature({
      signingInput: tampered,
      signature: parsed.signature,
      certificate: fakeCert,
    }),
    false,
    "muatan yang diusik mesti gagal",
  );

  // Tandatangan diusik.
  const badSig = Buffer.from(parsed.signature);
  badSig[0] ^= 0xff;
  assert.equal(
    verifySignature({
      signingInput: parsed.signingInput,
      signature: badSig,
      certificate: fakeCert,
    }),
    false,
    "tandatangan yang diusik mesti gagal",
  );

  // Kunci yang salah.
  const other = makeKeys();
  assert.equal(
    verifySignature({
      signingInput: parsed.signingInput,
      signature: parsed.signature,
      certificate: {publicKey: other.publicKey} as unknown as
        import("node:crypto").X509Certificate,
    }),
    false,
    "kunci salah mesti gagal",
  );
});

test("verifySignature MENOLAK panjang tandatangan bukan-64 (DER diselubung)", () => {
  const {privateKey, publicKey} = makeKeys();
  const signer = createSign("SHA256");
  signer.update("a.b");
  signer.end();
  const der = signer.sign(privateKey); // DER, bukan R||S
  assert.notEqual(der.length, 64);
  assert.equal(
    verifySignature({
      signingInput: "a.b",
      signature: der,
      certificate: {publicKey} as unknown as import("node:crypto").X509Certificate,
    }),
    false,
  );
});

test("rantaian sijil gagal TERTUTUP tanpa akar dipercayai", () => {
  assert.throws(
    () =>
      verifyCertificateChain({
        x5c: ["a", "b"],
        trustedRoots: [],
        nowMillis: NOW,
      }),
    /gagal-tertutup/,
  );
});

test("rantaian sijil MENOLAK entri x5c yang cacat", () => {
  assert.throws(
    () =>
      verifyCertificateChain({
        x5c: ["bukan-sijil", "pun-bukan"],
        trustedRoots: ["akar-pemegang-tempat"],
        nowMillis: NOW,
      }),
    AppleJwsError,
  );
});

test("certificateValidAt menolak tarikh yang tidak boleh dihuraikan", () => {
  const fake = {validFrom: "bukan-tarikh", validTo: "pun-bukan"} as unknown as
    import("node:crypto").X509Certificate;
  assert.equal(certificateValidAt(fake, NOW), false);
});

test("verifyAppleJws tidak boleh dilepasi tanpa akar dipercayai", () => {
  const {privateKey} = makeKeys();
  const jws = signJws({privateKey, payload: {productId: "makanmana_pro_monthly"}});
  // Walaupun tandatangan sah, tiada akar dipercayai bermakna TIADA muatan
  // dipulangkan. Ini titik kegagalan-tertutup yang paling penting dalam modul.
  assert.throws(
    () => verifyAppleJws({jws, trustedRoots: [], nowMillis: NOW}),
    /gagal-tertutup/,
  );
});

test("tuntutan JWT App Store berbentuk betul dan terhad masa", () => {
  const claims = buildAppStoreJwtClaims({
    issuerId: "issuer-1",
    bundleId: "com.makanmana.apps",
    nowMillis: NOW,
  });
  assert.equal(claims.iss, "issuer-1");
  assert.equal(claims.bid, "com.makanmana.apps");
  assert.equal(claims.aud, "appstoreconnect-v1");
  assert.equal(claims.iat, Math.floor(NOW / 1000));
  assert.equal(claims.exp - claims.iat, APP_STORE_JWT_TTL_SECONDS);
});

test("tuntutan JWT menolak input kosong dan ttl di luar had Apple", () => {
  const base = {issuerId: "i", bundleId: "b", nowMillis: NOW};
  assert.throws(() => buildAppStoreJwtClaims({...base, issuerId: "  "}), AppleJwsError);
  assert.throws(() => buildAppStoreJwtClaims({...base, bundleId: ""}), AppleJwsError);
  assert.throws(() => buildAppStoreJwtClaims({...base, ttlSeconds: 0}), AppleJwsError);
  assert.throws(() => buildAppStoreJwtClaims({...base, ttlSeconds: 3601}), AppleJwsError);
});
