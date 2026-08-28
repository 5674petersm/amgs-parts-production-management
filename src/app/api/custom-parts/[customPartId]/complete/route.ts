import { NextResponse } from "next/server";

import { optionalAuthEmail } from "@/lib/api-auth";
import { getCustomPartCompletionTarget, markCustomPartComplete } from "@/lib/custom-parts";
import {
  moveCustomPartFolderToCompleted,
  restoreCustomPartFolder,
  type CompletedFolderMove,
} from "@/lib/google-drive";
import {
  getCustomPartLineMappings,
  getShopFloorOrderDetail,
  setShopFloorLineComplete,
} from "@/lib/shop-floor-orders";
import { plantLocalCalendarDate } from "@/lib/time";

type RouteContext = { params: Promise<{ customPartId: string }> };

export const maxDuration = 120;

export async function POST(_request: Request, context: RouteContext) {
  const { customPartId: rawId } = await context.params;
  const customPartId = Number(rawId);
  if (!Number.isInteger(customPartId) || customPartId <= 0) {
    return NextResponse.json({ error: "Invalid custom part." }, { status: 400 });
  }

  const completedBy = await optionalAuthEmail();
  let folderMove: CompletedFolderMove | null = null;
  const changedLineIds: string[] = [];
  let orderNumber = "";

  try {
    const target = await getCustomPartCompletionTarget(customPartId);
    if (!target) return NextResponse.json({ error: "Custom part not found." }, { status: 404 });
    orderNumber = target.orderNumber;
    if (target.completedAt) {
      return NextResponse.json({ ok: true, completedAt: target.completedAt, completedLineCount: 0, alreadyComplete: true });
    }

    const mappings = (await getCustomPartLineMappings(target.orderNumber))
      .filter((mapping) => mapping.customPartId === String(customPartId));
    const detail = mappings.length ? await getShopFloorOrderDetail(target.orderNumber) : null;
    const linesById = new Map((detail?.lines || []).map((line) => [line.rowId, line]));
    if (mappings.some((mapping) => !linesById.has(mapping.orderLineId))) {
      throw new Error("One of the associated dashboard line items no longer exists.");
    }

    const completionDate = plantLocalCalendarDate();
    folderMove = await moveCustomPartFolderToCompleted({
      partFolderId: target.partFolderId,
      orderFolderId: target.orderFolderId,
      partNumber: target.partNumber,
      completionDate,
    });

    for (const mapping of mappings) {
      if (linesById.get(mapping.orderLineId)?.completed) continue;
      await setShopFloorLineComplete({
        orderId: target.orderNumber,
        lineId: mapping.orderLineId,
        checked: true,
        allowCompletedClear: false,
      });
      changedLineIds.push(mapping.orderLineId);
    }

    const completedAt = await markCustomPartComplete(customPartId, completedBy);
    return NextResponse.json({
      ok: true,
      completedAt,
      completedLineCount: mappings.length,
      folderName: `${target.partNumber} - Completed ${completionDate}`,
    });
  } catch (error) {
    for (const lineId of changedLineIds.reverse()) {
      try {
        await setShopFloorLineComplete({
          orderId: orderNumber,
          lineId,
          checked: false,
          allowCompletedClear: true,
        });
      } catch (rollbackError) {
        console.error(`Unable to roll back dashboard line ${lineId}`, rollbackError);
      }
    }
    if (folderMove) {
      try {
        await restoreCustomPartFolder(folderMove);
      } catch (rollbackError) {
        console.error("Unable to restore custom part Drive folder", rollbackError);
      }
    }
    console.error(`POST /api/custom-parts/${customPartId}/complete`, error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to complete this custom part.",
    }, { status: 500 });
  }
}
