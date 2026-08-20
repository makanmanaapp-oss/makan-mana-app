import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {test} from "node:test";

function read(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), ...parts), "utf8");
}

test("client and backend keep compatible completion fields", () => {
  const client = read("..", "lib", "core", "services", "purchase_service.dart");
  const backend = read("src", "callable", "verifyGooglePlaySubscription.ts");

  assert.match(client, /data\['localCompletionAllowed'\] == true/);
  assert.match(client, /data\['allowCompletePurchase'\] == true/);
  assert.match(backend, /localCompletionAllowed: result\.localCompletionAllowed/);
  assert.match(backend, /allowCompletePurchase: result\.localCompletionAllowed/);
});

test("prepareGooglePlayBilling is source-controlled and exported", () => {
  const callable = read("src", "callable", "prepareGooglePlayBilling.ts");
  const service = read("src", "services", "googlePlaySubscriptionService.ts");
  const index = read("src", "index.ts");

  assert.match(callable, /prepareGooglePlayBillingAccount/);
  assert.match(callable, /opaqueAccountId/);
  assert.match(service, /subscription_account_links/);
  assert.match(service, /export async function prepareGooglePlayBillingAccount/);
  assert.match(index, /prepareGooglePlayBilling/);
});
