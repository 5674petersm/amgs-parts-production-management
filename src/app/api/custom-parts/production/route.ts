import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/api-auth";
import { STATIONS, LOCATION_TYPES } from "@/constants/stations";
import { recordCustomProduction } from "@/lib/custom-production";
import type { ProductionSource } from "@/types";

export async function POST(request: Request) {
  const authResult = await requirePermission("production");
  if ("response" in authResult) {
    return authResult.response;
  }
  const userEmail = authResult.email;

  let body: {
    customPartId?: number;
    partNumber?: string;
    qty?: number;
    opStation?: string;
    partComplete?: boolean;
    locationType?: string;
    locationNo?: number;
    source?: ProductionSource;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const customPartId = Number(body.customPartId);
  const qty = Number(body.qty);
  const locationNo = Number(body.locationNo);
  const partNumber = body.partNumber?.trim() ?? "";
  const opStation = body.opStation?.trim() ?? "";
  const locationType = body.locationType;
  const source = body.source;
  const partComplete = body.partComplete === true;

  if (!customPartId || !partNumber) {
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
    const result = await recordCustomProduction(
      {
        customPartId,
        partNumber,
        qty: Math.trunc(qty),
        opStation,
        partComplete,
        locationType: locationType as "Cart" | "Bin",
        locationNo,
        source,
      },
      userEmail,
    );

    return NextResponse.json({
      ok: true,
      totalProduced: result.totalProduced,
      qtyNeeded: result.qtyNeeded,
      partComplete: result.partComplete,
      completedAt: result.completedAt,
      lineMarkedComplete: result.lineMarkedComplete,
    });
  } catch (error) {
    console.error("POST /api/custom-parts/production", error);
    const message =
      error instanceof Error ? error.message : "Unable to record production.";
    const status = message.includes("not found") || message.includes("does not match")
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
