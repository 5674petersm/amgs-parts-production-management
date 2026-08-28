import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/api-auth";
import { isCustomPartMaterial } from "@/constants/custom-part-materials";
import {
  CUSTOM_PART_MAX_FILE_BYTES,
  CUSTOM_PART_MAX_FILES,
  isAllowedDrawingFile,
} from "@/constants/custom-part-upload";
import {
  deleteCustomPart,
  reserveCustomPartNumber,
  updateCustomPartDriveInfo,
} from "@/lib/custom-parts";
import { createPartLibraryItem, getPartLibraryItem } from "@/lib/custom-part-library";
import { copyCustomPartToDrive, copyCustomPartToLibrary, trashCustomPartFolder, uploadCustomPartToDrive } from "@/lib/google-drive";
import { setCustomPartLineMappings, validateCustomPartLineMappings } from "@/lib/shop-floor-orders";

export const maxDuration = 120;

export async function POST(request: Request) {
  const authResult = await requirePermission("customParts");
  if ("response" in authResult) {
    return authResult.response;
  }
  const userEmail = authResult.email;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const amgsOrderNumber = String(formData.get("amgsOrderNumber") ?? "").trim();
  const customerName = String(formData.get("customerName") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const material = String(formData.get("material") ?? "").trim();
  const hasCustomColor = String(formData.get("hasCustomColor") ?? "") === "true";
  const standardColor = String(formData.get("standardColor") ?? "").trim();
  const customColor = String(formData.get("customColor") ?? "").trim();
  const saveToLibrary = String(formData.get("saveToLibrary") ?? "") === "true";
  const sourceLibraryPartId = Number(formData.get("sourceLibraryPartId") || 0);
  const qtyNeeded = Number(formData.get("qtyNeeded"));
  const mappedOrderLineIds = [...new Set(formData.getAll("mappedOrderLineIds")
    .map((value) => String(value).trim())
    .filter(Boolean))];
  const drawingEntries = formData.getAll("drawings");

  if (!amgsOrderNumber || !customerName || !description || !material) {
    return NextResponse.json(
      { error: "All part fields are required." },
      { status: 400 },
    );
  }

  if (!isCustomPartMaterial(material)) {
    return NextResponse.json({ error: "Invalid material." }, { status: 400 });
  }

  if (!Number.isFinite(qtyNeeded) || qtyNeeded <= 0 || !Number.isInteger(qtyNeeded)) {
    return NextResponse.json(
      { error: "Qty needed must be a positive whole number." },
      { status: 400 },
    );
  }

  if (hasCustomColor && !customColor) {
    return NextResponse.json(
      { error: "Enter a custom color or uncheck custom color." },
      { status: 400 },
    );
  }
  if (!hasCustomColor && !["Black", "Yellow", "No Color"].includes(standardColor)) {
    return NextResponse.json({ error: "Select a standard color or No Color." }, { status: 400 });
  }
  const finishColor = hasCustomColor ? customColor : standardColor;

  const files = drawingEntries.filter(
    (entry): entry is File => entry instanceof File && entry.size > 0,
  );

  const sourceLibraryPart = Number.isInteger(sourceLibraryPartId) && sourceLibraryPartId > 0
    ? await getPartLibraryItem(sourceLibraryPartId).catch(() => null)
    : null;
  if (sourceLibraryPartId && !sourceLibraryPart) {
    return NextResponse.json({ error: "The selected library part was not found." }, { status: 400 });
  }

  if (files.length === 0 && !sourceLibraryPart) {
    return NextResponse.json(
      { error: "Add at least one drawing file." },
      { status: 400 },
    );
  }

  if (files.length > CUSTOM_PART_MAX_FILES) {
    return NextResponse.json(
      { error: `You can upload up to ${CUSTOM_PART_MAX_FILES} files.` },
      { status: 400 },
    );
  }

  for (const file of files) {
    if (!isAllowedDrawingFile(file.name)) {
      return NextResponse.json(
        { error: `File type not allowed: ${file.name}` },
        { status: 400 },
      );
    }

    if (file.size > CUSTOM_PART_MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File is too large (max 50 MB): ${file.name}` },
        { status: 400 },
      );
    }
  }

  let reservedPartId: number | null = null;
  let orderPartFolderId = "";
  let libraryFolderId = "";

  try {
    await validateCustomPartLineMappings(amgsOrderNumber, mappedOrderLineIds);
    const reserved = await reserveCustomPartNumber({
      amgsOrderNumber,
      customerName,
      description,
      qtyNeeded,
      material,
      hasCustomColor,
      customColor: finishColor,
      submittedBy: userEmail,
      mappedOrderLineIds,
      sourceLibraryPartId: sourceLibraryPart?.libraryPartId || null,
    });
    reservedPartId = reserved.customPartId;

    const fileBuffers = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        buffer: Buffer.from(await file.arrayBuffer()),
      })),
    );

    const driveResult = sourceLibraryPart
      ? await copyCustomPartToDrive({
        sourcePartFolderId: sourceLibraryPart.driveFolderId,
        amgsOrderNumber, customerName, partNumber: reserved.partNumber, description,
        qtyNeeded, material, hasCustomColor, customColor: finishColor, submittedBy: userEmail,
      })
      : await uploadCustomPartToDrive({
        amgsOrderNumber, customerName, partNumber: reserved.partNumber, description,
        qtyNeeded, material, hasCustomColor, customColor: finishColor,
        submittedBy: userEmail, files: fileBuffers,
      });
    orderPartFolderId = driveResult.partFolderId;

    await updateCustomPartDriveInfo(reserved.customPartId, {
      orderFolderId: driveResult.orderFolderId,
      partFolderId: driveResult.partFolderId,
      folderUrl: driveResult.folderUrl,
    });
    await setCustomPartLineMappings({
      customPartId: reserved.customPartId,
      orderNumber: amgsOrderNumber,
      orderLineIds: mappedOrderLineIds,
    });

    let libraryPartId: number | null = null;
    if (saveToLibrary && !sourceLibraryPart) {
      const libraryDrive = await copyCustomPartToLibrary({
        sourcePartFolderId: driveResult.partFolderId,
        partName: description,
        description,
        material,
        hasCustomColor,
        customColor: finishColor,
        submittedBy: userEmail,
      });
      libraryFolderId = libraryDrive.partFolderId;
      libraryPartId = await createPartLibraryItem({
        partName: description,
        description,
        material,
        hasCustomColor,
        color: finishColor,
        driveFolderId: libraryDrive.partFolderId,
        folderUrl: libraryDrive.folderUrl,
        createdBy: userEmail,
      });
    }

    return NextResponse.json({
      ok: true,
      partNumber: reserved.partNumber,
      orderFolderId: driveResult.orderFolderId,
      partFolderId: driveResult.partFolderId,
      folderUrl: driveResult.folderUrl,
      uploadedFiles: driveResult.uploadedFiles,
      libraryPartId,
    });
  } catch (error) {
    if (reservedPartId !== null) {
      try {
        await deleteCustomPart(reservedPartId);
      } catch (cleanupError) {
        console.error("Failed to roll back reserved custom part", cleanupError);
      }
    }
    if (orderPartFolderId) await trashCustomPartFolder(orderPartFolderId).catch(() => {});
    if (libraryFolderId) await trashCustomPartFolder(libraryFolderId).catch(() => {});

    console.error("POST /api/custom-parts", error);
    const message =
      error instanceof Error ? error.message : "Unable to upload to Google Drive.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
