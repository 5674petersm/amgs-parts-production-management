import { NextResponse } from "next/server";

import { isCustomPartMaterial } from "@/constants/custom-part-materials";
import {
  CUSTOM_PART_MAX_FILE_BYTES,
  CUSTOM_PART_MAX_FILES,
  isAllowedDrawingFile,
} from "@/constants/custom-part-upload";
import { requirePermission } from "@/lib/api-auth";
import { getCustomPartDriveFolderId, updateCustomPartDetails } from "@/lib/custom-parts";
import { uploadFilesToCustomPartFolder } from "@/lib/google-drive";
import { setCustomPartLineMappings, validateCustomPartLineMappings } from "@/lib/shop-floor-orders";

type RouteContext = { params: Promise<{ customPartId: string }> };

export const maxDuration = 120;

export async function PATCH(request: Request, context: RouteContext) {
  const authResult = await requirePermission("customParts");
  if ("response" in authResult) return authResult.response;
  const { customPartId: rawId } = await context.params;
  const customPartId = Number(rawId);
  if (!Number.isInteger(customPartId) || customPartId <= 0) {
    return NextResponse.json({ error: "Invalid custom part." }, { status: 400 });
  }

  const formData = await request.formData();
  const customerName = String(formData.get("customerName") ?? "").trim();
  const orderNumber = String(formData.get("amgsOrderNumber") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const material = String(formData.get("material") ?? "").trim();
  const hasCustomColor = String(formData.get("hasCustomColor") ?? "") === "true";
  const customColor = String(formData.get("customColor") ?? "").trim();
  const mappedOrderLineIds = [...new Set(formData.getAll("mappedOrderLineIds")
    .map((value) => String(value).trim())
    .filter(Boolean))];
  const qtyNeeded = Number(formData.get("qtyNeeded"));
  const files = formData.getAll("drawings").filter(
    (entry): entry is File => entry instanceof File && entry.size > 0,
  );

  if (!orderNumber || !customerName || !description || !isCustomPartMaterial(material)) {
    return NextResponse.json({ error: "Valid customer, description, and material are required." }, { status: 400 });
  }
  if (!Number.isInteger(qtyNeeded) || qtyNeeded <= 0) {
    return NextResponse.json({ error: "Qty needed must be a positive whole number." }, { status: 400 });
  }
  if (hasCustomColor && !customColor) {
    return NextResponse.json({ error: "Enter a custom color or uncheck custom color." }, { status: 400 });
  }
  if (files.length > CUSTOM_PART_MAX_FILES) {
    return NextResponse.json({ error: `You can upload up to ${CUSTOM_PART_MAX_FILES} files.` }, { status: 400 });
  }
  for (const file of files) {
    if (!isAllowedDrawingFile(file.name) || file.size > CUSTOM_PART_MAX_FILE_BYTES) {
      return NextResponse.json({ error: `File is not allowed or exceeds 50 MB: ${file.name}` }, { status: 400 });
    }
  }

  try {
    await validateCustomPartLineMappings(orderNumber, mappedOrderLineIds);
    await updateCustomPartDetails(customPartId, {
      customerName,
      description,
      qtyNeeded,
      material,
      hasCustomColor,
      customColor: hasCustomColor ? customColor : "",
    });
    await setCustomPartLineMappings({
      customPartId,
      orderNumber,
      orderLineIds: mappedOrderLineIds,
    });
    if (files.length) {
      const driveFolderId = await getCustomPartDriveFolderId(customPartId);
      if (!driveFolderId) throw new Error("The Google Drive folder is missing.");
      await uploadFilesToCustomPartFolder(driveFolderId, await Promise.all(files.map(async (file) => ({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        buffer: Buffer.from(await file.arrayBuffer()),
      }))));
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`PATCH /api/custom-parts/${customPartId}`, error);
    return NextResponse.json({ error: "Unable to update this custom part." }, { status: 500 });
  }
}
