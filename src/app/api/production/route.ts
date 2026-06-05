import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { STATIONS, LOCATION_TYPES } from "@/constants/stations";
import { recordProduction } from "@/lib/production";
import type { ProductionSource } from "@/types";

export async function POST(request: Request) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    itemId?: number;
    masterPNo?: string;
    qty?: number;
    opStation?: string;
    locationType?: string;
    locationNo?: number;
    source?: ProductionSource;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const qty = Number(body.qty);
  const locationNo = Number(body.locationNo);
  const itemId = Number(body.itemId);
  const masterPNo = body.masterPNo?.trim() ?? "";
  const opStation = body.opStation?.trim() ?? "";
  const locationType = body.locationType;
  const source = body.source;

  if (!itemId || !masterPNo) {
    return NextResponse.json({ error: "Part reference is missing." }, { status: 400 });
  }

  if (!Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json(
      { error: "Quantity must be a positive number." },
      { status: 400 },
    );
  }

  if (!STATIONS.includes(opStation as (typeof STATIONS)[number])) {
    return NextResponse.json({ error: "Invalid station." }, { status: 400 });
  }

  if (
    !locationType ||
    !LOCATION_TYPES.includes(locationType as (typeof LOCATION_TYPES)[number])
  ) {
    return NextResponse.json({ error: "Select cart or bin." }, { status: 400 });
  }

  if (!Number.isInteger(locationNo) || locationNo < 1 || locationNo > 50) {
    return NextResponse.json(
      { error: "Location number must be between 1 and 50." },
      { status: 400 },
    );
  }

  if (source !== "QR" && source !== "Manual") {
    return NextResponse.json({ error: "Invalid source." }, { status: 400 });
  }

  try {
    const result = await recordProduction(
      {
        itemId,
        masterPNo,
        qty: Math.trunc(qty),
        opStation,
        locationType: locationType as "Cart" | "Bin",
        locationNo,
        source,
      },
      userEmail,
    );

    return NextResponse.json({
      ok: true,
      newTotalQty: result.newTotalQty,
    });
  } catch (error) {
    console.error("POST /api/production", error);
    return NextResponse.json(
      { error: "Unable to record production. Please try again." },
      { status: 500 },
    );
  }
}
