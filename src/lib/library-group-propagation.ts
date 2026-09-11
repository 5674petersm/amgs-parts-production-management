import type { PartLibraryGroupRecord, PartLibraryRecord } from "@/lib/custom-part-library";
import { listPartLibrary } from "@/lib/custom-part-library";
import { libraryGroupAssignmentTrackingAvailable, listTrackedLibraryGroupParts } from "@/lib/custom-parts";
import { assignLibraryPartToOrder, rollbackAssignedLibraryPart, type AssignedLibraryPart } from "@/lib/library-part-assignment";
import { getCustomPartLineMappings, getShopFloorOrders } from "@/lib/shop-floor-orders";

export type GroupPropagationResult = {
  available: boolean;
  assignmentsUpdated: number;
  partsCreated: number;
  skippedClosedAssignments: number;
  errors: string[];
};

export async function propagateAddedGroupMembers(input: {
  group: PartLibraryGroupRecord;
  addedLibraryPartIds: number[];
  submittedBy: string;
  libraryParts?: PartLibraryRecord[];
}): Promise<GroupPropagationResult> {
  const result: GroupPropagationResult = {
    available: await libraryGroupAssignmentTrackingAvailable(),
    assignmentsUpdated: 0,
    partsCreated: 0,
    skippedClosedAssignments: 0,
    errors: [],
  };
  const addedIds = [...new Set(input.addedLibraryPartIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (!result.available || !addedIds.length) return result;

  const [trackedParts, orders, libraryParts] = await Promise.all([
    listTrackedLibraryGroupParts(input.group.libraryGroupId),
    getShopFloorOrders(),
    input.libraryParts ? Promise.resolve(input.libraryParts) : listPartLibrary(),
  ]);
  const activeOrders = new Map(orders.orders.map((order) => [order.order, order]));
  const libraryPartsById = new Map(libraryParts.map((part) => [part.libraryPartId, part]));
  const membersById = new Map(input.group.members.map((member) => [member.libraryPartId, member]));
  const assignments = new Map<string, typeof trackedParts>();
  trackedParts.forEach((part) => assignments.set(part.libraryGroupAssignmentId, [
    ...(assignments.get(part.libraryGroupAssignmentId) || []), part,
  ]));

  for (const [assignmentId, existingParts] of assignments) {
    const first = existingParts[0];
    const order = activeOrders.get(first.orderNumber);
    if (!order) {
      result.skippedClosedAssignments += 1;
      continue;
    }
    const missingIds = addedIds.filter((libraryPartId) => !existingParts.some((part) => part.sourceLibraryPartId === libraryPartId));
    if (!missingIds.length) continue;
    const mappings = await getCustomPartLineMappings(first.orderNumber);
    const mappedOrderLineIds = mappings
      .filter((mapping) => mapping.customPartId === String(first.customPartId))
      .map((mapping) => mapping.orderLineId);
    const created: AssignedLibraryPart[] = [];
    try {
      for (const libraryPartId of missingIds) {
        const member = membersById.get(libraryPartId);
        const libraryPart = libraryPartsById.get(libraryPartId);
        if (!member || !libraryPart) throw new Error(`Library part ${libraryPartId} is unavailable.`);
        created.push(await assignLibraryPartToOrder({
          libraryPart,
          orderNumber: first.orderNumber,
          customerName: order.customer || first.customerName,
          qtyNeeded: first.libraryGroupSetQuantity * member.qtyPerSet,
          mappedOrderLineIds,
          submittedBy: input.submittedBy,
          sourceLibraryGroupId: input.group.libraryGroupId,
          libraryGroupAssignmentId: assignmentId,
          libraryGroupSetQuantity: first.libraryGroupSetQuantity,
          groupDrawingFolderId: input.group.driveFolderId,
        }));
      }
      result.assignmentsUpdated += 1;
      result.partsCreated += created.length;
    } catch (error) {
      await Promise.allSettled(created.map((part) => rollbackAssignedLibraryPart({ ...part, orderNumber: first.orderNumber })));
      result.errors.push(`Order ${first.orderNumber}: ${error instanceof Error ? error.message : "Unable to add the new group member."}`);
    }
  }
  return result;
}
