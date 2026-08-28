import { NextResponse } from "next/server";

import { requireAuthOrShopFloor } from "@/lib/api-auth";
import { getPartLibraryItem } from "@/lib/custom-part-library";
import { listActiveLibraryPartCopies } from "@/lib/custom-parts";
import { syncLibraryPartDrawingsToFolder } from "@/lib/google-drive";
import { getShopFloorOrders } from "@/lib/shop-floor-orders";

export const maxDuration = 120;

export async function POST(request: Request) {
  const authResult = await requireAuthOrShopFloor(request);
  if ("response" in authResult) return authResult.response;
  let body: { libraryPartId?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const libraryPartId = Number(body.libraryPartId);
  if (!Number.isInteger(libraryPartId) || libraryPartId <= 0) {
    return NextResponse.json({ error: "Valid library part is required." }, { status: 400 });
  }
  try {
    const [libraryPart, copies, orders] = await Promise.all([
      getPartLibraryItem(libraryPartId), listActiveLibraryPartCopies(libraryPartId), getShopFloorOrders(),
    ]);
    if (!libraryPart) return NextResponse.json({ error: "Library part not found." }, { status: 404 });
    const activeOrderNumbers = new Set(orders.orders.map((order) => order.order));
    const activeCopies = copies.filter((copy) => activeOrderNumbers.has(copy.orderNumber));
    const errors: string[] = [];
    let updatedCopies = 0;
    for (const copy of activeCopies) {
      try {
        await syncLibraryPartDrawingsToFolder({
          sourceLibraryFolderId: libraryPart.driveFolderId,
          targetCustomPartFolderId: copy.driveFolderId,
        });
        updatedCopies += 1;
      } catch (error) {
        errors.push(`${copy.partNumber}: ${error instanceof Error ? error.message : "Unable to update drawings."}`);
      }
    }
    return NextResponse.json({
      ok: errors.length === 0,
      updatedCopies,
      skippedClosedCopies: copies.length - activeCopies.length,
      errors,
    });
  } catch (error) {
    console.error(`Sync assigned copies for library part ${libraryPartId}`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update assigned copies." }, { status: 500 });
  }
}
