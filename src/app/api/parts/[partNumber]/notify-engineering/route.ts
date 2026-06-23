import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/api-auth";
import { notifyEngineeringMissingFinalStation } from "@/lib/engineering-notify";
import { parseItemIdFromQrKey } from "@/lib/parse-qr";
import { getStockByItemId } from "@/lib/stock";

type RouteContext = {
  params: Promise<{ partNumber: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const authResult = await requirePermission("production");
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

    if (item.finalStation) {
      return NextResponse.json(
        { error: "This part already has a final station assigned." },
        { status: 400 },
      );
    }

    await notifyEngineeringMissingFinalStation({
      item,
      reportedBy: authResult.email,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/parts/[partNumber]/notify-engineering", error);
    const message =
      error instanceof Error ? error.message : "Unable to send notification.";
    const status = message.includes("not configured") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
