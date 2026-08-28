import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/api-auth";
import {
  deleteCustomPart,
  listCopyableCustomPartsByOrder,
  reserveCustomPartNumber,
  updateCustomPartDriveInfo,
} from "@/lib/custom-parts";
import { copyCustomPartToDrive, listCustomPartFilesInFolder, trashCustomPartFolder } from "@/lib/google-drive";
import {
  getCustomPartLineMappings,
  getShopFloorOrderDetail,
  getShopFloorOrders,
  setCustomPartLineMappings,
} from "@/lib/shop-floor-orders";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function GET(request: Request) {
  const authResult = await requirePermission("customParts");
  if ("response" in authResult) return authResult.response;
  const sourceOrder = new URL(request.url).searchParams.get("sourceOrder")?.trim() || "";
  if (!sourceOrder) return NextResponse.json({ error: "Choose a source order." }, { status: 400 });

  try {
    const [parts, mappings] = await Promise.all([
      listCopyableCustomPartsByOrder(sourceOrder),
      getCustomPartLineMappings(sourceOrder),
    ]);
    const mappingCounts = new Map<string, number>();
    mappings.forEach((mapping) => mappingCounts.set(
      mapping.customPartId,
      (mappingCounts.get(mapping.customPartId) || 0) + 1,
    ));
    const preview = await Promise.all(parts.map(async (part) => ({
      customPartId: part.customPartId,
      partNumber: part.partNumber,
      description: part.description,
      qtyNeeded: part.qtyNeeded,
      material: part.material,
      color: part.customColor,
      completed: Boolean(part.completedAt),
      mappedLineCount: mappingCounts.get(String(part.customPartId)) || 0,
      fileCount: part.partFolderId
        ? (await listCustomPartFilesInFolder(part.partFolderId)).length
        : 0,
    })));
    return NextResponse.json({ parts: preview });
  } catch (error) {
    console.error(`GET copyable custom parts ${sourceOrder}`, error);
    return NextResponse.json({ error: "Unable to load the source order." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authResult = await requirePermission("customParts");
  if ("response" in authResult) return authResult.response;

  let body: { sourceOrder?: string; targetOrder?: string; customPartIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const sourceOrder = String(body.sourceOrder || "").trim();
  const targetOrder = String(body.targetOrder || "").trim();
  const selectedIds = Array.isArray(body.customPartIds)
    ? [...new Set(body.customPartIds.map(Number).filter(Number.isInteger))]
    : [];
  if (!sourceOrder || !targetOrder || sourceOrder === targetOrder || !selectedIds.length) {
    return NextResponse.json({ error: "Choose different source and target orders and at least one line." }, { status: 400 });
  }

  const created: { customPartId: number; partFolderId: string }[] = [];
  try {
    const [sourceParts, orders, sourceMappings, sourceDetail, targetDetail] = await Promise.all([
      listCopyableCustomPartsByOrder(sourceOrder),
      getShopFloorOrders(),
      getCustomPartLineMappings(sourceOrder),
      getShopFloorOrderDetail(sourceOrder).catch(() => ({ lines: [], panelDocuments: [] })),
      getShopFloorOrderDetail(targetOrder),
    ]);
    const target = orders.orders.find((order) => order.order === targetOrder);
    if (!target) return NextResponse.json({ error: "The new order is not an active production order." }, { status: 400 });
    const selected = sourceParts.filter((part) => selectedIds.includes(part.customPartId));
    if (selected.length !== selectedIds.length) {
      return NextResponse.json({ error: "One or more selected lines do not belong to the source order." }, { status: 400 });
    }

    const sourceLineById = new Map(sourceDetail.lines.map((line) => [line.rowId, line]));
    const matchTargetLine = (sourceLineId: string) => {
      const sourceLine = sourceLineById.get(sourceLineId);
      if (!sourceLine) return "";
      const sameLine = targetDetail.lines.find((line) => sourceLine.lineNumber !== null
        && line.lineNumber === sourceLine.lineNumber
        && normalize(line.partNumber) === normalize(sourceLine.partNumber));
      const exact = targetDetail.lines.find((line) =>
        normalize(line.partNumber) === normalize(sourceLine.partNumber)
        && normalize(line.description) === normalize(sourceLine.description));
      const match = sameLine || exact || targetDetail.lines.find((line) =>
        normalize(line.partNumber) === normalize(sourceLine.partNumber));
      return match?.rowId || "";
    };

    const copiedParts: { sourcePartNumber: string; partNumber: string; mappedLineCount: number; unmatchedLineCount: number }[] = [];
    for (const source of selected) {
      const reserved = await reserveCustomPartNumber({
        amgsOrderNumber: targetOrder,
        customerName: target.customer,
        description: source.description,
        qtyNeeded: source.qtyNeeded,
        material: source.material,
        hasCustomColor: source.hasCustomColor,
        customColor: source.customColor,
        submittedBy: authResult.email,
        groupId: source.groupId,
      });
      created.push({ customPartId: reserved.customPartId, partFolderId: "" });
      const drive = await copyCustomPartToDrive({
        sourcePartFolderId: source.partFolderId,
        amgsOrderNumber: targetOrder,
        customerName: target.customer,
        partNumber: reserved.partNumber,
        description: source.description,
        qtyNeeded: source.qtyNeeded,
        material: source.material,
        hasCustomColor: source.hasCustomColor,
        customColor: source.customColor,
        submittedBy: authResult.email,
      });
      created[created.length - 1].partFolderId = drive.partFolderId;
      await updateCustomPartDriveInfo(reserved.customPartId, drive);
      const sourcePartMappings = sourceMappings
        .filter((mapping) => mapping.customPartId === String(source.customPartId));
      const targetLineIds = sourcePartMappings
        .map((mapping) => matchTargetLine(mapping.orderLineId))
        .filter(Boolean);
      await setCustomPartLineMappings({
        customPartId: reserved.customPartId,
        orderNumber: targetOrder,
        orderLineIds: targetLineIds,
      });
      copiedParts.push({
        sourcePartNumber: source.partNumber,
        partNumber: reserved.partNumber,
        mappedLineCount: targetLineIds.length,
        unmatchedLineCount: sourcePartMappings.length - targetLineIds.length,
      });
    }
    return NextResponse.json({ ok: true, copiedParts });
  } catch (error) {
    await Promise.allSettled(created.map(async (item) => {
      await setCustomPartLineMappings({ customPartId: item.customPartId, orderNumber: targetOrder, orderLineIds: [] }).catch(() => {});
      await deleteCustomPart(item.customPartId).catch(() => {});
      await trashCustomPartFolder(item.partFolderId).catch(() => {});
    }));
    console.error(`POST copy custom parts ${sourceOrder} to ${targetOrder}`, error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to copy this order.",
    }, { status: 500 });
  }
}
