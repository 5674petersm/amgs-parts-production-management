import { NextResponse } from "next/server";

import { customPartGroupsAvailable, listCurrentDriveCustomParts } from "@/lib/custom-parts";
import { listCustomPartFolderStates } from "@/lib/google-drive";
import { getCustomPartLineMappings } from "@/lib/shop-floor-orders";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [parts, mappings] = await Promise.all([
      listCurrentDriveCustomParts(),
      getCustomPartLineMappings(),
    ]);
    const mappingByPart = new Map<string, string[]>();
    mappings.forEach((mapping) => {
      const lines = mappingByPart.get(mapping.customPartId) ?? [];
      lines.push(mapping.orderLineId);
      mappingByPart.set(mapping.customPartId, lines);
    });
    const driveStates = await listCustomPartFolderStates(parts.map((part) => ({
      folderId: part.driveFolderId,
      partNumber: part.partNumber,
    })));
    const withFiles = parts.map((part) => ({
      ...part,
      mappedOrderLineIds: mappingByPart.get(String(part.customPartId)) || [],
      files: driveStates.get(part.driveFolderId)?.files || [],
      cut: driveStates.get(part.driveFolderId)?.cut || false,
      driveFolderId: undefined,
    }));
    return NextResponse.json({ parts: withFiles, groupingAvailable: await customPartGroupsAvailable() });
  } catch (error) {
    console.error("GET /api/custom-parts/current", error);
    return NextResponse.json({ error: "Unable to load current custom parts." }, { status: 500 });
  }
}
