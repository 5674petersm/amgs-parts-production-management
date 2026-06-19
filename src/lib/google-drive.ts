import { Readable } from "node:stream";

import { google } from "googleapis";

import { loadServiceAccountCredentials } from "@/lib/google-service-account";

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
    `Custom color: ${input.hasCustomColor ? input.customColor : "No"}`,
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
