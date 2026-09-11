import { getCustomPartCompletionTarget, listCustomPartsByOrder, markCustomPartComplete, markRequiredCustomPartProcessesComplete } from "@/lib/custom-parts";
import { moveCustomPartFolderToCompleted, restoreCustomPartFolder, type CompletedFolderMove } from "@/lib/google-drive";
import { getCustomPartLineMappings, getShopFloorOrderDetail, setShopFloorLineComplete, setShopFloorLineProcess } from "@/lib/shop-floor-orders";
import { plantLocalCalendarDate } from "@/lib/time";

function isCustomWmPanel(line: { partNumber: string; description: string }) {
  return `${line.partNumber} ${line.description}`.toLowerCase().includes("custom wm panel");
}

export async function completeCustomPart(customPartId: number, completedBy: string) {
  let folderMove: CompletedFolderMove | null = null;
  const changedLineIds: string[] = [];
  let orderNumber = "";
  try {
    const target = await getCustomPartCompletionTarget(customPartId);
    if (!target) throw new Error("Custom part not found.");
    orderNumber = target.orderNumber;
    if (target.completedAt) return { completedAt: target.completedAt, completedLineCount: 0, alreadyComplete: true };

    const [mappings, parts] = await Promise.all([
      getCustomPartLineMappings(target.orderNumber), listCustomPartsByOrder(target.orderNumber),
    ]);
    const ownMappings = mappings.filter((mapping) => mapping.customPartId === String(customPartId));
    const detail = ownMappings.length ? await getShopFloorOrderDetail(target.orderNumber) : null;
    const linesById = new Map((detail?.lines || []).map((line) => [line.rowId, line]));
    if (ownMappings.some((mapping) => !linesById.has(mapping.orderLineId))) {
      throw new Error("One of the associated dashboard line items no longer exists.");
    }

    const completionDate = plantLocalCalendarDate();
    folderMove = await moveCustomPartFolderToCompleted({
      partFolderId: target.partFolderId, orderFolderId: target.orderFolderId,
      partNumber: target.partNumber, completionDate,
    });
    await markRequiredCustomPartProcessesComplete(customPartId).catch(() => {});

    const completionByPart = new Map(parts.map((part) => [String(part.customPartId), Boolean(part.completedAt)]));
    completionByPart.set(String(customPartId), true);
    for (const mapping of ownMappings) {
      const line = linesById.get(mapping.orderLineId)!;
      if (line.completed || isCustomWmPanel(line)) continue;
      const mappedPartIds = mappings.filter((candidate) => candidate.orderLineId === mapping.orderLineId).map((candidate) => candidate.customPartId);
      if (!mappedPartIds.every((partId) => completionByPart.get(partId))) continue;
      await setShopFloorLineComplete({ orderId: target.orderNumber, lineId: mapping.orderLineId, checked: true, allowCompletedClear: false });
      changedLineIds.push(mapping.orderLineId);
    }
    const completedAt = await markCustomPartComplete(customPartId, completedBy);
    for (const mapping of ownMappings) {
      const line = linesById.get(mapping.orderLineId)!;
      if (!isCustomWmPanel(line)) continue;
      await setShopFloorLineProcess({
        orderId: target.orderNumber, lineId: mapping.orderLineId, process: "weld",
        checked: Boolean(line.steps.welded?.checked),
      }).catch((error) => console.error(`Unable to synchronize panel line ${mapping.orderLineId}`, error));
    }
    return { completedAt, completedLineCount: changedLineIds.length, folderName: `${target.partNumber} - Completed ${completionDate}` };
  } catch (error) {
    for (const lineId of changedLineIds.reverse()) {
      await setShopFloorLineComplete({ orderId: orderNumber, lineId, checked: false, allowCompletedClear: true }).catch(() => {});
    }
    if (folderMove) await restoreCustomPartFolder(folderMove).catch(() => {});
    throw error;
  }
}
