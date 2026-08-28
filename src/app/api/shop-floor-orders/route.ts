import { NextRequest, NextResponse } from "next/server";

import { getShopFloorOrders } from "@/lib/shop-floor-orders";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
    return NextResponse.json(await getShopFloorOrders(forceRefresh));
  } catch (error) {
    console.error("GET /api/shop-floor-orders", error);
    return NextResponse.json(
      { error: "The production log is temporarily unavailable." },
      { status: 502 },
    );
  }
}
