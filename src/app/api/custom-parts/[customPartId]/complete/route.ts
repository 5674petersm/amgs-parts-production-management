import { NextResponse } from "next/server";

import { optionalAuthEmail } from "@/lib/api-auth";
import { completeCustomPart } from "@/lib/custom-part-completion";

type RouteContext = { params: Promise<{ customPartId: string }> };

export const maxDuration = 120;

export async function POST(_request: Request, context: RouteContext) {
  const { customPartId: rawId } = await context.params;
  const customPartId = Number(rawId);
  if (!Number.isInteger(customPartId) || customPartId <= 0) {
    return NextResponse.json({ error: "Invalid custom part." }, { status: 400 });
  }

  const completedBy = await optionalAuthEmail();
  try {
    return NextResponse.json({ ok: true, ...(await completeCustomPart(customPartId, completedBy)) });
  } catch (error) {
    console.error(`POST /api/custom-parts/${customPartId}/complete`, error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to complete this custom part.",
    }, { status: 500 });
  }
}
