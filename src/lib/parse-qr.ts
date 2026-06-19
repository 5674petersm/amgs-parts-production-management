/** Extract MasterPNo from a production QR (full URL or bare part number). */
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
    // Not a URL — treat as bare part number if it looks reasonable
  }

  if (!/\s/.test(trimmed) && trimmed.length <= 50) {
    return trimmed;
  }

  return null;
}

/** Scanned code for custom-part production (bare "custom" or /p/custom URL). */
export function isCustomPartQr(value: string): boolean {
  return value.trim().toLowerCase() === "custom";
}
