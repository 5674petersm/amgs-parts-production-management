import { NextResponse } from "next/server";

import { listCustomPartOrders } from "@/lib/custom-parts";

export async function GET() {
  try {
    const orders = await listCustomPartOrders();
    return NextResponse.json({ orders });
  } catch (error) {
    console.error("GET /api/custom-parts/orders", error);
    return NextResponse.json(
      { error: "Unable to load custom part orders." },
      { status: 500 },
    );
  }
}
