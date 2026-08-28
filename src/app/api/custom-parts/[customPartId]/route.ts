import { NextResponse } from "next/server";

import { isCustomPartMaterial } from "@/constants/custom-part-materials";
import {
  CUSTOM_PART_MAX_FILE_BYTES,
  CUSTOM_PART_MAX_FILES,
  isAllowedDrawingFile,
} from "@/constants/custom-part-upload";
import { requirePermission } from "@/lib/api-auth";
import {
  deleteUnusedCurrentCustomPart,
  getCustomPartDeletionTarget,
  getCustomPartDriveFolderId,
  updateCustomPartDetails,
} from "@/lib/custom-parts";
import {
  restoreTrashedCustomPartFolder,
  trashCustomPartFolder,
  uploadFilesToCustomPartFolder,
} from "@/lib/google-drive";
import {
  getCustomPartLineMappings,
  setCustomPartLineMappings,
  validateCustomPartLineMappings,
} from "@/lib/shop-floor-orders";

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
  const standardColor = String(formData.get("standardColor") ?? "").trim();
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
  if (!hasCustomColor && !["Black", "Yellow", "No Color"].includes(standardColor)) {
    return NextResponse.json({ error: "Select a standard color or No Color." }, { status: 400 });
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
      customColor: hasCustomColor ? customColor : standardColor,
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
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to update this custom part.",
    }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const authResult = await requirePermission("customParts");
  if ("response" in authResult) return authResult.response;
  const { customPartId: rawId } = await context.params;
  const customPartId = Number(rawId);
  if (!Number.isInteger(customPartId) || customPartId <= 0) {
    return NextResponse.json({ error: "Invalid custom part." }, { status: 400 });
  }

  let target: Awaited<ReturnType<typeof getCustomPartDeletionTarget>> = null;
  let mappedOrderLineIds: string[] = [];
  let folderTrashed = false;
  let mappingsCleared = false;

  try {
    target = await getCustomPartDeletionTarget(customPartId);
    if (!target) return NextResponse.json({ error: "Custom part not found." }, { status: 404 });
    if (target.completedAt) {
      return NextResponse.json({ error: "Completed parts cannot be deleted." }, { status: 409 });
    }
    if (target.productionLogCount > 0) {
      return NextResponse.json({
        error: "This part has production activity and cannot be deleted.",
      }, { status: 409 });
    }

    mappedOrderLineIds = (await getCustomPartLineMappings(target.orderNumber))
      .filter((mapping) => mapping.customPartId === String(customPartId))
      .map((mapping) => mapping.orderLineId);

    if (target.partFolderId) {
      folderTrashed = await trashCustomPartFolder(target.partFolderId);
    }
    await setCustomPartLineMappings({
      customPartId,
      orderNumber: target.orderNumber,
      orderLineIds: [],
    });
    mappingsCleared = true;

    const deleted = await deleteUnusedCurrentCustomPart(customPartId);
    if (!deleted) {
      throw new Error("This part changed or received production activity. Refresh and try again.");
    }

    return NextResponse.json({ ok: true, partNumber: target.partNumber });
  } catch (error) {
    if (target && mappingsCleared) {
      try {
        await setCustomPartLineMappings({
          customPartId,
          orderNumber: target.orderNumber,
          orderLineIds: mappedOrderLineIds,
        });
      } catch (rollbackError) {
        console.error(`Unable to restore mappings for custom part ${customPartId}`, rollbackError);
      }
    }
    if (target?.partFolderId && folderTrashed) {
      try {
        await restoreTrashedCustomPartFolder(target.partFolderId);
      } catch (rollbackError) {
        console.error(`Unable to restore Drive folder for custom part ${customPartId}`, rollbackError);
      }
    }
    console.error(`DELETE /api/custom-parts/${customPartId}`, error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to delete this custom part.",
    }, { status: 500 });
  }
}
