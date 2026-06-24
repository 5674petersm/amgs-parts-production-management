/** Extract the /p/{key} segment from a production QR (full URL or bare value). */
export function parsePartFromQr(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const pathMatch = trimmed.match(/\/p\/([^/?#]+)/i);
  if (pathMatch) {
    return decodeURIComponent(pathMatch[1]).trim();
  }

  try {
    const url = new URL(trimmed);
    const fromUrl = url.pathname.match(/\/p\/([^/]+)/i);
    if (fromUrl) {
      return decodeURIComponent(fromUrl[1]).trim();
    }
  } catch {
    // Not a URL — treat as bare item ID if it looks reasonable
  }

  if (!/\s/.test(trimmed) && trimmed.length <= 50) {
    return trimmed;
  }

  return null;
}

/** Item ID from /p/{itemId} or a bare numeric standard-part QR. */
export function parseItemIdFromQrKey(key: string): number | null {
  const trimmed = key.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const itemId = Number(trimmed);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return null;
  }

  return itemId;
}

export function parseItemIdFromQr(raw: string): number | null {
  const key = parsePartFromQr(raw);
  if (!key || isCustomPartQr(key)) {
    return null;
  }

  return parseItemIdFromQrKey(key);
}

/** Scanned code for custom-part production (bare "custom" or /p/custom URL). */
export function isCustomPartQr(value: string): boolean {
  return value.trim().toLowerCase() === "custom";
}
