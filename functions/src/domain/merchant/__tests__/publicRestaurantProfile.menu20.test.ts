import assert from "node:assert/strict";
import {test} from "node:test";

import {projectPublicRestaurantProfileV2} from "../publicRestaurantProfile";

const canonicalId = "CCM-puncak-alam-test";

function item(section: "makanan" | "minuman", index: number) {
  return {
    id: `${section}-${index}`,
    section,
    category: section === "makanan" ? "Makanan" : "Minuman",
    name: section === "makanan" ? `Makanan ${index}` : `Minuman ${index}`,
    description: `Item ujian ${index}`,
    price: 5 + index,
    currency: "MYR",
    available: true,
    sortOrder: index * 10,
  };
}

test("master publication exposes exactly 12 Makanan plus 8 Minuman without truncation", () => {
  const menuItems = [
    ...Array.from({length: 12}, (_, index) => item("makanan", index + 1)),
    ...Array.from({length: 8}, (_, index) => item("minuman", index + 13)),
  ];

  const result = projectPublicRestaurantProfileV2({
    publicationStatus: "published",
    versionNumber: 2,
    name: "MakanMana Test Kitchen Puncak Alam",
    address: "Puncak Alam, Selangor",
    lat: 3.22,
    lng: 101.43,
    businessState: "active",
    menuItems,
  }, canonicalId);

  assert.ok(result);
  assert.equal(result.canonicalPlaceId, canonicalId);
  assert.equal(result.menuItems.length, 20);
  assert.equal(result.menuItems.filter((menu) => menu.section === "makanan").length, 12);
  assert.equal(result.menuItems.filter((menu) => menu.section === "minuman").length, 8);
  assert.deepEqual(result.menuItems.map((menu) => menu.id), menuItems.map((menu) => menu.id));
});
