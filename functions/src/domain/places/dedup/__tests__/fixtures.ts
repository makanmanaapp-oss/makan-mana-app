/** Phase 1.4 — fixtures emas dedup (data rekaan, deterministik). */
import { buildIdentity, IdentityInput, NormalizedIdentity } from "../index";

export const T = 1_700_000_000_000;

const mk = (i: IdentityInput): NormalizedIdentity => buildIdentity(i);

// A — Google place sama daripada dua carian kawasan → exact provider id.
export const A_google1 = mk({
  displayName: "Nasi Kandar Deen",
  providerPlaceId: "ChIJ_deen",
  lat: 3.15,
  lng: 101.7,
  phones: ["03-1111 2222"],
  address: "Jalan Deen 1",
  postalCode: "50000",
});
export const A_google2 = mk({
  displayName: "Nasi Kandar Deen",
  providerPlaceId: "ChIJ_deen",
  lat: 3.15001,
  lng: 101.70001,
  phones: ["03-1111 2222"],
  address: "Jalan Deen 1",
  postalCode: "50000",
});

// B — Owner upload padan Google ikut telefon + lokasi.
export const B_google = mk({
  displayName: "Nasi Kandar Deen",
  providerPlaceId: "ChIJ_deen",
  lat: 3.15,
  lng: 101.7,
  phones: ["03-1111 2222"],
  address: "Jalan Deen 1",
  postalCode: "50000",
});
export const B_owner = mk({
  displayName: "Nasi Kandar Deen",
  lat: 3.15005,
  lng: 101.70005,
  phones: ["0311112222"],
  address: "Jalan Deen 1",
  postalCode: "50000",
});

// C — Jenama sama, cawangan mall berbeza (telefon berbeza).
export const C_mall1 = mk({
  displayName: "Kopitiam Ali",
  lat: 3.1,
  lng: 101.6,
  phones: ["03-3333 4444"],
  address: "Mid Valley Megamall",
  postalCode: "58000",
});
export const C_mall2 = mk({
  displayName: "Kopitiam Ali",
  lat: 3.2,
  lng: 101.7,
  phones: ["03-5555 6666"],
  address: "Sunway Pyramid",
  postalCode: "47500",
});

// D — Nama sama, negeri berbeza.
export const D_kl = mk({
  displayName: "Restoran Sedap",
  lat: 3.15,
  lng: 101.7,
  address: "Kuala Lumpur",
  postalCode: "50000",
});
export const D_penang = mk({
  displayName: "Restoran Sedap",
  lat: 5.41,
  lng: 100.33,
  address: "George Town",
  postalCode: "10000",
});

// E — Dinamakan semula di lokasi + telefon sama.
export const E_old = mk({
  displayName: "Old Name Cafe",
  lat: 3.15,
  lng: 101.7,
  phones: ["03-7777 8888"],
  address: "Jalan Baru 2",
  postalCode: "50000",
});
export const E_new = mk({
  displayName: "New Bistro House",
  lat: 3.15,
  lng: 101.7,
  phones: ["0377778888"],
  address: "Jalan Baru 2",
  postalCode: "50000",
});

// F — Restoran berpindah (nama + telefon sama, koordinat jauh).
export const F_before = mk({
  displayName: "Warung Pindah",
  lat: 3.15,
  lng: 101.7,
  phones: ["03-9999 0000"],
  address: "Lama Street",
  postalCode: "50000",
});
export const F_after = mk({
  displayName: "Warung Pindah",
  lat: 3.3,
  lng: 101.9,
  phones: ["0399990000"],
  address: "Baru Street",
  postalCode: "53000",
});

// H — Ejaan serupa + telefon sah sama.
export const H_a = mk({
  displayName: "Restoran Nasi Kandar Pelita",
  phones: ["03-1212 1212"],
  lat: 3.16,
  lng: 101.71,
});
export const H_b = mk({
  displayName: "Restauran Nasi Kandar Pellita",
  phones: ["0312121212"],
  lat: 3.16,
  lng: 101.71,
});

// Merchant id sama (test 2).
export const M_a = mk({ displayName: "Kedai Merchant", merchantRegistrationId: "SSM123", lat: 3.1, lng: 101.6 });
export const M_b = mk({ displayName: "Kedai Merchant Berbeza", merchantRegistrationId: "SSM123", lat: 3.9, lng: 101.9 });

// Nama sahaja (test 4).
export const N_a = mk({ displayName: "Warung Ali" });
export const N_b = mk({ displayName: "Warung Ali" });

// Nama+alamat+telefon tanpa koordinat (test 7).
export const G7_a = mk({ displayName: "Roti Canai Corner", phones: ["03-1313 1313"], address: "Jalan Roti 5 Ampang" });
export const G7_b = mk({ displayName: "Roti Canai Corner", phones: ["0313131313"], address: "Jalan Roti 5 Ampang" });

// Telefon berkonflik (test 8).
export const P_a = mk({ displayName: "Cafe Mocha", lat: 3.15, lng: 101.7, phones: ["03-1111 0000"] });
export const P_b = mk({ displayName: "Cafe Mocha", lat: 3.15009, lng: 101.70009, phones: ["03-2222 0000"] });

// Alamat berkonflik untuk penalti (test 9).
export const AC_a = mk({ displayName: "Warung Konflik", phones: ["03-1414 1414"], address: "Alpha Beta Gamma Road", lat: 3.15, lng: 101.7 });
export const AC_b = mk({ displayName: "Warung Konflik", phones: ["0314141414"], address: "Zulu Yankee Xray Street", lat: 3.9, lng: 101.9 });

// Benar-benar berasingan (test 19).
export const S_a = mk({ displayName: "Sushi Zen", lat: 3.1, lng: 101.6, phones: ["03-1010 1010"], address: "Alpha Road" });
export const S_b = mk({ displayName: "Burger Town", lat: 3.5, lng: 101.9, phones: ["03-2020 2020"], address: "Omega Street" });
