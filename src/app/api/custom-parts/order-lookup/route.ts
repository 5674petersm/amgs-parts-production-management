import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/api-auth";
import { lookupCustomPartOrder } from "@/lib/custom-parts";

export async function GET(request: Request) {
  const authResult = await requirePermission("customParts");
  if ("response" in authResult) {
    return authResult.response;
  }

  const { searchParams } = new URL(request.url);
  const amgsOrderNumber = searchParams.get("order")?.trim() ?? "";

  if (!amgsOrderNumber) {
    return NextResponse.json(
      { error: "AMGS order number is required." },
      { status: 400 },
    );
  }

  try {
    const lookup = await lookupCustomPartOrder(amgsOrderNumber);
    return NextResponse.json(lookup);
  } catch (error) {
    console.error("GET /api/custom-parts/order-lookup", error);
    const message =
      error instanceof Error ? error.message : "Unable to look up order.";
    const status = message.includes("required") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
