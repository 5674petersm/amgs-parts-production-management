import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/api-auth";
import { getStockInventoryStatus } from "@/lib/dashboard-inventory";

export async function GET(request: Request) {
  const authResult = await requirePermission("dashboards");
  if ("response" in authResult) {
    return authResult.response;
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const finalStation = searchParams.get("station")?.trim() ?? "";
  const shortfallOnly = searchParams.get("shortfallOnly") === "1";

  try {
    const result = await getStockInventoryStatus({
      search,
      finalStation,
      shortfallOnly,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/dashboard/inventory", error);
    const message =
      error instanceof Error ? error.message : "Unable to load inventory status.";
    const status = message.includes("Invalid") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
