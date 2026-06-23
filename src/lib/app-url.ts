export function getAppBaseUrl(): string {
  const url = process.env.AUTH_URL?.trim();
  if (!url) {
    throw new Error("AUTH_URL is not configured.");
  }
  return url.replace(/\/$/, "");
}

export function partEditUrl(itemId: number): string {
  return `${getAppBaseUrl()}/parts/edit?itemId=${itemId}`;
}
