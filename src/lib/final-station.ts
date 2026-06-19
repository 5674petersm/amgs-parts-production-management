/** Whether this submit should update inventory (history + on-hand qty). */
export function shouldUpdateInventory(
  finalStation: string | null | undefined,
  opStation: string,
): boolean {
  const final = finalStation?.trim() ?? "";
  if (!final) {
    return true;
  }
  return opStation.trim() === final;
}
