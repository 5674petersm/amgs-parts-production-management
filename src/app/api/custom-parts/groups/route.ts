import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/api-auth";
import { approveCustomPartGroup, clearCustomPartGroup } from "@/lib/custom-parts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authResult = await requirePermission("customParts");
  if ("response" in authResult) return authResult.response;
  try {
    const body = await request.json() as { customPartIds?: unknown };
    const ids = Array.isArray(body.customPartIds)
      ? body.customPartIds.map(Number).filter(Number.isInteger)
      : [];
    const result = await approveCustomPartGroup(ids, authResult.email);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to group these parts.",
    }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const authResult = await requirePermission("customParts");
  if ("response" in authResult) return authResult.response;
  try {
    const body = await request.json() as { groupId?: string };
    const groupId = String(body.groupId || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(groupId)) {
      return NextResponse.json({ error: "Invalid group." }, { status: 400 });
    }
    const clearedCount = await clearCustomPartGroup(groupId);
    return NextResponse.json({ ok: true, clearedCount });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to ungroup these parts.",
    }, { status: 400 });
  }
}
