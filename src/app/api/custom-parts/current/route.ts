import { NextResponse } from "next/server";

import { listCurrentDriveCustomParts } from "@/lib/custom-parts";
import { listCustomPartFilesInFolder } from "@/lib/google-drive";
import { getCustomPartLineMappings } from "@/lib/shop-floor-orders";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [parts, mappings] = await Promise.all([
      listCurrentDriveCustomParts(),
      getCustomPartLineMappings(),
    ]);
    const mappingByPart = new Map(mappings.map((mapping) => [mapping.customPartId, mapping.orderLineId]));
    const withFiles = await Promise.all(parts.map(async (part) => ({
      ...part,
      mappedOrderLineId: mappingByPart.get(String(part.customPartId)) || "",
      files: await listCustomPartFilesInFolder(part.driveFolderId).catch((error) => {
        console.error(`Unable to list files for ${part.partNumber}`, error);
        return [];
      }),
      driveFolderId: undefined,
    })));
    return NextResponse.json({ parts: withFiles });
  } catch (error) {
    console.error("GET /api/custom-parts/current", error);
    return NextResponse.json({ error: "Unable to load current custom parts." }, { status: 500 });
  }
}
