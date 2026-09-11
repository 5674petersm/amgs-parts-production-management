import { NextResponse } from "next/server";

import { CUSTOM_PART_MAX_FILE_BYTES, CUSTOM_PART_MAX_FILES } from "@/constants/custom-part-upload";
import { requireAuthOrShopFloor } from "@/lib/api-auth";
import { getPartLibraryGroup, partLibraryGroupFilesAvailable, setPartLibraryGroupDriveFolder } from "@/lib/custom-part-library";
import { trashPartLibraryGroupFile, uploadPartLibraryGroupPdfs } from "@/lib/google-drive";

export const maxDuration = 120;

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export async function POST(request: Request) {
  const authResult = await requireAuthOrShopFloor(request);
  if ("response" in authResult) return authResult.response;
  if (!(await partLibraryGroupFilesAvailable())) {
    return NextResponse.json({ error: "Group drawings are awaiting their database migration." }, { status: 503 });
  }
  let formData: FormData;
  try { formData = await request.formData(); } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }
  const libraryGroupId = Number(formData.get("libraryGroupId"));
  const files = formData.getAll("drawings").filter((value): value is File => value instanceof File && value.size > 0);
  if (!Number.isInteger(libraryGroupId) || libraryGroupId <= 0) {
    return NextResponse.json({ error: "Valid library group is required." }, { status: 400 });
  }
  if (!files.length || files.length > CUSTOM_PART_MAX_FILES) {
    return NextResponse.json({ error: `Add 1 to ${CUSTOM_PART_MAX_FILES} PDF drawings.` }, { status: 400 });
  }
  const invalid = files.find((file) => !isPdf(file) || file.size > CUSTOM_PART_MAX_FILE_BYTES);
  if (invalid) return NextResponse.json({ error: `Only PDF files up to 50 MB are allowed: ${invalid.name}` }, { status: 400 });
  try {
    const group = await getPartLibraryGroup(libraryGroupId);
    if (!group) return NextResponse.json({ error: "Library group not found." }, { status: 404 });
    const result = await uploadPartLibraryGroupPdfs({
      libraryGroupId, groupName: group.groupName, folderId: group.driveFolderId,
      files: await Promise.all(files.map(async (file) => ({
        name: file.name, mimeType: "application/pdf", buffer: Buffer.from(await file.arrayBuffer()),
      }))),
    });
    if (!group.driveFolderId) {
      await setPartLibraryGroupDriveFolder({ libraryGroupId, driveFolderId: result.folderId, folderUrl: result.folderUrl });
    }
    return NextResponse.json({ ok: true, uploadedCount: files.length });
  } catch (error) {
    console.error(`Upload Parts Library group drawings ${libraryGroupId}`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to upload group drawings." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const authResult = await requireAuthOrShopFloor(request);
  if ("response" in authResult) return authResult.response;
  let body: { libraryGroupId?: unknown; fileId?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const libraryGroupId = Number(body.libraryGroupId);
  const fileId = String(body.fileId || "").trim();
  if (!Number.isInteger(libraryGroupId) || libraryGroupId <= 0 || !fileId) {
    return NextResponse.json({ error: "Valid library group and file are required." }, { status: 400 });
  }
  try {
    const group = await getPartLibraryGroup(libraryGroupId);
    if (!group?.driveFolderId) return NextResponse.json({ error: "Group drawing folder not found." }, { status: 404 });
    await trashPartLibraryGroupFile(group.driveFolderId, fileId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to remove group drawing." }, { status: 500 });
  }
}
