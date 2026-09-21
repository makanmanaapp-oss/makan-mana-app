/**
 * FEATURED SHOP — the callable, exercised for real against the emulator.
 *
 * The unit tests prove the projection rules. This proves the whole path: a
 * signed-in client calls `getCmsContent`, the server resolves identity against
 * the seeded registry, and what comes back is what the app will render.
 *
 * It is the step that would have caught a wiring mistake no pure test can see —
 * a banner that resolves perfectly in isolation and still arrives empty.
 *
 * Run (from the repo root, with the emulators up and the seed applied):
 *   node rules_test/featured_shop_live.mjs demo-makanmana-qa
 */

import {initializeApp} from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
} from "firebase/auth";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from "firebase/functions";

const projectId = process.argv[2] ?? "demo-makanmana-qa";
if (!projectId.startsWith("demo-")) {
  console.error(`REFUSING: "${projectId}" is not a demo- project.`);
  process.exit(1);
}

const app = initializeApp({projectId, apiKey: "fake-api-key", appId: "1:1:web:1"});
const auth = getAuth(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", {disableWarnings: true});
// The callables are deployed to asia-southeast1, not the default region.
// Omitting it yields `functions/not-found`, which reads like a missing
// function rather than a misaddressed one.
const functions = getFunctions(app, "asia-southeast1");
connectFunctionsEmulator(functions, "127.0.0.1", 5001);

let failures = 0;
function check(label, condition, detail = "") {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  await signInAnonymously(auth);
  const call = httpsCallable(functions, "getCmsContent");

  // ── HOME ────────────────────────────────────────────────────────────────
  const home = (await call({placement: "home_top", language: "ms"})).data;
  const banners = home.content ?? [];

  console.log("\n── home_top ──");
  for (const b of banners) {
    console.log(`  ${b.contentId}  shop=${b.shop?.name ?? "—"}  -> ${b.shopDestination ?? "—"}`);
  }

  check("exactly one home shop banner survives", banners.length === 1,
    `got ${banners.length}`);
  const shopBanner = banners[0];
  check("it is the provable shop", shopBanner?.shop?.canonicalPlaceId === "PLC-QA-1");
  check("the REAL registry name is returned",
    shopBanner?.shop?.name === "Warung Ujian Satu",
    JSON.stringify(shopBanner?.shop?.name));
  check("the name is NOT the operator's headline",
    shopBanner?.shop?.name !== shopBanner?.title);
  check("destination is derived from the proven id",
    shopBanner?.shopDestination === "/restaurant/PLC-QA-1",
    String(shopBanner?.shopDestination));
  check("the rating is the earned one", shopBanner?.shop?.rating === 4.4 &&
    shopBanner?.shop?.ratingCount === 231);
  check("the address is returned",
    (shopBanner?.shop?.address ?? "").includes("Shah Alam"));
  check("a banner naming an UNPROVABLE shop is dropped",
    !banners.some((b) => b.contentId === "qa-home-shop-gone"));
  check("no opening status or distance is expressible",
    shopBanner?.shop && !("isOpen" in shopBanner.shop) &&
    !("distanceKm" in shopBanner.shop),
    JSON.stringify(Object.keys(shopBanner?.shop ?? {})));

  // ── HOME MID: the ordinary editorial banner is untouched ────────────────
  const mid = (await call({placement: "home_mid", language: "ms"})).data;
  const editorial = (mid.content ?? [])[0];
  console.log("\n── home_mid ──");
  console.log(`  ${editorial?.contentId}  shop=${editorial?.shop ?? "null"}`);
  check("an editorial banner still returns, with no shop",
    editorial?.contentId === "qa-home-editorial" && editorial?.shop === null);

  // ── EXPLORE: the carousel ───────────────────────────────────────────────
  const explore = (await call({
    placement: "explore_top", language: "ms", includeCollections: true,
  })).data;
  const collection = (explore.collections ?? [])[0];
  const shops = collection?.shops ?? [];

  console.log("\n── explore_top collection ──");
  for (const s of shops) {
    console.log(`  ${s.canonicalPlaceId}  ${s.name}`);
    console.log(`      photo=${s.photoUrl ? "yes" : "NONE"}  ` +
      `rating=${s.rating ?? "hidden"}  -> ${s.destination}`);
  }

  check("the collection is returned", !!collection);
  check("the unprovable member is dropped, the rest survive",
    shops.length === 4, `got ${shops.length}`);
  check("order is preserved exactly as curated",
    shops.map((s) => s.canonicalPlaceId).join(",") ===
      "PLC-QA-1,PLC-QA-2,PLC-QA-3,PLC-QA-4");
  check("a shop with no photo still has an identity",
    shops[1]?.name === "Kedai Ujian Tanpa Foto" && shops[1]?.photoUrl === null);
  check("a rating with zero reviews is NOT returned",
    shops[2]?.rating === null && shops[2]?.ratingCount === null,
    `rating=${shops[2]?.rating}`);
  check("every tile has its own correct destination",
    shops.every((s) => s.destination === `/restaurant/${s.canonicalPlaceId}`));
  check("no duplicate shop within the row",
    new Set(shops.map((s) => s.canonicalPlaceId)).size === shops.length);

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("live check failed:", error);
  process.exit(1);
});
