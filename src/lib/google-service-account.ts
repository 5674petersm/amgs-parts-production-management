import { readFileSync } from "node:fs";
import path from "node:path";

export function loadServiceAccountCredentials(): Record<string, unknown> {
  const jsonPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH?.trim();
  if (jsonPath) {
    const resolved = path.isAbsolute(jsonPath)
      ? jsonPath
      : path.join(process.cwd(), jsonPath);

    try {
      const raw = readFileSync(resolved, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error(
        `Could not read service account key at GOOGLE_SERVICE_ACCOUNT_JSON_PATH (${resolved}).`,
      );
    }
  }

  let json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!json) {
    throw new Error(
      "Google Drive is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON_PATH or GOOGLE_SERVICE_ACCOUNT_JSON.",
    );
  }

  if (
    (json.startsWith('"') && json.endsWith('"')) ||
    (json.startsWith("'") && json.endsWith("'"))
  ) {
    json = json.slice(1, -1);
  }

  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. Save your downloaded key file and set GOOGLE_SERVICE_ACCOUNT_JSON_PATH instead.",
    );
  }
}
