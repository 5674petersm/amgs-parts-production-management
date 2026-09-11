import type { PartLibraryRecord } from "@/lib/custom-part-library";
import { deleteCustomPart, reserveCustomPartNumber, updateCustomPartDriveInfo } from "@/lib/custom-parts";
import { copyCustomPartToDrive, copyPartLibraryGroupPdfsToFolder, trashCustomPartFolder } from "@/lib/google-drive";
import { setCustomPartLineMappings } from "@/lib/shop-floor-orders";

export type AssignedLibraryPart = {
  customPartId: number;
  partNumber: string;
  partFolderId: string;
};

export async function assignLibraryPartToOrder(input: {
  libraryPart: PartLibraryRecord;
  orderNumber: string;
  customerName: string;
  qtyNeeded: number;
  mappedOrderLineIds: string[];
  submittedBy: string;
  sourceLibraryGroupId?: number;
  libraryGroupAssignmentId?: string;
  libraryGroupSetQuantity?: number;
  groupDrawingFolderId?: string;
}): Promise<AssignedLibraryPart> {
  let customPartId = 0;
  let partFolderId = "";
  try {
    const reserved = await reserveCustomPartNumber({
      amgsOrderNumber: input.orderNumber, customerName: input.customerName,
      description: input.libraryPart.description, qtyNeeded: input.qtyNeeded,
      material: input.libraryPart.material, hasCustomColor: input.libraryPart.hasCustomColor,
      customColor: input.libraryPart.color, submittedBy: input.submittedBy,
      sourceLibraryPartId: input.libraryPart.libraryPartId,
      sourceLibraryGroupId: input.sourceLibraryGroupId,
      libraryGroupAssignmentId: input.libraryGroupAssignmentId,
      libraryGroupSetQuantity: input.libraryGroupSetQuantity,
      requiredProcesses: input.libraryPart.requiredProcesses,
    });
    customPartId = reserved.customPartId;
    const drive = await copyCustomPartToDrive({
      sourcePartFolderId: input.libraryPart.driveFolderId,
      amgsOrderNumber: input.orderNumber, customerName: input.customerName,
      partNumber: reserved.partNumber, description: input.libraryPart.description,
      qtyNeeded: input.qtyNeeded, material: input.libraryPart.material,
      hasCustomColor: input.libraryPart.hasCustomColor, customColor: input.libraryPart.color,
      submittedBy: input.submittedBy,
    });
    partFolderId = drive.partFolderId;
    if (input.groupDrawingFolderId) {
      await copyPartLibraryGroupPdfsToFolder(input.groupDrawingFolderId, drive.partFolderId);
    }
    await updateCustomPartDriveInfo(customPartId, drive);
    await setCustomPartLineMappings({
      customPartId, orderNumber: input.orderNumber, orderLineIds: input.mappedOrderLineIds,
    });
    return { customPartId, partNumber: reserved.partNumber, partFolderId };
  } catch (error) {
    if (customPartId) {
      await setCustomPartLineMappings({ customPartId, orderNumber: input.orderNumber, orderLineIds: [] }).catch(() => {});
      await deleteCustomPart(customPartId).catch(() => {});
    }
    if (partFolderId) await trashCustomPartFolder(partFolderId).catch(() => {});
    throw error;
  }
}

export async function rollbackAssignedLibraryPart(input: AssignedLibraryPart & { orderNumber: string }) {
  await setCustomPartLineMappings({ customPartId: input.customPartId, orderNumber: input.orderNumber, orderLineIds: [] }).catch(() => {});
  await deleteCustomPart(input.customPartId).catch(() => {});
  await trashCustomPartFolder(input.partFolderId).catch(() => {});
}
