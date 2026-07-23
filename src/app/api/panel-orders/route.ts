import { NextResponse } from "next/server";

import { getPanelOrders } from "@/lib/panel-orders";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ orders: await getPanelOrders() });
  } catch (error) {
    console.error("GET /api/panel-orders", error);
    return NextResponse.json({ error: "Unable to load custom panel orders." }, { status: 500 });
  }
}
