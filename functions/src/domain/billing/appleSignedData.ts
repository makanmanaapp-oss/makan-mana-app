import {X509Certificate} from "node:crypto";
import {
  Environment,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
  type JWSRenewalInfoDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";
import {decideEgress} from "../security/egressGuard";

export interface AppleSignedData {
  verifyAndDecodeTransaction(jws: string): Promise<JWSTransactionDecodedPayload>;
  verifyAndDecodeRenewalInfo(jws: string): Promise<JWSRenewalInfoDecodedPayload>;
  verifyAndDecodeNotification(jws: string): Promise<ResponseBodyV2DecodedPayload>;
}

/** The production path always uses Apple's verifier with certificate/OCSP checks.
 * Tests inject AppleSignedData at the domain boundary and never call Apple.
 * Transactions have bundleId/environment; renewals have environment, but no
 * bundleId/appAppleId. appAppleId belongs to the notification's outer data.
 */
export function createAppleSignedDataVerifier(config: {
  trustedRoots: string[];
  bundleId: string;
  environment: string;
  appAppleId?: number;
}): AppleSignedData {
  const egress = decideEgress({kind: "app_store_api"});
  if (!egress.allowed) throw new Error("apple_verification_egress_denied");
  if (!config.trustedRoots.length) throw new Error("apple_roots_missing");
  if (config.environment !== Environment.PRODUCTION && config.environment !== Environment.SANDBOX) {
    throw new Error("apple_environment_invalid");
  }
  const roots = config.trustedRoots.map((value) => new X509Certificate(
    value.includes("-----BEGIN") ? value : Buffer.from(value, "base64"),
  ).raw);
  return new SignedDataVerifier(
    roots, true, config.environment as Environment, config.bundleId, config.appAppleId,
  );
}
