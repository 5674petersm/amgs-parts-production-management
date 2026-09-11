import { NextResponse } from "next/server";

import { getShopFloorOrderDrawingFile } from "@/lib/shop-floor-orders";

type RouteContext = { params: Promise<{ orderId: string; drawingId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { orderId, drawingId: rawDrawingId } = await context.params;
  const drawingId = Number(rawDrawingId);
  if (!Number.isInteger(drawingId) || drawingId <= 0) return NextResponse.json({ error: "Invalid order drawing." }, { status: 400 });
  try {
    const file = await getShopFloorOrderDrawingFile(orderId, drawingId);
    return new NextResponse(file.bytes, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": file.contentDisposition,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Order drawing was not found." }, { status: 404 });
  }
}
