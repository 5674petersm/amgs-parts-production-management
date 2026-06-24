export const STATIONS = [
  "Cut",
  "Drill/Tap",
  "Robotic Weld",
  "Manual Weld",
  "Wire Mesh Production",
  "Mesh To Frame Production",
  "Dragon",
  "Plasma",
] as const;

export type Station = (typeof STATIONS)[number];

export const LOCATION_TYPES = ["Cart", "Bin"] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const LOCATION_NUMBERS = Array.from({ length: 50 }, (_, i) => i + 1);
