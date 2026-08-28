import { Readable } from "node:stream";

import { google } from "googleapis";

import { loadServiceAccountCredentials } from "@/lib/google-service-account";
import { listCustomPartDriveFoldersByOrder } from "@/lib/custom-parts";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

export type CustomPartUploadInput = {
  amgsOrderNumber: string;
  customerName: string;
  partNumber: string;
  description: string;
  qtyNeeded: number;
  material: string;
  hasCustomColor: boolean;
  customColor: string;
  submittedBy: string;
  files: { name: string; mimeType: string; buffer: Buffer }[];
};

export type CustomPartUploadResult = {
  orderFolderId: string;
  partFolderId: string;
  folderUrl: string;
  uploadedFiles: { name: string; id: string }[];
};

export type CustomPartDriveFileGroup = {
  customPartId: number;
  partNumber: string;
  description: string;
  completedAt: string | null;
  folderUrl: string;
  files: { id: string; name: string; mimeType: string; url: string }[];
  mappedOrderLineIds: string[];
};

export type DirectDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  url: string;
};

function getDriveClient() {
  const credentials = loadServiceAccountCredentials();

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [DRIVE_SCOPE],
  });

  return google.drive({ version: "v3", auth });
}

function sanitizeDriveName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").trim() || "Untitled";
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function getDriveErrorMessage(error: unknown, parentFolderId: string): string {
  const apiMessage =
    error instanceof Error
      ? error.message
      : "Unable to upload to Google Drive.";

  if (apiMessage.includes("File not found")) {
    const credentials = loadServiceAccountCredentials();
    const serviceEmail =
      typeof credentials.client_email === "string"
        ? credentials.client_email
        : "your-service-account@project.iam.gserviceaccount.com";

    return [
      `Cannot access Google Drive folder ${parentFolderId}.`,
      `Add ${serviceEmail} as a Content manager on the Shared drive,`,
      "confirm GOOGLE_DRIVE_PARENT_FOLDER_ID is the folder ID from the folder URL",
      "(drive.google.com/drive/folders/FOLDER_ID), then restart the dev server.",
    ].join(" ");
  }

  return apiMessage;
}

async function assertParentFolderAccessible(
  drive: ReturnType<typeof google.drive>,
  parentFolderId: string,
): Promise<void> {
  try {
    await drive.files.get({
      fileId: parentFolderId,
      fields: "id,name",
      supportsAllDrives: true,
    });
  } catch (error) {
    throw new Error(getDriveErrorMessage(error, parentFolderId));
  }
}

