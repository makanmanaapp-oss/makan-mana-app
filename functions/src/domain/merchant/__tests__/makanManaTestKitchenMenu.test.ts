import assert from "node:assert/strict";
import test from "node:test";

import {projectPublicRestaurantProfileV2} from "../publicRestaurantProfile";

const canonicalId = "CCM-test-kitchen-puncak-alam";

const menuItems = [
  {section: "makanan", name: "Nasi Lemak Ayam Berempah", price: 12.90},
  {section: "makanan", name: "Nasi Goreng Kampung", price: 10.90},
  {section: "makanan", name: "Nasi Goreng Ayam", price: 11.90},
  {section: "makanan", name: "Mee Goreng Mamak", price: 9.90},
  {section: "makanan", name: "Kuey Teow Goreng", price: 10.90},
  {section: "makanan", name: "Bihun Goreng Kampung", price: 9.50},
  {section: "makanan", name: "Chicken Chop", price: 15.90},
  {section: "makanan", name: "Nasi Ayam Crispy", price: 13.90},
  {section: "makanan", name: "Roti Bakar Kaya Butter", price: 4.90},
  {section: "makanan", name: "Keropok Lekor", price: 6.90},
  {section: "makanan", name: "Cucur Udang", price: 7.90},
  {section: "makanan", name: "Kentang Goreng", price: 6.50},
  {section: "minuman", name: "Teh Ais", price: 3.50},
  {section: "minuman", name: "Teh O Ais Limau", price: 3.80},
  {section: "minuman", name: "Milo Ais", price: 4.00},
  {section: "minuman", name: "Kopi O", price: 2.80},
  {section: "minuman", name: "Kopi Susu", price: 3.20},
  {section: "minuman", name: "Sirap Limau", price: 3.00},
  {section: "minuman", name: "Limau Ais", price: 3.20},
  {section: "minuman", name: "Air Mineral", price: 2.00},
].map((item, index) => ({
  id: `qa-menu-${index + 1}`,
  category: "",
  description: "",
  currency: "MYR",
  available: true,
  imageUrl: "",
  sortOrder: index * 10,
  ...item,
}));

test("MakanMana Test Kitchen active publication projects exactly 20 menu items (12 food + 8 drinks)", () => {
  const result = projectPublicRestaurantProfileV2({
    publicationStatus: "published",
    versionNumber: 3,
    name: "MakanMana Test Kitchen Puncak Alam",
    branchName: "Puncak Alam",
    address: "Bandar Puncak Alam, Selangor, 42300, Malaysia",
    latitude: 3.23890,
    longitude: 101.42793,
    primaryCategory: "Malaysian Food",
    businessStatus: "active",
    menuItems,
  }, canonicalId);

  assert.ok(result);
  assert.equal(result.name, "MakanMana Test Kitchen Puncak Alam");
  assert.equal(result.menuItems.length, 20);
  assert.equal(result.menuItems.filter((item) => item.section === "makanan").length, 12);
  assert.equal(result.menuItems.filter((item) => item.section === "minuman").length, 8);
  assert.equal(result.menuItems[0].name, "Nasi Lemak Ayam Berempah");
  assert.equal(result.menuItems[0].price, 12.90);
  assert.equal(result.menuItems[11].name, "Kentang Goreng");
  assert.equal(result.menuItems[12].name, "Teh Ais");
  assert.equal(result.menuItems[19].name, "Air Mineral");
  assert.equal(result.menuItems[19].price, 2.00);
});
