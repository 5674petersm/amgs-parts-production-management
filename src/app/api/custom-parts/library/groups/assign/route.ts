import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { requireAuthOrShopFloor } from "@/lib/api-auth";
import { getPartLibraryGroup, listPartLibrary } from "@/lib/custom-part-library";
import { assignLibraryPartToOrder, rollbackAssignedLibraryPart, type AssignedLibraryPart } from "@/lib/library-part-assignment";
import { getShopFloorOrders, validateCustomPartLineMappings } from "@/lib/shop-floor-orders";

export const maxDuration = 120;

export async function POST(request: Request) {
  const authResult = await requireAuthOrShopFloor(request);
  if ("response" in authResult) return authResult.response;
  let body: { libraryGroupId?: unknown; orderNumber?: unknown; setQuantity?: unknown; mappedOrderLineIds?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const libraryGroupId = Number(body.libraryGroupId);
  const orderNumber = String(body.orderNumber || "").trim();
  const setQuantity = Number(body.setQuantity);
  const mappedOrderLineIds = Array.isArray(body.mappedOrderLineIds)
    ? [...new Set(body.mappedOrderLineIds.map(String).map((value) => value.trim()).filter(Boolean))] : [];
  if (!Number.isInteger(libraryGroupId) || libraryGroupId <= 0 || !orderNumber
    || !Number.isInteger(setQuantity) || setQuantity <= 0) {
    return NextResponse.json({ error: "Choose a group and order, and enter a positive number of sets." }, { status: 400 });
  }

  const created: AssignedLibraryPart[] = [];
  try {
    const [group, parts, orders] = await Promise.all([
      getPartLibraryGroup(libraryGroupId), listPartLibrary(), getShopFloorOrders(),
    ]);
    if (!group) return NextResponse.json({ error: "Library group not found." }, { status: 404 });
    if (!group.members.length) return NextResponse.json({ error: "This library group has no parts." }, { status: 409 });
    const order = orders.orders.find((item) => item.order === orderNumber);
    if (!order) return NextResponse.json({ error: "Choose an active production order." }, { status: 400 });
    await validateCustomPartLineMappings(orderNumber, mappedOrderLineIds);
    const partsById = new Map(parts.map((part) => [part.libraryPartId, part]));
    const libraryGroupAssignmentId = randomUUID();
    for (const member of group.members) {
      const libraryPart = partsById.get(member.libraryPartId);
      if (!libraryPart) throw new Error(`A part in ${group.groupName} is no longer available.`);
      created.push(await assignLibraryPartToOrder({
        libraryPart, orderNumber, customerName: order.customer,
        qtyNeeded: setQuantity * member.qtyPerSet, mappedOrderLineIds,
        submittedBy: authResult.email,
        sourceLibraryGroupId: libraryGroupId, libraryGroupAssignmentId,
        libraryGroupSetQuantity: setQuantity,
      }));
    }
    return NextResponse.json({ ok: true, groupName: group.groupName,
      createdParts: created.map(({ customPartId, partNumber }) => ({ customPartId, partNumber })) });
  } catch (error) {
    await Promise.allSettled(created.map((part) => rollbackAssignedLibraryPart({ ...part, orderNumber })));
    console.error(`Assign library group ${libraryGroupId}`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to assign the library group." }, { status: 500 });
  }
}
