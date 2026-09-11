import { NextResponse } from "next/server";

import { deleteShopFloorOrderDrawing, setShopFloorOrderDrawingSharing } from "@/lib/shop-floor-orders";

type RouteContext = { params: Promise<{ orderId: string; drawingId: string }> };

function drawingIdFrom(value: string): number {
  const drawingId = Number(value);
  if (!Number.isInteger(drawingId) || drawingId <= 0) throw new Error("Invalid order drawing.");
  return drawingId;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { orderId, drawingId: rawDrawingId } = await context.params;
  try {
    const body = await request.json() as { shareWithCustomer?: unknown };
    if (typeof body.shareWithCustomer !== "boolean") return NextResponse.json({ error: "A customer-sharing selection is required." }, { status: 400 });
    await setShopFloorOrderDrawingSharing({ orderId, drawingId: drawingIdFrom(rawDrawingId), shareWithCustomer: body.shareWithCustomer });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update the order drawing." }, { status: 502 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { orderId, drawingId: rawDrawingId } = await context.params;
  try {
    await deleteShopFloorOrderDrawing(orderId, drawingIdFrom(rawDrawingId));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete the order drawing." }, { status: 502 });
  }
}
