import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getStockByMasterPNo } from "@/lib/stock";

type RouteContext = {
  params: Promise<{ partNumber: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { partNumber } = await context.params;
  const decoded = decodeURIComponent(partNumber).trim();

  if (!decoded) {
    return NextResponse.json({ error: "Part number is required." }, { status: 400 });
  }

  try {
    const item = await getStockByMasterPNo(decoded);
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
