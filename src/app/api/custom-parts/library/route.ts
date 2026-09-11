import { NextResponse } from "next/server";

import { isCustomPartMaterial } from "@/constants/custom-part-materials";
import { CUSTOM_PART_MAX_FILE_BYTES, CUSTOM_PART_MAX_FILES, isAllowedDrawingFile } from "@/constants/custom-part-upload";
import { requireAuthOrShopFloor } from "@/lib/api-auth";
import { addPartLibraryItemToGroup, createPartLibraryItem, getPartLibraryGroup, getPartLibraryItem, listPartLibrary, listPartLibraryGroups, partLibraryAvailable, partLibraryCanUpdate, partLibraryGroupFilesAvailable, partLibraryGroupsAvailable, updatePartLibraryItem } from "@/lib/custom-part-library";
import { libraryGroupAssignmentTrackingAvailable, listActiveLibraryPartCopies } from "@/lib/custom-parts";
import { listCustomPartFilesInFolder, trashCustomPartFolder, updatePartLibraryFiles, uploadPartLibraryFiles } from "@/lib/google-drive";
import { propagateAddedGroupMembers } from "@/lib/library-group-propagation";
import { getShopFloorOrders } from "@/lib/shop-floor-orders";
import { normalizeCustomPartProcesses } from "@/constants/custom-part-processes";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const authResult = await requireAuthOrShopFloor(request);
  if ("response" in authResult) return authResult.response;
  try {
    const available = await partLibraryAvailable();
    const groupsAvailable = await partLibraryGroupsAvailable();
    const [items, groupRecords, canEdit, groupSyncAvailable, groupFilesAvailable] = await Promise.all([
      available ? listPartLibrary() : [],
      groupsAvailable ? listPartLibraryGroups() : [],
      available ? partLibraryCanUpdate() : false,
      libraryGroupAssignmentTrackingAvailable(),
      partLibraryGroupFilesAvailable(),
    ]);
    const parts = await Promise.all(items.map(async (item) => ({
      libraryPartId: item.libraryPartId,
      partName: item.partName,
      description: item.description,
      material: item.material,
      hasCustomColor: item.hasCustomColor,
      color: item.color,
      folderUrl: item.folderUrl,
      createdBy: item.createdBy,
      createdAt: item.createdAt,
      requiredProcesses: item.requiredProcesses,
      files: await listCustomPartFilesInFolder(item.driveFolderId).catch(() => []),
    })));
    const groups = await Promise.all(groupRecords.map(async (group) => ({
      ...group,
      files: group.driveFolderId ? await listCustomPartFilesInFolder(group.driveFolderId).catch(() => []) : [],
    })));
    return NextResponse.json({ parts, groups, available, groupsAvailable, canEdit, groupSyncAvailable, groupFilesAvailable });
  } catch (error) {
    console.error("GET /api/custom-parts/library", error);
    return NextResponse.json({ error: "Unable to load the Parts Library." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authResult = await requireAuthOrShopFloor(request);
  if ("response" in authResult) return authResult.response;
  let formData: FormData;
  try { formData = await request.formData(); } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }
  const partName = String(formData.get("partName") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const material = String(formData.get("material") || "").trim();
  const hasCustomColor = String(formData.get("hasCustomColor") || "") === "true";
  const standardColor = String(formData.get("standardColor") || "").trim();
  const customColor = String(formData.get("customColor") || "").trim();
  const color = hasCustomColor ? customColor : standardColor;
  const files = formData.getAll("drawings").filter((value): value is File => value instanceof File && value.size > 0);
  const libraryGroupId = Number(formData.get("libraryGroupId") || 0);
  const qtyPerSet = Number(formData.get("qtyPerSet") || 1);
  const requiredProcesses = normalizeCustomPartProcesses(formData.getAll("requiredProcesses"));
  if (!partName || !description || !isCustomPartMaterial(material)) {
    return NextResponse.json({ error: "Name, description, and a valid material are required." }, { status: 400 });
  }
  if ((hasCustomColor && !customColor) || (!hasCustomColor && !["Black", "Yellow", "No Color"].includes(standardColor))) {
    return NextResponse.json({ error: "Choose a valid finish color." }, { status: 400 });
  }
  if (!files.length || files.length > CUSTOM_PART_MAX_FILES) {
    return NextResponse.json({ error: `Add 1 to ${CUSTOM_PART_MAX_FILES} drawing files.` }, { status: 400 });
  }
  for (const file of files) {
    if (!isAllowedDrawingFile(file.name) || file.size > CUSTOM_PART_MAX_FILE_BYTES) {
      return NextResponse.json({ error: `File is not allowed or exceeds 50 MB: ${file.name}` }, { status: 400 });
    }
  }
  let folderId = "";
  try {
    const buffers = await Promise.all(files.map(async (file) => ({
      name: file.name, mimeType: file.type || "application/octet-stream", buffer: Buffer.from(await file.arrayBuffer()),
    })));
    const drive = await uploadPartLibraryFiles({
      partName, description, material, hasCustomColor, customColor: color,
      submittedBy: authResult.email, files: buffers,
    });
    folderId = drive.partFolderId;
    const libraryPartId = await createPartLibraryItem({
      partName, description, material, hasCustomColor, color,
      driveFolderId: drive.partFolderId, folderUrl: drive.folderUrl, createdBy: authResult.email,
      requiredProcesses,
    });
    let propagation = null;
    if (Number.isInteger(libraryGroupId) && libraryGroupId > 0) {
      await addPartLibraryItemToGroup({
        libraryGroupId, libraryPartId, qtyPerSet: Number.isInteger(qtyPerSet) && qtyPerSet > 0 ? qtyPerSet : 1,
        userEmail: authResult.email,
      });
      const group = await getPartLibraryGroup(libraryGroupId);
      if (group) {
        propagation = await propagateAddedGroupMembers({
          group, addedLibraryPartIds: [libraryPartId], submittedBy: authResult.email,
        }).catch((propagationError) => ({
          available: true, assignmentsUpdated: 0, partsCreated: 0, skippedClosedAssignments: 0,
          errors: [propagationError instanceof Error ? propagationError.message : "Unable to update prior group assignments."],
        }));
      }
    }
    return NextResponse.json({ ok: true, libraryPartId, propagation });
  } catch (error) {
    if (folderId) await trashCustomPartFolder(folderId).catch(() => {});
    console.error("POST /api/custom-parts/library", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save the library part." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authResult = await requireAuthOrShopFloor(request);
  if ("response" in authResult) return authResult.response;
  if (!(await partLibraryCanUpdate())) {
    return NextResponse.json({ error: "Parts Library editing is awaiting its database permission grant." }, { status: 503 });
  }
  let formData: FormData;
  try { formData = await request.formData(); } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }
  const libraryPartId = Number(formData.get("libraryPartId"));
  const partName = String(formData.get("partName") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const material = String(formData.get("material") || "").trim();
  const hasCustomColor = String(formData.get("hasCustomColor") || "") === "true";
  const standardColor = String(formData.get("standardColor") || "").trim();
  const customColor = String(formData.get("customColor") || "").trim();
  const color = hasCustomColor ? customColor : standardColor;
  const files = formData.getAll("drawings").filter((value): value is File => value instanceof File && value.size > 0);
  const removeFileIds = [...new Set(formData.getAll("removeFileIds").map(String).filter(Boolean))];
  const requiredProcesses = normalizeCustomPartProcesses(formData.getAll("requiredProcesses"));
  if (!Number.isInteger(libraryPartId) || libraryPartId <= 0 || !partName || !description || !isCustomPartMaterial(material)) {
    return NextResponse.json({ error: "Name, description, and a valid material are required." }, { status: 400 });
  }
  if ((hasCustomColor && !customColor) || (!hasCustomColor && !["Black", "Yellow", "No Color"].includes(standardColor))) {
    return NextResponse.json({ error: "Choose a valid finish color." }, { status: 400 });
  }
  if (files.length > CUSTOM_PART_MAX_FILES) {
    return NextResponse.json({ error: `Add no more than ${CUSTOM_PART_MAX_FILES} drawing files at once.` }, { status: 400 });
  }
  for (const file of files) {
    if (!isAllowedDrawingFile(file.name) || file.size > CUSTOM_PART_MAX_FILE_BYTES) {
      return NextResponse.json({ error: `File is not allowed or exceeds 50 MB: ${file.name}` }, { status: 400 });
    }
  }
  try {
    const libraryPart = await getPartLibraryItem(libraryPartId);
    if (!libraryPart) return NextResponse.json({ error: "Library part not found." }, { status: 404 });
    const existingFiles = await listCustomPartFilesInFolder(libraryPart.driveFolderId);
    if (removeFileIds.some((fileId) => !existingFiles.some((file) => file.id === fileId))) {
      return NextResponse.json({ error: "One of the selected drawings was not found on this part." }, { status: 400 });
    }
    if (existingFiles.length - removeFileIds.length + files.length < 1) {
      return NextResponse.json({ error: "Keep or upload at least one drawing file." }, { status: 400 });
    }
    const buffers = await Promise.all(files.map(async (file) => ({
      name: file.name, mimeType: file.type || "application/octet-stream", buffer: Buffer.from(await file.arrayBuffer()),
    })));
    await updatePartLibraryFiles({
      folderId: libraryPart.driveFolderId, partName, description, material, hasCustomColor,
      customColor: color, submittedBy: authResult.email, files: buffers, removeFileIds,
    });
    if (!(await updatePartLibraryItem({ libraryPartId, partName, description, material, hasCustomColor, color, requiredProcesses }))) {
      return NextResponse.json({ error: "Library part not found." }, { status: 404 });
    }
    const [copies, orders] = await Promise.all([
      listActiveLibraryPartCopies(libraryPartId), getShopFloorOrders(),
    ]);
    const activeOrders = new Set(orders.orders.map((order) => order.order));
    return NextResponse.json({
      ok: true,
      libraryPartId,
      drawingsChanged: files.length > 0 || removeFileIds.length > 0,
      assignedCopyCount: copies.filter((copy) => activeOrders.has(copy.orderNumber)).length,
    });
  } catch (error) {
    console.error("PATCH /api/custom-parts/library", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update the library part." }, { status: 500 });
  }
}
