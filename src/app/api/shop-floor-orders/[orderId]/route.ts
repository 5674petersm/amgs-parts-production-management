import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { listCustomPartFilesForOrder } from "@/lib/google-drive";
import { hasPermission } from "@/lib/permissions";
import {
  getShopFloorOrderDetail,
  getCustomPartLineMappings,
  setShopFloorLineComplete,
  setShopFloorLineProcess,
} from "@/lib/shop-floor-orders";

type RouteContext = { params: Promise<{ orderId: string }> };

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext) {
  const { orderId } = await context.params;
  try {
    const [detail, filesResult, mappings] = await Promise.all([
      getShopFloorOrderDetail(orderId),
      listCustomPartFilesForOrder(orderId).then(
        (files) => ({ files }),
        (error: unknown) => {
          console.error(`Custom part files unavailable for order ${orderId}`, error);
          return { files: [], filesError: "Custom part files are temporarily unavailable." };
        },
      ),
      getCustomPartLineMappings(orderId),
    ]);
    const mappingByPart = new Map<string, string[]>();
    mappings.forEach((mapping) => {
      const lines = mappingByPart.get(mapping.customPartId) ?? [];
      lines.push(mapping.orderLineId);
      mappingByPart.set(mapping.customPartId, lines);
    });
    return NextResponse.json({
      ...detail,
      ...filesResult,
      files: filesResult.files.map((file) => ({
        ...file,
        mappedOrderLineIds: mappingByPart.get(String(file.customPartId)) || [],
      })),
    });
  } catch (error) {
    console.error(`GET /api/shop-floor-orders/${orderId}`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load order details." },
      { status: 502 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { orderId } = await context.params;
  try {
    const body = (await request.json()) as { lineId?: string; checked?: boolean; process?: "weld" | "mesh" };
    const lineId = String(body.lineId ?? "").trim();
    if (!lineId || typeof body.checked !== "boolean") {
      return NextResponse.json({ error: "Line and completion state are required." }, { status: 400 });
    }
    const session = await auth();
    const role = session?.user?.role;
    const canCorrectCompletion = Boolean(role && hasPermission(role, "editParts"));
    if (body.process) {
      if (!(["weld", "mesh"] as const).includes(body.process)) {
        return NextResponse.json({ error: "Invalid line process." }, { status: 400 });
      }
      await setShopFloorLineProcess({ orderId, lineId, process: body.process, checked: body.checked });
      return NextResponse.json({ ok: true });
    }
    if (!body.checked && !canCorrectCompletion) {
      return NextResponse.json(
        { error: "Engineering clearance is required to undo completion." },
        { status: 403 },
      );
    }
    await setShopFloorLineComplete({
      orderId,
      lineId,
      checked: body.checked,
      allowCompletedClear: canCorrectCompletion,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`PATCH /api/shop-floor-orders/${orderId}`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update this line." },
      { status: 502 },
    );
  }
}
