import { NextResponse } from "next/server";

import { getShopFloorPartDemand } from "@/lib/shop-floor-orders";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ rows: await getShopFloorPartDemand() });
  } catch (error) {
    console.error("GET /api/parts-demand", error);
    return NextResponse.json({ error: "Unable to load part demand." }, { status: 500 });
  }
}