async function findOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  parentId: string,
  name: string,
): Promise<string> {
  const safeName = sanitizeDriveName(name);
  const list = await drive.files.list({
    q: `'${parentId}' in parents and name='${escapeDriveQueryValue(safeName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const existingId = list.data.files?.[0]?.id;
  if (existingId) {
    return existingId;
  }

  const created = await drive.files.create({
    requestBody: {
      name: safeName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
  });

  if (!created.data.id) {
    throw new Error("Failed to create folder on Google Drive.");
  }

  return created.data.id;
}

async function uploadBuffer(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  name: string,
  mimeType: string,
  buffer: Buffer,
): Promise<{ name: string; id: string }> {
  const upload = await drive.files.create({
    requestBody: {
      name: sanitizeDriveName(name),
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    supportsAllDrives: true,
    fields: "id, name",
  });

  if (!upload.data.id || !upload.data.name) {
    throw new Error(`Failed to upload ${name} to Google Drive.`);
  }

  return { id: upload.data.id, name: upload.data.name };
}

export async function uploadCustomPartToDrive(
  input: CustomPartUploadInput,
): Promise<CustomPartUploadResult> {
  const parentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID?.trim();
  if (!parentFolderId) {
    throw new Error("Google Drive parent folder is not configured.");
  }

  const drive = getDriveClient();
  await assertParentFolderAccessible(drive, parentFolderId);

  const orderFolderName = `${sanitizeDriveName(input.amgsOrderNumber)} - ${sanitizeDriveName(input.customerName)}`;
  const orderFolderId = await findOrCreateFolder(
    drive,
    parentFolderId,
    orderFolderName,
  );
  const partFolderId = await findOrCreateFolder(
    drive,
    orderFolderId,
    sanitizeDriveName(input.partNumber),
  );

  const metadataText = [
    `AMGS order number: ${input.amgsOrderNumber}`,
    `Customer name: ${input.customerName}`,
    `Part number: ${input.partNumber}`,
    `Description: ${input.description}`,
    `Qty needed: ${input.qtyNeeded}`,
    `Material: ${input.material}`,
    `Color: ${input.customColor}`,
    `Color type: ${input.hasCustomColor ? "Custom" : "Standard"}`,
    `Submitted by: ${input.submittedBy}`,
    `Submitted at: ${new Date().toISOString()}`,
  ].join("\n");

  const uploadedFiles: { name: string; id: string }[] = [];

  uploadedFiles.push(
    await uploadBuffer(
      drive,
      partFolderId,
      "part-details.txt",
      "text/plain",
      Buffer.from(metadataText, "utf-8"),
    ),
  );

  for (const file of input.files) {
    uploadedFiles.push(
      await uploadBuffer(
        drive,
        partFolderId,
        file.name,
        file.mimeType || "application/octet-stream",
        file.buffer,
      ),
    );
  }

  return {
    orderFolderId,
    partFolderId,
    folderUrl: `https://drive.google.com/drive/folders/${partFolderId}`,
    uploadedFiles,
  };
}

export async function copyCustomPartToDrive(input: Omit<CustomPartUploadInput, "files"> & {
  sourcePartFolderId: string;
}): Promise<CustomPartUploadResult> {
  const parentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID?.trim();
  if (!parentFolderId) throw new Error("Google Drive parent folder is not configured.");
  if (!input.sourcePartFolderId) throw new Error("The source part has no Google Drive folder.");

  const drive = getDriveClient();
  await assertParentFolderAccessible(drive, parentFolderId);
  const orderFolderId = await findOrCreateFolder(
    drive,
    parentFolderId,
    `${sanitizeDriveName(input.amgsOrderNumber)} - ${sanitizeDriveName(input.customerName)}`,
  );
  const partFolderId = await findOrCreateFolder(drive, orderFolderId, input.partNumber);
  const sourceFiles = await drive.files.list({
    q: `'${escapeDriveQueryValue(input.sourcePartFolderId)}' in parents and trashed=false`,
    fields: "files(id,name,mimeType)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const metadataText = [
    `AMGS order number: ${input.amgsOrderNumber}`,
    `Customer name: ${input.customerName}`,
    `Part number: ${input.partNumber}`,
    `Description: ${input.description}`,
    `Qty needed: ${input.qtyNeeded}`,
    `Material: ${input.material}`,
    `Color: ${input.customColor}`,
    `Color type: ${input.hasCustomColor ? "Custom" : "Standard"}`,
    `Copied by: ${input.submittedBy}`,
    `Copied at: ${new Date().toISOString()}`,
  ].join("\n");
  const uploadedFiles = [await uploadBuffer(
    drive,
    partFolderId,
    "part-details.txt",
    "text/plain",
    Buffer.from(metadataText, "utf-8"),
  )];

  for (const file of sourceFiles.data.files ?? []) {
    if (!file.id || !file.name || file.name === "part-details.txt") continue;
    const copied = await drive.files.copy({
      fileId: file.id,
      requestBody: { name: sanitizeDriveName(file.name), parents: [partFolderId] },
      supportsAllDrives: true,
      fields: "id,name",
    });
    if (!copied.data.id || !copied.data.name) throw new Error(`Failed to copy ${file.name}.`);
    uploadedFiles.push({ id: copied.data.id, name: copied.data.name });
  }

  return {
    orderFolderId,
    partFolderId,
    folderUrl: `https://drive.google.com/drive/folders/${partFolderId}`,
    uploadedFiles,
  };
}

type PartLibraryDriveInput = {
  partName: string;
  description: string;
  material: string;
  hasCustomColor: boolean;
  customColor: string;
  submittedBy: string;
};

async function createLibraryFolder(
  drive: ReturnType<typeof google.drive>,
  parentFolderId: string,
  partName: string,
): Promise<string> {
  const libraryFolderId = await findOrCreateFolder(drive, parentFolderId, "Parts Library");
  const uniqueName = `${sanitizeDriveName(partName)} - ${Date.now()}`;
  return findOrCreateFolder(drive, libraryFolderId, uniqueName);
}

function libraryMetadata(input: PartLibraryDriveInput): Buffer {
  return Buffer.from([
    `Library part: ${input.partName}`,
    `Description: ${input.description}`,
    `Material: ${input.material}`,
    `Color: ${input.customColor}`,
    `Color type: ${input.hasCustomColor ? "Custom" : "Standard"}`,
    `Saved by: ${input.submittedBy}`,
    `Saved at: ${new Date().toISOString()}`,
  ].join("\n"), "utf-8");
}

export async function uploadPartLibraryFiles(input: PartLibraryDriveInput & {
  files: CustomPartUploadInput["files"];
}): Promise<{ partFolderId: string; folderUrl: string }> {
  const parentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID?.trim();
  if (!parentFolderId) throw new Error("Google Drive parent folder is not configured.");
  const drive = getDriveClient();
  await assertParentFolderAccessible(drive, parentFolderId);
  const partFolderId = await createLibraryFolder(drive, parentFolderId, input.partName);
  await uploadBuffer(drive, partFolderId, "part-details.txt", "text/plain", libraryMetadata(input));
  for (const file of input.files) {
    await uploadBuffer(drive, partFolderId, file.name, file.mimeType || "application/octet-stream", file.buffer);
  }
  return { partFolderId, folderUrl: `https://drive.google.com/drive/folders/${partFolderId}` };
}

export async function updatePartLibraryFiles(input: PartLibraryDriveInput & {
  folderId: string;
  files: CustomPartUploadInput["files"];
  removeFileIds: string[];
}): Promise<void> {
  const drive = getDriveClient();
  const result = await drive.files.list({
    q: `'${escapeDriveQueryValue(input.folderId)}' in parents and trashed=false`,
    fields: "files(id,name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const children = result.data.files ?? [];
  const childIds = new Set(children.flatMap((file) => file.id ? [file.id] : []));
  if (input.removeFileIds.some((fileId) => !childIds.has(fileId))) {
    throw new Error("One of the selected drawings does not belong to this library part.");
  }
  const metadataIds = children
    .filter((file) => file.name === "part-details.txt" && file.id)
    .map((file) => file.id!);
  for (const fileId of [...new Set([...input.removeFileIds, ...metadataIds])]) {
    await drive.files.update({ fileId, requestBody: { trashed: true }, supportsAllDrives: true });
  }
  await uploadBuffer(drive, input.folderId, "part-details.txt", "text/plain", libraryMetadata(input));
  for (const file of input.files) {
    await uploadBuffer(drive, input.folderId, file.name, file.mimeType || "application/octet-stream", file.buffer);
  }
}

export async function syncLibraryPartDrawingsToFolder(input: {
  sourceLibraryFolderId: string;
  targetCustomPartFolderId: string;
}): Promise<number> {
  const drive = getDriveClient();
  const [sourceResult, targetResult] = await Promise.all([
    drive.files.list({
      q: `'${escapeDriveQueryValue(input.sourceLibraryFolderId)}' in parents and trashed=false`,
      fields: "files(id,name)", supportsAllDrives: true, includeItemsFromAllDrives: true,
    }),
    drive.files.list({
      q: `'${escapeDriveQueryValue(input.targetCustomPartFolderId)}' in parents and trashed=false`,
      fields: "files(id,name)", supportsAllDrives: true, includeItemsFromAllDrives: true,
    }),
  ]);
  const sourceFiles = (sourceResult.data.files ?? []).filter((file) => file.id && file.name && file.name !== "part-details.txt");
  if (!sourceFiles.length) throw new Error("The library part has no drawing files to synchronize.");
  const targetFiles = (targetResult.data.files ?? []).filter((file) => file.id && file.name && file.name !== "part-details.txt");
  const staged: Array<{ id: string; name: string }> = [];
  const trashedTargetIds: string[] = [];
  try {
    for (const [index, file] of sourceFiles.entries()) {
      const copied = await drive.files.copy({
        fileId: file.id!,
        requestBody: { name: `.__library-sync-${Date.now()}-${index}-${sanitizeDriveName(file.name!)}`, parents: [input.targetCustomPartFolderId] },
        supportsAllDrives: true,
        fields: "id,name",
      });
      if (!copied.data.id) throw new Error(`Failed to copy ${file.name}.`);
      staged.push({ id: copied.data.id, name: file.name! });
    }
    for (const file of targetFiles) {
      await drive.files.update({ fileId: file.id!, requestBody: { trashed: true }, supportsAllDrives: true });
      trashedTargetIds.push(file.id!);
    }
    for (const file of staged) {
      await drive.files.update({
        fileId: file.id, requestBody: { name: sanitizeDriveName(file.name) }, supportsAllDrives: true,
      });
    }
    return staged.length;
  } catch (error) {
    await Promise.allSettled(staged.map((file) => drive.files.update({
      fileId: file.id, requestBody: { trashed: true }, supportsAllDrives: true,
    })));
    await Promise.allSettled(trashedTargetIds.map((fileId) => drive.files.update({
      fileId, requestBody: { trashed: false }, supportsAllDrives: true,
    })));
    throw error;
  }
}

export async function copyCustomPartToLibrary(input: PartLibraryDriveInput & {
  sourcePartFolderId: string;
}): Promise<{ partFolderId: string; folderUrl: string }> {
  const parentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID?.trim();
  if (!parentFolderId) throw new Error("Google Drive parent folder is not configured.");
  if (!input.sourcePartFolderId) throw new Error("The source part has no Google Drive folder.");
  const drive = getDriveClient();
  await assertParentFolderAccessible(drive, parentFolderId);
  const partFolderId = await createLibraryFolder(drive, parentFolderId, input.partName);
  await uploadBuffer(drive, partFolderId, "part-details.txt", "text/plain", libraryMetadata(input));
  const sourceFiles = await drive.files.list({
    q: `'${escapeDriveQueryValue(input.sourcePartFolderId)}' in parents and trashed=false`,
    fields: "files(id,name)", supportsAllDrives: true, includeItemsFromAllDrives: true,
  });
  for (const file of sourceFiles.data.files ?? []) {
    if (!file.id || !file.name || file.name === "part-details.txt") continue;
    await drive.files.copy({
      fileId: file.id,
      requestBody: { name: sanitizeDriveName(file.name), parents: [partFolderId] },
      supportsAllDrives: true,
    });
  }
  return { partFolderId, folderUrl: `https://drive.google.com/drive/folders/${partFolderId}` };
}

function isMissingDriveFileError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as {
    code?: unknown;
    response?: { status?: unknown };
  };
  return record.code === 404 || record.code === 410
    || record.response?.status === 404 || record.response?.status === 410;
}

export async function trashCustomPartFolder(folderId: string): Promise<boolean> {
  if (!folderId) return false;
  const drive = getDriveClient();
  try {
    const current = await drive.files.get({
      fileId: folderId,
      fields: "trashed",
      supportsAllDrives: true,
    });
    if (current.data.trashed) return false;
    await drive.files.update({
      fileId: folderId,
      requestBody: { trashed: true },
      supportsAllDrives: true,
    });
    return true;
  } catch (error) {
    // A folder the user already removed is in the desired end state.
    if (isMissingDriveFileError(error)) return false;
    throw error;
  }
}

export async function restoreTrashedCustomPartFolder(folderId: string): Promise<void> {
  if (!folderId) return;
  await getDriveClient().files.update({
    fileId: folderId,
    requestBody: { trashed: false },
    supportsAllDrives: true,
  });
}

export async function listCustomPartFilesForOrder(
  orderNumber: string,
): Promise<CustomPartDriveFileGroup[]> {
  const folders = await listCustomPartDriveFoldersByOrder(orderNumber);
  if (!folders.length) {
    return [];
  }

  const drive = getDriveClient();
  return Promise.all(folders.map(async (folder) => {
    const files = await listCustomPartFilesInFolder(folder.folderId, drive);

    return {
      customPartId: folder.customPartId,
      partNumber: folder.partNumber,
      description: folder.description,
      completedAt: folder.completedAt,
      folderUrl: folder.folderUrl || `https://drive.google.com/drive/folders/${folder.folderId}`,
      files,
      mappedOrderLineIds: folder.mappedOrderLineIds,
    };
  }));
}

export async function listCustomPartFolderStates(
  folders: Array<{ folderId: string; partNumber: string }>,
): Promise<Map<string, { files: DirectDriveFile[]; cut: boolean }>> {
  const drive = getDriveClient();
  const folderMetadata = new Map<string, Promise<DriveFolderMetadata>>();
  const states = await Promise.all(folders.map(async (folder) => {
    const [files, cut] = await Promise.all([
      listCustomPartFilesInFolder(folder.folderId, drive).catch((error) => {
        console.error(`Unable to list files for ${folder.partNumber}`, error);
        return [];
      }),
      isCustomPartFolderCut(folder.folderId, drive, folderMetadata).catch((error) => {
        console.error(`Unable to check cut status for ${folder.partNumber}`, error);
        return false;
      }),
    ]);
    return [folder.folderId, { files, cut }] as const;
  }));
  return new Map(states);
}

type DriveFolderMetadata = { name: string; parents: string[] };

function loadDriveFolderMetadata(
  folderId: string,
  drive: ReturnType<typeof google.drive>,
  cache: Map<string, Promise<DriveFolderMetadata>>,
): Promise<DriveFolderMetadata> {
  const cached = cache.get(folderId);
  if (cached) return cached;

  const pending = drive.files.get({
    fileId: folderId,
    fields: "name,parents",
    supportsAllDrives: true,
  }).then((result) => ({
    name: result.data.name?.trim() || "",
    parents: result.data.parents || [],
  }));
  cache.set(folderId, pending);
  return pending;
}

async function isCustomPartFolderCut(
  partFolderId: string,
  drive: ReturnType<typeof google.drive>,
  cache: Map<string, Promise<DriveFolderMetadata>>,
): Promise<boolean> {
  const driveRootId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID?.trim();
  let folderId = partFolderId;
  const visited = new Set<string>();

  // Walk upward to detect both an order-level Completed folder and the
  // root-level Completed folder that receives an entire finished order.
  while (folderId && folderId !== driveRootId && !visited.has(folderId)) {
    visited.add(folderId);
    const folder = await loadDriveFolderMetadata(folderId, drive, cache);
    if (folderId !== partFolderId && ["complete", "completed"].includes(folder.name.toLowerCase())) {
      return true;
    }
    folderId = folder.parents[0] || "";
  }

  return false;
}

export async function listCustomPartFilesInFolder(
  folderId: string,
  existingDrive?: ReturnType<typeof google.drive>,
): Promise<DirectDriveFile[]> {
  const drive = existingDrive ?? getDriveClient();
  const result = await drive.files.list({
    q: `'${escapeDriveQueryValue(folderId)}' in parents and trashed=false`,
    fields: "files(id,name,mimeType)",
    orderBy: "name",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return (result.data.files ?? [])
    .filter((file) => file.id && file.name && file.name !== "part-details.txt")
    .map((file) => ({
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType || "application/octet-stream",
      url: `/api/custom-part-files/${encodeURIComponent(file.id!)}`,
    }));
}

export type CompletedFolderMove = {
  fileId: string;
  previousName: string;
  previousParents: string[];
  completedFolderId: string;
  changed: boolean;
};

export async function moveCustomPartFolderToCompleted(input: {
  partFolderId: string;
  orderFolderId: string;
  partNumber: string;
  completionDate: string;
}): Promise<CompletedFolderMove> {
  if (!input.partFolderId || !input.orderFolderId) {
    throw new Error("The custom part Google Drive folder is not configured.");
  }
  const drive = getDriveClient();
  const current = await drive.files.get({
    fileId: input.partFolderId,
    fields: "id,name,parents",
    supportsAllDrives: true,
  });
  const previousName = current.data.name || input.partNumber;
  const previousParents = current.data.parents || [];
  const completedFolderId = await findOrCreateFolder(drive, input.orderFolderId, "Completed");
  const completedName = sanitizeDriveName(`${input.partNumber} - Completed ${input.completionDate}`);
  const alreadyMoved = previousParents.includes(completedFolderId);
  const changed = !alreadyMoved || previousName !== completedName;
  if (changed) {
    await drive.files.update({
      fileId: input.partFolderId,
      addParents: alreadyMoved ? undefined : completedFolderId,
      removeParents: previousParents.filter((parent) => parent !== completedFolderId).join(",") || undefined,
      requestBody: { name: completedName },
      supportsAllDrives: true,
      fields: "id,name,parents",
    });
  }
  return {
    fileId: input.partFolderId,
    previousName,
    previousParents,
    completedFolderId,
    changed,
  };
}

export async function restoreCustomPartFolder(move: CompletedFolderMove): Promise<void> {
  if (!move.changed) return;
  const drive = getDriveClient();
  const current = await drive.files.get({
    fileId: move.fileId,
    fields: "parents",
    supportsAllDrives: true,
  });
  const currentParents = current.data.parents || [];
  await drive.files.update({
    fileId: move.fileId,
    addParents: move.previousParents.filter((parent) => !currentParents.includes(parent)).join(",") || undefined,
    removeParents: currentParents.filter((parent) => !move.previousParents.includes(parent)).join(",") || undefined,
    requestBody: { name: move.previousName },
    supportsAllDrives: true,
    fields: "id,name,parents",
  });
}

export async function downloadCustomPartFile(fileId: string): Promise<{
  name: string;
  mimeType: string;
  stream: Readable;
}> {
  const drive = getDriveClient();
  const metadata = await drive.files.get({
    fileId,
    fields: "id,name,mimeType",
    supportsAllDrives: true,
  });
  const response = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" },
  );
  return {
    name: metadata.data.name || "custom-part-file",
    mimeType: metadata.data.mimeType || "application/octet-stream",
    stream: response.data as Readable,
  };
}

export async function uploadFilesToCustomPartFolder(
  folderId: string,
  files: { name: string; mimeType: string; buffer: Buffer }[],
): Promise<{ name: string; id: string }[]> {
  const drive = getDriveClient();
  return Promise.all(files.map((file) => uploadBuffer(
    drive,
    folderId,
    file.name,
    file.mimeType || "application/octet-stream",
    file.buffer,
  )));
}
