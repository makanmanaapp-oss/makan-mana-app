/**
 * Wave 3B — REAL client-perspective rules tests for the new engagement
 * collections. Run: npm run test:rules.
 *
 * Required test 20 — direct unauthorized client writes to the new
 * server-managed collections are denied, while the product's safe reads work.
 */
import {before, after, beforeEach, test} from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {doc, getDoc, setDoc, updateDoc, deleteDoc} from "firebase/firestore";

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) {
  throw new Error("FIRESTORE_EMULATOR_HOST unset — run via `npm run test:rules`.");
}
const [host, portStr] = HOST.split(":");
const PROJECT_ID = "demo-mm-wave3-engagement-rules";

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
});

async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

test("client cannot write restaurant_follows / restaurant_public / menu_comments", async () => {
  const db = env.authenticatedContext("user-1").firestore();
  const anon = env.unauthenticatedContext().firestore();

  await assertFails(setDoc(doc(db, "restaurant_follows/user-1__canon-1"), {followerUid: "user-1", canonicalPlaceId: "canon-1"}));
  await assertFails(setDoc(doc(anon, "restaurant_follows/x__canon-1"), {followerUid: "x"}));
  await assertFails(setDoc(doc(db, "restaurant_public/canon-1"), {followerCount: 999}));
  await assertFails(setDoc(doc(db, "menu_comments/c1"), {canonicalPlaceId: "canon-1", menuItemId: "m1", authorUid: "user-1", status: "visible", text: "spoof"}));
});

test("client cannot forge a restaurant post directly in feed_posts", async () => {
  const db = env.authenticatedContext("user-1").firestore();
  await assertFails(setDoc(doc(db, "feed_posts/forged"), {
    postType: "restaurant_post", authorType: "restaurant", restaurantId: "canon-1", visibility: "public",
  }));
});

test("a user may read ONLY their own restaurant_follows (not another user's)", async () => {
  await seed("restaurant_follows/user-1__canon-1", {followerUid: "user-1", canonicalPlaceId: "canon-1"});
  await seed("restaurant_follows/user-2__canon-1", {followerUid: "user-2", canonicalPlaceId: "canon-1"});
  const db = env.authenticatedContext("user-1").firestore();
  await assertSucceeds(getDoc(doc(db, "restaurant_follows/user-1__canon-1")));
  await assertFails(getDoc(doc(db, "restaurant_follows/user-2__canon-1")));
});

test("follower COUNT aggregate is signed-in readable but server-write only", async () => {
  await seed("restaurant_public/canon-1", {canonicalPlaceId: "canon-1", followerCount: 5});
  const db = env.authenticatedContext("user-1").firestore();
  await assertSucceeds(getDoc(doc(db, "restaurant_public/canon-1")));
  await assertFails(updateDoc(doc(db, "restaurant_public/canon-1"), {followerCount: 9999}));
});

test("visible menu comments are readable; removed ones + writes are denied", async () => {
  await seed("menu_comments/c-visible", {canonicalPlaceId: "canon-1", menuItemId: "m1", status: "visible", text: "sedap"});
  await seed("menu_comments/c-removed", {canonicalPlaceId: "canon-1", menuItemId: "m1", status: "removed", text: "gone"});
  const db = env.authenticatedContext("user-1").firestore();
  await assertSucceeds(getDoc(doc(db, "menu_comments/c-visible")));
  await assertFails(getDoc(doc(db, "menu_comments/c-removed")));
  await assertFails(updateDoc(doc(db, "menu_comments/c-visible"), {text: "tamper"}));
  await assertFails(deleteDoc(doc(db, "menu_comments/c-visible")));
});
