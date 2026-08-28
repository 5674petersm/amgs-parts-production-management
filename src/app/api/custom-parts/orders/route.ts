import { NextResponse } from "next/server";

import { listCustomPartOrderChoices } from "@/lib/custom-parts";

export async function GET() {
  try {
    const orderChoices = await listCustomPartOrderChoices();
    return NextResponse.json({
      orders: orderChoices.map((choice) => choice.order),
      orderChoices,
    });
  } catch (error) {
    console.error("GET /api/custom-parts/orders", error);
    return NextResponse.json(
      { error: "Unable to load custom part orders." },
      { status: 500 },
    );
  }
}
