import { NextResponse } from "next/server";

import { STATIONS } from "@/constants/stations";
import { requireAnyPermission, requirePermission } from "@/lib/api-auth";
import { parseItemIdFromQrKey } from "@/lib/parse-qr";
import { getStockByItemId, updateStockItem } from "@/lib/stock";

type RouteContext = {
  params: Promise<{ partNumber: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireAnyPermission(["production", "editParts"]);
  if ("response" in authResult) {
    return authResult.response;
  }
  const { partNumber } = await context.params;
  const decoded = decodeURIComponent(partNumber).trim();

  if (!decoded) {
    return NextResponse.json({ error: "Item ID is required." }, { status: 400 });
  }

  const itemId = parseItemIdFromQrKey(decoded);
  if (itemId === null) {
    return NextResponse.json({ error: "Enter a valid item ID." }, { status: 400 });
  }

  try {
    const item = await getStockByItemId(itemId);
    if (!item) {
      return NextResponse.json({ error: "Part not found." }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error("GET /api/parts/[partNumber]", error);
    return NextResponse.json(
      { error: "Unable to load part information." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const authResult = await requirePermission("editParts");
  if ("response" in authResult) {
    return authResult.response;
  }

  const { partNumber } = await context.params;
  const decoded = decodeURIComponent(partNumber).trim();

  if (!decoded) {
    return NextResponse.json({ error: "Item ID is required." }, { status: 400 });
  }

  const itemId = parseItemIdFromQrKey(decoded);
  if (itemId === null) {
    return NextResponse.json({ error: "Enter a valid item ID." }, { status: 400 });
  }

  let body: {
    masterPNo?: string;
    itemDescription?: string;
    finalStation?: string | null;
    totalQty?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const masterPNo = body.masterPNo?.trim() ?? "";
  if (!masterPNo) {
    return NextResponse.json(
      { error: "Part number is required." },
      { status: 400 },
    );
  }

  const itemDescription = body.itemDescription?.trim() ?? "";
  if (!itemDescription) {
    return NextResponse.json(
      { error: "Description is required." },
      { status: 400 },
    );
  }

  const finalStationRaw = body.finalStation;
  const finalStation =
    finalStationRaw === null || finalStationRaw === undefined
      ? null
      : finalStationRaw.trim();

  if (
    finalStation &&
    !STATIONS.includes(finalStation as (typeof STATIONS)[number])
  ) {
    return NextResponse.json({ error: "Invalid final station." }, { status: 400 });
  }

  if (body.totalQty !== undefined) {
    const totalQty = Number(body.totalQty);
    if (!Number.isFinite(totalQty) || totalQty < 0) {
      return NextResponse.json(
        { error: "Qty on hand must be zero or greater." },
        { status: 400 },
      );
    }
  }

  try {
    const item = await updateStockItem(
      itemId,
      {
        masterPNo,
        itemDescription,
        finalStation: finalStation || null,
        totalQty:
          body.totalQty !== undefined ? Number(body.totalQty) : undefined,
      },
      authResult.email,
    );

    if (!item) {
      return NextResponse.json({ error: "Part not found." }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error("PATCH /api/parts/[partNumber]", error);
    const message =
      error instanceof Error ? error.message : "Unable to update part.";
    const status = message === "Part number already in use." ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
