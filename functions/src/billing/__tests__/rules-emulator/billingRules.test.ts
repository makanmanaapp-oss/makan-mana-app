import {after, before, beforeEach, test} from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {doc, getDoc, setDoc, updateDoc} from "firebase/firestore";

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) {
  throw new Error(
    "FIRESTORE_EMULATOR_HOST unset — run via `npm run test:rules`.",
  );
}
const [host, portStr] = HOST.split(":");
const PROJECT_ID = "demo-mm-rules";

let env: RulesTestEnvironment;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(process.cwd(), "..", "firestore.rules"), "utf8"),
      host,
      port: Number(portStr),
    },
  });
});

after(async () => {
  if (env) await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/alice"), {
      uid: "alice",
      email: "alice@example.test",
      displayName: "Alice",
      plan: "free",
      planStatus: "active",
    });
    await setDoc(doc(db, "billing_purchase_tokens/hash1"), {
      uid: "alice",
      tokenHash: "hash1",
      plan: "pro",
    });
    await setDoc(doc(db, "billing_entitlements/alice"), {
      uid: "alice",
      plan: "pro",
      status: "active",
    });
  });
});

const unauth = () => env.unauthenticatedContext().firestore();
const alice = () => env.authenticatedContext("alice").firestore();
const bob = () => env.authenticatedContext("bob").firestore();

test("owner can read own user profile", async () => {
  await assertSucceeds(getDoc(doc(alice(), "users/alice")));
});

test("new owner profile may only start on free active", async () => {
  await assertSucceeds(setDoc(doc(bob(), "users/bob"), {
    uid: "bob",
    email: "bob@example.test",
    displayName: "Bob",
    plan: "free",
    planStatus: "active",
  }));

  await assertFails(setDoc(doc(bob(), "users/bob-paid"), {
    uid: "bob-paid",
    plan: "pro",
    planStatus: "active",
  }));
});

test("owner can update ordinary profile fields", async () => {
  await assertSucceeds(updateDoc(doc(alice(), "users/alice"), {
    displayName: "Alice Updated",
  }));
});

test("owner cannot self-upgrade plan", async () => {
  await assertFails(updateDoc(doc(alice(), "users/alice"), {plan: "pro"}));
});

test("owner cannot mutate planStatus or backend planSource", async () => {
  await assertFails(updateDoc(doc(alice(), "users/alice"), {
    planStatus: "active",
    planSource: "google_play_backend",
  }));
});

test("other user cannot read or update someone else's profile", async () => {
  await assertFails(getDoc(doc(bob(), "users/alice")));
  await assertFails(updateDoc(doc(bob(), "users/alice"), {displayName: "Hijack"}));
});

test("billing token collection is server-only", async () => {
  await assertFails(getDoc(doc(alice(), "billing_purchase_tokens/hash1")));
  await assertFails(setDoc(doc(alice(), "billing_purchase_tokens/hash2"), {
    uid: "alice",
  }));
  await assertFails(getDoc(doc(unauth(), "billing_purchase_tokens/hash1")));
});

test("billing entitlement collection is server-only", async () => {
  await assertFails(getDoc(doc(alice(), "billing_entitlements/alice")));
  await assertFails(updateDoc(doc(alice(), "billing_entitlements/alice"), {
    plan: "free",
  }));
});
