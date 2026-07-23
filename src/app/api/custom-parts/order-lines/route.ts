import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/api-auth";
import { getShopFloorOrderDetail } from "@/lib/shop-floor-orders";

export async function GET(request: Request) {
  const authResult = await requirePermission("customParts");
  if ("response" in authResult) return authResult.response;
  const order = new URL(request.url).searchParams.get("order")?.trim() || "";
  if (!order) return NextResponse.json({ error: "Order number is required." }, { status: 400 });
  try {
    const detail = await getShopFloorOrderDetail(order);
    return NextResponse.json({ lines: detail.lines.map((line) => ({
      rowId: line.rowId,
      lineNumber: line.lineNumber,
      partNumber: line.partNumber,
      description: line.description,
      notes: line.notes,
    })) });
  } catch (error) {
    console.error(`GET custom part order lines ${order}`, error);
    return NextResponse.json({ error: "Unable to load order lines." }, { status: 502 });
  }
}
