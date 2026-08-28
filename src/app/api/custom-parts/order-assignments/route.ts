import { NextResponse } from "next/server";

import { requireAuthOrShopFloor } from "@/lib/api-auth";
import { listCustomPartFilesForOrder } from "@/lib/google-drive";
import { getCustomPartLineMappings } from "@/lib/shop-floor-orders";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authResult = await requireAuthOrShopFloor(request);
  if ("response" in authResult) return authResult.response;
  const order = new URL(request.url).searchParams.get("order")?.trim() || "";
  if (!order) return NextResponse.json({ error: "Order number is required." }, { status: 400 });
  try {
    const [parts, mappings] = await Promise.all([
      listCustomPartFilesForOrder(order),
      getCustomPartLineMappings(order),
    ]);
    const mappingsByPart = new Map<string, string[]>();
    mappings.forEach((mapping) => mappingsByPart.set(mapping.customPartId, [
      ...(mappingsByPart.get(mapping.customPartId) || []), mapping.orderLineId,
    ]));
    return NextResponse.json({ parts: parts.map((part) => ({
      ...part,
      mappedOrderLineIds: mappingsByPart.get(String(part.customPartId)) || [],
    })) });
  } catch (error) {
    console.error(`GET custom-part assignments ${order}`, error);
    return NextResponse.json({ error: "Unable to load custom-part assignments." }, { status: 500 });
  }
}
