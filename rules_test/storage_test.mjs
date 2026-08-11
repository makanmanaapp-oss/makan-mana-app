// HOTFIX 4.5C — Firebase STORAGE rules V2 for group images (server-mediated).
// Run: firebase emulators:exec --only storage \
//        "node rules_test/storage_test.mjs"
//
// group_images is SERVER-MEDIATED: NO direct client read/write (signed URLs from
// Cloud Functions bypass rules at the GCS layer). This suite PROVES the client
// SDK path is fully denied for every role, that NO cross-service firestore.get/
// exists remains (the 4.5B root cause), and that unrelated media paths
// (feed/profile/wallet) are unchanged.
import {readFileSync} from "node:fs";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {getBytes, ref, uploadBytes} from "firebase/storage";

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log(`PASS  ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}: ${e.message?.slice(0, 160)}`); }
}

const rulesText = readFileSync("storage.rules", "utf8");

const env = await initializeTestEnvironment({
  projectId: "makanmana-storage-rules-test",
  storage: {rules: rulesText},
});

const img = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const meta = {contentType: "image/jpeg"};

// Pre-seed a group image object (rules disabled) to test client READ deny.
await env.withSecurityRulesDisabled(async (ctx) => {
  await ctx.storage().ref("group_images/g1/asset1.jpg").put(img.buffer, meta);
});

const alice = env.authenticatedContext("alice").storage(); // "owner-ish"
const bob = env.authenticatedContext("bob").storage();

// ---- group_images: SERVER-MEDIATED, all client SDK access DENIED ----
await check("A group_images client WRITE DENIED (owner-ish)", () =>
  assertFails(uploadBytes(ref(alice, "group_images/g1/asset2.jpg"), img.buffer, meta)));
await check("B group_images client READ DENIED (any authed)", () =>
  assertFails(getBytes(ref(bob, "group_images/g1/asset1.jpg"))));
await check("C group_images client WRITE DENIED (non-member)", () =>
  assertFails(uploadBytes(ref(bob, "group_images/g1/asset3.jpg"), img.buffer, meta)));

// ---- No cross-service dependency remains (4.5B root cause removed) ----
await check("D no firestore.get in storage.rules", () =>
  rulesText.includes("firestore.get") ? Promise.reject(new Error("firestore.get present")) : Promise.resolve());
await check("E no firestore.exists in storage.rules", () =>
  rulesText.includes("firestore.exists") ? Promise.reject(new Error("firestore.exists present")) : Promise.resolve());

// ---- Existing unrelated media paths UNCHANGED ----
await check("F feed_images self WRITE ALLOWED", () =>
  assertSucceeds(uploadBytes(ref(alice, "feed_images/alice/x.jpg"), img.buffer, meta)));
await check("G feed_images other-uid WRITE DENIED", () =>
  assertFails(uploadBytes(ref(alice, "feed_images/bob/x.jpg"), img.buffer, meta)));
await check("H feed_images READ by any authed ALLOWED", () =>
  assertSucceeds(getBytes(ref(bob, "feed_images/alice/x.jpg"))));
await check("I profile_images self WRITE ALLOWED", () =>
  assertSucceeds(uploadBytes(ref(alice, "profile_images/alice/p.jpg"), img.buffer, meta)));
await check("J wallet_images self WRITE+READ ALLOWED", async () => {
  await assertSucceeds(uploadBytes(ref(alice, "wallet_images/alice/w.jpg"), img.buffer, meta));
  await assertSucceeds(getBytes(ref(alice, "wallet_images/alice/w.jpg")));
});
await check("K wallet_images other READ DENIED (private)", () =>
  assertFails(getBytes(ref(bob, "wallet_images/alice/w.jpg"))));

await env.cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
