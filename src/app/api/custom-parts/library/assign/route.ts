import { NextResponse } from "next/server";

import { requireAuthOrShopFloor } from "@/lib/api-auth";
import { getPartLibraryItem } from "@/lib/custom-part-library";
import { assignLibraryPartToOrder } from "@/lib/library-part-assignment";
import { getShopFloorOrders, validateCustomPartLineMappings } from "@/lib/shop-floor-orders";

export const maxDuration = 120;

export async function POST(request: Request) {
  const authResult = await requireAuthOrShopFloor(request);
  if ("response" in authResult) return authResult.response;
  let body: { libraryPartId?: unknown; orderNumber?: unknown; qtyNeeded?: unknown; mappedOrderLineIds?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const libraryPartId = Number(body.libraryPartId);
  const orderNumber = String(body.orderNumber || "").trim();
  const qtyNeeded = Number(body.qtyNeeded);
  const mappedOrderLineIds = Array.isArray(body.mappedOrderLineIds)
    ? [...new Set(body.mappedOrderLineIds.map(String).map((value) => value.trim()).filter(Boolean))]
    : [];
  if (!Number.isInteger(libraryPartId) || libraryPartId <= 0 || !orderNumber || !Number.isInteger(qtyNeeded) || qtyNeeded <= 0) {
    return NextResponse.json({ error: "Choose a library part and order, and enter a positive quantity." }, { status: 400 });
  }
  try {
    const [libraryPart, orders] = await Promise.all([getPartLibraryItem(libraryPartId), getShopFloorOrders()]);
    if (!libraryPart) return NextResponse.json({ error: "Library part not found." }, { status: 404 });
    const order = orders.orders.find((item) => item.order === orderNumber);
    if (!order) return NextResponse.json({ error: "Choose an active production order." }, { status: 400 });
    await validateCustomPartLineMappings(orderNumber, mappedOrderLineIds);
    const assigned = await assignLibraryPartToOrder({
      libraryPart, orderNumber, customerName: order.customer, qtyNeeded,
      mappedOrderLineIds, submittedBy: authResult.email,
    });
    return NextResponse.json({ ok: true, customPartId: assigned.customPartId, partNumber: assigned.partNumber });
  } catch (error) {
    console.error("POST /api/custom-parts/library/assign", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to assign the library part." }, { status: 500 });
  }
}
