export const CUSTOM_PART_MATERIALS = [
  "10G",
  "14G",
  "16G",
  "1/4",
  "3/8",
  "1/2",
  "1x1\"",
  "2x2\"",
  "3x3\"",
  "Aluminum",
] as const;

export type CustomPartMaterial = (typeof CUSTOM_PART_MATERIALS)[number];

export function isCustomPartMaterial(
  value: string,
): value is CustomPartMaterial {
  return (CUSTOM_PART_MATERIALS as readonly string[]).includes(value);
}
