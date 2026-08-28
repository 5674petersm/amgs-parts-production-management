import { NextResponse } from "next/server";

import { customPartGroupsAvailable, listCompletedDriveCustomParts } from "@/lib/custom-parts";
import { listCustomPartFilesInFolder } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const parts = await listCompletedDriveCustomParts();
    const withFiles = await Promise.all(parts.map(async (part) => ({
      ...part,
      files: await listCustomPartFilesInFolder(part.driveFolderId).catch((error) => {
        console.error(`Unable to list completed files for ${part.partNumber}`, error);
        return [];
      }),
      driveFolderId: undefined,
    })));
    return NextResponse.json({ parts: withFiles, groupingAvailable: await customPartGroupsAvailable() });
  } catch (error) {
    console.error("GET /api/custom-parts/completed", error);
    return NextResponse.json({ error: "Unable to load completed custom parts." }, { status: 500 });
  }
}
