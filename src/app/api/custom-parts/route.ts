import { NextResponse } from "next/server";

import { auth } from "@/auth";
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
import { uploadCustomPartToDrive } from "@/lib/google-drive";

export const maxDuration = 120;

export async function POST(request: Request) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
  const customColor = String(formData.get("customColor") ?? "").trim();
  const qtyNeeded = Number(formData.get("qtyNeeded"));
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

  const files = drawingEntries.filter(
    (entry): entry is File => entry instanceof File && entry.size > 0,
  );

  if (files.length === 0) {
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

  try {
    const reserved = await reserveCustomPartNumber({
      amgsOrderNumber,
      customerName,
      description,
      qtyNeeded,
      material,
      hasCustomColor,
      customColor: hasCustomColor ? customColor : "",
      submittedBy: userEmail,
    });
    reservedPartId = reserved.customPartId;

    const fileBuffers = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        buffer: Buffer.from(await file.arrayBuffer()),
      })),
    );

    const driveResult = await uploadCustomPartToDrive({
      amgsOrderNumber,
      customerName,
      partNumber: reserved.partNumber,
      description,
      qtyNeeded,
      material,
      hasCustomColor,
      customColor: hasCustomColor ? customColor : "",
      submittedBy: userEmail,
      files: fileBuffers,
    });

    await updateCustomPartDriveInfo(reserved.customPartId, {
      orderFolderId: driveResult.orderFolderId,
      partFolderId: driveResult.partFolderId,
      folderUrl: driveResult.folderUrl,
    });

    return NextResponse.json({
      ok: true,
      partNumber: reserved.partNumber,
      orderFolderId: driveResult.orderFolderId,
      partFolderId: driveResult.partFolderId,
      folderUrl: driveResult.folderUrl,
      uploadedFiles: driveResult.uploadedFiles,
    });
  } catch (error) {
    if (reservedPartId !== null) {
      try {
        await deleteCustomPart(reservedPartId);
      } catch (cleanupError) {
        console.error("Failed to roll back reserved custom part", cleanupError);
      }
    }

    console.error("POST /api/custom-parts", error);
    const message =
      error instanceof Error ? error.message : "Unable to upload to Google Drive.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
