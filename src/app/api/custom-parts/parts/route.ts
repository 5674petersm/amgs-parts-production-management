import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/api-auth";
import { listCustomPartsByOrder } from "@/lib/custom-parts";

export async function GET(request: Request) {
  const authResult = await requirePermission("production");
  if ("response" in authResult) {
    return authResult.response;
  }

  const { searchParams } = new URL(request.url);
  const order = searchParams.get("order")?.trim() ?? "";

  if (!order) {
    return NextResponse.json(
      { error: "AMGS order number is required." },
      { status: 400 },
    );
  }

  try {
    const parts = await listCustomPartsByOrder(order);
    return NextResponse.json({ parts });
  } catch (error) {
    console.error("GET /api/custom-parts/parts", error);
    const message =
      error instanceof Error ? error.message : "Unable to load custom parts.";
    const status = message.includes("required") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
