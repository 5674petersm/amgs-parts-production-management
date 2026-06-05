import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getStockByItemId, getStockByMasterPNo } from "@/lib/stock";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const item =
      itemId !== undefined && (!masterPNo || masterPNo.length === 0)
        ? await getStockByItemId(itemId)
        : masterPNo
          ? await getStockByMasterPNo(masterPNo)
          : null;

    if (!item) {
      return NextResponse.json({ error: "Part not found." }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error("POST /api/parts/lookup", error);
    return NextResponse.json(
      { error: "Unable to look up part." },
      { status: 500 },
    );
  }
}
