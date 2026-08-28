import { NextResponse } from "next/server";

import { requireAuthOrShopFloor } from "@/lib/api-auth";
import { createPartLibraryGroup, deletePartLibraryGroup, getPartLibraryGroup, updatePartLibraryGroup } from "@/lib/custom-part-library";
import { propagateAddedGroupMembers } from "@/lib/library-group-propagation";

type GroupBody = {
  libraryGroupId?: unknown;
  groupName?: unknown;
  description?: unknown;
  members?: unknown;
};

function parseBody(body: GroupBody) {
  const groupName = String(body.groupName || "").trim();
  const description = String(body.description || "").trim();
  const members = Array.isArray(body.members) ? body.members.map((value) => {
    const member = value as { libraryPartId?: unknown; qtyPerSet?: unknown };
    return { libraryPartId: Number(member.libraryPartId), qtyPerSet: Number(member.qtyPerSet) };
  }) : [];
  if (!groupName) throw new Error("Group name is required.");
  if (members.some((member) => !Number.isInteger(member.libraryPartId) || member.libraryPartId <= 0
    || !Number.isInteger(member.qtyPerSet) || member.qtyPerSet <= 0)) {
    throw new Error("Every group member needs a valid quantity per set.");
  }
  return { groupName, description, members };
}

export async function POST(request: Request) {
  const authResult = await requireAuthOrShopFloor(request);
  if ("response" in authResult) return authResult.response;
  try {
    const input = parseBody(await request.json() as GroupBody);
    const libraryGroupId = await createPartLibraryGroup({ ...input, userEmail: authResult.email });
    return NextResponse.json({ ok: true, libraryGroupId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create the group." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const authResult = await requireAuthOrShopFloor(request);
  if ("response" in authResult) return authResult.response;
  try {
    const body = await request.json() as GroupBody;
    const libraryGroupId = Number(body.libraryGroupId);
    if (!Number.isInteger(libraryGroupId) || libraryGroupId <= 0) throw new Error("Valid library group is required.");
    const [existing, input] = await Promise.all([getPartLibraryGroup(libraryGroupId), Promise.resolve(parseBody(body))]);
    if (!existing) return NextResponse.json({ error: "Library group not found." }, { status: 404 });
    await updatePartLibraryGroup({ libraryGroupId, ...input, userEmail: authResult.email });
    const updated = await getPartLibraryGroup(libraryGroupId);
    const previousIds = new Set(existing.members.map((member) => member.libraryPartId));
    const addedLibraryPartIds = input.members.map((member) => member.libraryPartId).filter((id) => !previousIds.has(id));
    const propagation = updated ? await propagateAddedGroupMembers({
      group: updated, addedLibraryPartIds, submittedBy: authResult.email,
    }) : null;
    return NextResponse.json({ ok: true, propagation });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update the group." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const authResult = await requireAuthOrShopFloor(request);
  if ("response" in authResult) return authResult.response;
  try {
    const body = await request.json() as GroupBody;
    const libraryGroupId = Number(body.libraryGroupId);
    if (!Number.isInteger(libraryGroupId) || libraryGroupId <= 0) throw new Error("Valid library group is required.");
    if (!(await deletePartLibraryGroup(libraryGroupId))) return NextResponse.json({ error: "Library group not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete the group." }, { status: 400 });
  }
}
