export const REGION = "asia-southeast1";

export const FREE_SPIN_LIMIT_PER_DAY = 3;

/** Versi algoritma semasa (dummy scoring; Google Places di Milestone 4). */
export const ALGORITHM_VERSION = "dummy_server_v1";

export const DEFAULT_ALGO_CONFIG_ID = "default_v1";

/** Pemberat skor lalai - dipakai penuh di Milestone 4. */
export const DEFAULT_WEIGHTS = {
  diet: 1.0,
  budget: 1.0,
  distance: 1.0,
  rating: 0.8,
  variety: 0.6,
  mood: 1.0,
  weather: 0.4,
  userPreference: 1.2,
  placePerformance: 0.8,
};
