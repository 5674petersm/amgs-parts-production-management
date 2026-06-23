import { NextResponse } from "next/server";

import { requireAnyPermission } from "@/lib/api-auth";
import {
  getStockByItemId,
  getStockByMasterPNo,
  searchStockItems,
} from "@/lib/stock";

export async function POST(request: Request) {
  const authResult = await requireAnyPermission(["production", "editParts"]);
  if ("response" in authResult) {
    return authResult.response;
  }

  let body: { itemId?: number | string; masterPNo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const masterPNo = body.masterPNo?.trim();
  const itemIdRaw = body.itemId;
  const itemId =
    itemIdRaw === undefined || itemIdRaw === ""
      ? undefined
      : Number(itemIdRaw);

  if (!masterPNo && (itemId === undefined || !Number.isInteger(itemId) || itemId <= 0)) {
    return NextResponse.json(
      { error: "Enter a valid part number or item ID." },
      { status: 400 },
    );
  }

  try {
    if (itemId !== undefined && (!masterPNo || masterPNo.length === 0)) {
      const item = await getStockByItemId(itemId);
      if (!item) {
        return NextResponse.json({ error: "Part not found." }, { status: 404 });
      }
      return NextResponse.json(item);
    }

    if (masterPNo) {
      const exact = await getStockByMasterPNo(masterPNo);
      if (exact) {
        return NextResponse.json(exact);
      }

      const matches = await searchStockItems(masterPNo);
      if (matches.length === 0) {
        return NextResponse.json({ error: "Part not found." }, { status: 404 });
      }

      if (matches.length === 1) {
        return NextResponse.json(matches[0]);
      }

      return NextResponse.json({ matches });
    }

    return NextResponse.json({ error: "Part not found." }, { status: 404 });
  } catch (error) {
    console.error("POST /api/parts/lookup", error);
    return NextResponse.json(
      { error: "Unable to look up part." },
      { status: 500 },
    );
  }
}
