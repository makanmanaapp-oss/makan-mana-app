/**
 * QA SEED — fictional shops for the featured-shop banner.
 *
 * ISOLATION. This talks to the Firestore EMULATOR only. It refuses to run
 * unless FIRESTORE_EMULATOR_HOST is set and the project id starts with
 * `demo-`, because a seeder that can reach production is one environment
 * variable away from writing invented restaurants into the real registry.
 *
 * Every shop below is FICTIONAL. The names are deliberately obvious inventions
 * so a screenshot can never be mistaken for real registry data, and one of them
 * exists specifically to prove the honesty rules:
 *
 *   PLC-QA-1  complete       — name, photo, address, real rating
 *   PLC-QA-2  no photo       — must render a monogram, not a broken image
 *   PLC-QA-3  rating 0 count — must render NO rating at all
 *   PLC-QA-4  very long name — must wrap and ellipsise, never overflow
 *   PLC-QA-5  no head        — NOT publishable: proves a takedown disappears
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *   node scripts/qa/seed_featured_shops.mjs demo-makanmana-qa
 */

import {initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";

const projectId = process.argv[2] ?? process.env.GCLOUD_PROJECT ?? "";
const emulator = process.env.FIRESTORE_EMULATOR_HOST ?? "";

if (!emulator) {
  console.error("REFUSING: FIRESTORE_EMULATOR_HOST is not set.");
  process.exit(1);
}
if (!projectId.startsWith("demo-")) {
  console.error(`REFUSING: project "${projectId}" is not a demo- project.`);
  process.exit(1);
}

initializeApp({projectId});
const db = getFirestore();

// A host that serves plain images to any client. Wikimedia was tried first
// and returns 403 to a generic user agent, which the app correctly showed
// as a monogram rather than a broken image — right behaviour, wrong
// fixture for proving the PHOTO path.
const PHOTO = "https://picsum.photos/seed/makanmana-qa/640/400";
const PHOTO2 = "https://picsum.photos/seed/makanmana-qa-2/640/400";

const SHOPS = [
  {
    id: "PLC-QA-1",
    head: true,
    details: {
      displayName: "Warung Ujian Satu",
      photoUrl: PHOTO,
      formattedAddress: "1 Jalan Ujian, Shah Alam, Selangor",
      rating: 4.4,
      userRatingCount: 231,
    },
  },
  {
    id: "PLC-QA-2",
    head: true,
    // No photoUrl at all -> monogram.
    details: {
      displayName: "Kedai Ujian Tanpa Foto",
      formattedAddress: "2 Jalan Ujian, Petaling Jaya, Selangor",
      rating: 4.1,
      userRatingCount: 88,
    },
  },
  {
    id: "PLC-QA-3",
    head: true,
    // A score with nothing behind it is not a rating -> nothing must render.
    details: {
      displayName: "Restoran Ujian Tanpa Rating",
      photoUrl: PHOTO2,
      formattedAddress: "3 Jalan Ujian, Klang, Selangor",
      rating: 4.9,
      userRatingCount: 0,
    },
  },
  {
    id: "PLC-QA-4",
    head: true,
    details: {
      displayName:
        "Restoran Ujian Nasi Kandar Pulau Pinang Cawangan Seksyen Tiga Belas Shah Alam",
      photoUrl: PHOTO,
      formattedAddress:
        "4 Jalan Ujian Yang Sangat Panjang Sekali, Seksyen 13, Shah Alam, Selangor",
      rating: 3.8,
      userRatingCount: 1204,
    },
  },
  {
    id: "PLC-QA-5",
    // NO publication head: identity cannot be proven, so this shop must never
    // appear even though a banner and a collection both reference it.
    head: false,
    details: {
      displayName: "Kedai Ujian Yang Sudah Ditutup",
      photoUrl: PHOTO,
      formattedAddress: "5 Jalan Ujian, Kuala Lumpur",
      rating: 4.7,
      userRatingCount: 300,
    },
  },
];

const HOUR = 60 * 60 * 1000;
const now = Date.now();

async function main() {
  const batch = db.batch();

  for (const shop of SHOPS) {
    batch.set(db.collection("place_details").doc(shop.id), shop.details);
    if (shop.head) {
      // What `resolveProvenCanonicalRestaurantPlaceId` looks for.
      batch.set(db.collection("place_publication_heads").doc(shop.id), {
        activePublicationId: `pub-${shop.id}`,
        canonicalPlaceId: shop.id,
      });
    }
  }

  // ── Home banner: a featured shop ──────────────────────────────────────────
  batch.set(db.collection("cms_content").doc("qa-home-shop"), {
    schemaVersion: 1,
    placement: "home_top",
    title: "PILIHAN MINGGU INI",
    subtitle: "Set sarapan bermula RM6 sehingga hujung bulan.",
    body: "",
    ctaLabel: "",
    ctaDestination: "",
    media: null,
    targeting: {kind: "all", values: []},
    priority: 1,
    startsAtMs: now - HOUR,
    endsAtMs: now + 30 * 24 * HOUR,
    status: "active",
    canonicalPlaceId: "PLC-QA-1",
    // Editorial: the app must attribute it, not advertise it.
    sponsorship: "editorial",
  });

  // A second Home banner pointing at the UNPROVABLE shop. It must NOT render.
  batch.set(db.collection("cms_content").doc("qa-home-shop-gone"), {
    schemaVersion: 1,
    placement: "home_top",
    title: "SEPATUTNYA TIDAK MUNCUL",
    subtitle: "Kedai ini tiada publication head.",
    body: "",
    ctaLabel: "",
    ctaDestination: "",
    media: null,
    targeting: {kind: "all", values: []},
    priority: 2,
    startsAtMs: now - HOUR,
    endsAtMs: now + 30 * 24 * HOUR,
    status: "active",
    canonicalPlaceId: "PLC-QA-5",
  });

  // An ORDINARY editorial banner, to prove the old card still works untouched.
  batch.set(db.collection("cms_content").doc("qa-home-editorial"), {
    schemaVersion: 1,
    placement: "home_mid",
    title: "Banner editorial biasa",
    subtitle: "Tiada kedai dinamakan — kad lama, tidak berubah.",
    body: "",
    ctaLabel: "Terokai",
    ctaDestination: "/explore",
    media: null,
    targeting: {kind: "all", values: []},
    priority: 1,
    startsAtMs: now - HOUR,
    endsAtMs: now + 30 * 24 * HOUR,
    status: "active",
    canonicalPlaceId: null,
  });

  // ── Explore carousel: several shops, including the two honesty cases and
  //    the unprovable one, which must silently drop out of the row.
  batch.set(db.collection("cms_collections").doc("qa-explore-row"), {
    schemaVersion: 1,
    placement: "explore_top",
    title: "Kedai ujian pilihan",
    description: "Barisan kurasi untuk QA.",
    imagePath: null,
    canonicalPlaceIds: [
      "PLC-QA-1", "PLC-QA-2", "PLC-QA-3", "PLC-QA-4", "PLC-QA-5",
    ],
    targeting: {kind: "all", values: []},
    priority: 1,
    startsAtMs: now - HOUR,
    endsAtMs: now + 30 * 24 * HOUR,
    status: "active",
    // PAID: proves "Tajaan" appears only where somebody declared it.
    sponsorship: "paid",
  });

  await batch.commit();

  console.log(`Seeded into ${projectId} via ${emulator}`);
  console.log(`  place_details          : ${SHOPS.length}`);
  console.log(`  publication heads      : ${SHOPS.filter((s) => s.head).length}`);
  console.log("  cms_content            : 3 (1 shop, 1 unprovable, 1 editorial)");
  console.log("  cms_collections        : 1 (5 members, 1 unprovable)");
  console.log("");
  console.log("EXPECTED on device:");
  console.log("  Home  : ONE shop banner BETWEEN 'Near you' and 'Fit Coach'");
  console.log("          Warung Ujian Satu, 4.4 (231), 'Pilihan MakanMana'");
  console.log("  Home  : the PLC-QA-5 banner must NOT appear");
  console.log("  Home  : the editorial banner renders as before");
  console.log("  Explore: a row of FOUR tiles (QA-5 dropped)");
  console.log("           QA-2 monogram, QA-3 no rating, QA-4 name clipped");
  console.log("           row is PAID -> 'Tajaan'");
}

main().catch((error) => {
  console.error("seed failed:", error);
  process.exit(1);
});
