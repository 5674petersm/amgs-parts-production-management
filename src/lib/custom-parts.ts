import sql from "mssql";

import { getPool } from "@/lib/db";
import {
  bindDateTime2,
  bindInt,
  bindNVarChar,
} from "@/lib/sql-request";
import { plantLocalTimestampForSql } from "@/lib/time";
import type { CurrentCustomPart, CustomPartListItem } from "@/types/custom-part";

export type CustomPartOrderLookup = {
  amgsOrderNumber: string;
  nextPartNumber: string;
  nextPartSequence: number;
  existingCustomerName: string | null;
  partCount: number;
};

export type CustomPartRecordInput = {
  amgsOrderNumber: string;
  customerName: string;
  description: string;
  qtyNeeded: number;
  material: string;
  hasCustomColor: boolean;
  customColor: string;
  submittedBy: string;
  mappedOrderLineIds?: string[];
};

export type ReservedCustomPart = {
  customPartId: number;
  partNumber: string;
  partSequence: number;
};

export function formatCustomPartNumber(
  amgsOrderNumber: string,
  partSequence: number,
): string {
  return `${amgsOrderNumber.trim()}-${String(partSequence).padStart(3, "0")}`;
}

function normalizeOrderNumber(amgsOrderNumber: string): string {
  return amgsOrderNumber.trim();
}

export async function listCustomPartOrders(): Promise<string[]> {
  const pool = await getPool();
  const result = await pool.request().query<{ AMGSOrderNumber: string }>(`
    SELECT DISTINCT AMGSOrderNumber
    FROM dbo.tblcustomparts
    ORDER BY AMGSOrderNumber
  `);

  return result.recordset
    .map((row) => row.AMGSOrderNumber?.trim() ?? "")
    .filter(Boolean);
}

export async function listCurrentDriveCustomParts(): Promise<CurrentCustomPart[]> {
  const pool = await getPool();
  const result = await pool.request().query<{
    CustomPartID: number;
    AMGSOrderNumber: string;
    CustomerName: string;
    PartNumber: string;
    Description: string;
    QtyNeeded: number;
    Material: string;
    HasCustomColor: boolean;
    CustomColor: string | null;
    GoogleDriveFolderUrl: string;
    GoogleDrivePartFolderId: string;
  }>(`
    SELECT
      CustomPartID,
      AMGSOrderNumber,
      CustomerName,
      PartNumber,
      Description,
      QtyNeeded,
      Material,
      HasCustomColor,
      CustomColor,
      GoogleDriveFolderUrl,
      GoogleDrivePartFolderId
    FROM dbo.tblcustomparts
    WHERE CompletedAt IS NULL
      AND NULLIF(LTRIM(RTRIM(GoogleDrivePartFolderId)), N'') IS NOT NULL
    ORDER BY AMGSOrderNumber ASC, PartSequence ASC
  `);

  return result.recordset.map((row) => ({
    customPartId: Number(row.CustomPartID),
    orderNumber: row.AMGSOrderNumber.trim(),
    customerName: row.CustomerName.trim(),
    partNumber: row.PartNumber.trim(),
    description: row.Description.trim(),
    qtyNeeded: Number(row.QtyNeeded),
    material: row.Material.trim(),
    color: row.HasCustomColor ? row.CustomColor?.trim() || "Custom" : "Standard",
    hasCustomColor: Boolean(row.HasCustomColor),
    customColor: row.CustomColor?.trim() || "",
    folderUrl: row.GoogleDriveFolderUrl?.trim()
      || `https://drive.google.com/drive/folders/${row.GoogleDrivePartFolderId.trim()}`,
    driveFolderId: row.GoogleDrivePartFolderId.trim(),
    files: [],
    mappedOrderLineIds: [],
  }));
}

export async function listCustomPartsByOrder(
  amgsOrderNumber: string,
): Promise<CustomPartListItem[]> {
  const order = normalizeOrderNumber(amgsOrderNumber);
  if (!order) {
    throw new Error("AMGS order number is required.");
  }

  const pool = await getPool();
  const request = pool.request();
  bindNVarChar(request, "orderNumber", order, 50);

  const result = await request.query<{
    CustomPartID: number;
    AMGSOrderNumber: string;
    CustomerName: string;
    PartNumber: string;
    Description: string;
    QtyNeeded: number;
    Material: string;
    CompletedAt: Date | null;
  }>(`
    SELECT
      CustomPartID,
      AMGSOrderNumber,
      CustomerName,
      PartNumber,
      Description,
      QtyNeeded,
      Material,
      CompletedAt
    FROM dbo.tblcustomparts
    WHERE AMGSOrderNumber = @orderNumber
    ORDER BY PartSequence ASC
  `);

  return result.recordset.map((row) => ({
    customPartId: Number(row.CustomPartID),
    amgsOrderNumber: row.AMGSOrderNumber.trim(),
    customerName: row.CustomerName.trim(),
    partNumber: row.PartNumber.trim(),
    description: row.Description.trim(),
    qtyNeeded: Number(row.QtyNeeded),
    material: row.Material.trim(),
    mappedOrderLineIds: [],
    completedAt: row.CompletedAt ? row.CompletedAt.toISOString() : null,
  }));
}

export type CustomPartDriveFolder = {
  customPartId: number;
  partNumber: string;
  description: string;
  folderId: string;
  folderUrl: string;
  mappedOrderLineIds: string[];
};

export async function listCustomPartDriveFoldersByOrder(
  amgsOrderNumber: string,
): Promise<CustomPartDriveFolder[]> {
  const order = normalizeOrderNumber(amgsOrderNumber);
  if (!order) {
    throw new Error("AMGS order number is required.");
  }

  const pool = await getPool();
  const request = pool.request();
  bindNVarChar(request, "orderNumber", order, 50);
  const result = await request.query<{
    CustomPartID: number;
    PartNumber: string;
    Description: string;
    GoogleDrivePartFolderId: string | null;
    GoogleDriveFolderUrl: string | null;
  }>(`
    SELECT
      CustomPartID,
      PartNumber,
      Description,
      GoogleDrivePartFolderId,
      GoogleDriveFolderUrl
    FROM dbo.tblcustomparts
    WHERE AMGSOrderNumber = @orderNumber
      AND NULLIF(LTRIM(RTRIM(GoogleDrivePartFolderId)), N'') IS NOT NULL
    ORDER BY PartSequence ASC
  `);

  return result.recordset.map((row) => ({
    customPartId: Number(row.CustomPartID),
    partNumber: row.PartNumber.trim(),
    description: row.Description.trim(),
    folderId: row.GoogleDrivePartFolderId?.trim() || "",
    folderUrl: row.GoogleDriveFolderUrl?.trim() || "",
    mappedOrderLineIds: [],
  }));
}

export async function lookupCustomPartOrder(
  amgsOrderNumber: string,
): Promise<CustomPartOrderLookup> {
  const order = normalizeOrderNumber(amgsOrderNumber);
  if (!order) {
    throw new Error("AMGS order number is required.");
  }

  const pool = await getPool();
  const request = pool.request();
  bindNVarChar(request, "orderNumber", order, 50);

  const result = await request.query<{
    PartCount: number;
    MaxSequence: number | null;
    CustomerName: string | null;
  }>(`
    SELECT
      COUNT(1) AS PartCount,
      MAX(PartSequence) AS MaxSequence,
      (
        SELECT TOP (1) CustomerName
        FROM dbo.tblcustomparts AS innerParts
        WHERE innerParts.AMGSOrderNumber = @orderNumber
        ORDER BY innerParts.PartSequence ASC
      ) AS CustomerName
    FROM dbo.tblcustomparts
    WHERE AMGSOrderNumber = @orderNumber
  `);

  const row = result.recordset[0];
  const partCount = Number(row?.PartCount ?? 0);
  const nextPartSequence = Number(row?.MaxSequence ?? 0) + 1;

  return {
    amgsOrderNumber: order,
    nextPartNumber: formatCustomPartNumber(order, nextPartSequence),
    nextPartSequence,
    existingCustomerName: row?.CustomerName?.trim() || null,
    partCount,
  };
}

export async function reserveCustomPartNumber(
  input: CustomPartRecordInput,
): Promise<ReservedCustomPart> {
  const order = normalizeOrderNumber(input.amgsOrderNumber);
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin();

  try {
    const sequenceRequest = new sql.Request(transaction);
    bindNVarChar(sequenceRequest, "orderNumber", order, 50);

    const sequenceResult = await sequenceRequest.query<{ NextSequence: number }>(`
      SELECT ISNULL(MAX(PartSequence), 0) + 1 AS NextSequence
      FROM dbo.tblcustomparts WITH (UPDLOCK, HOLDLOCK)
      WHERE AMGSOrderNumber = @orderNumber
    `);

    const partSequence = Number(sequenceResult.recordset[0]?.NextSequence ?? 1);
    const partNumber = formatCustomPartNumber(order, partSequence);
    const submittedAt = plantLocalTimestampForSql();

    const insertRequest = new sql.Request(transaction);
    bindNVarChar(insertRequest, "orderNumber", order, 50);
    bindNVarChar(insertRequest, "customerName", input.customerName, 200);
    bindNVarChar(insertRequest, "partNumber", partNumber, 50);
    bindInt(insertRequest, "partSequence", partSequence);
    bindNVarChar(insertRequest, "description", input.description, 4000);
    bindInt(insertRequest, "qtyNeeded", input.qtyNeeded);
    bindNVarChar(insertRequest, "material", input.material, 50);
    insertRequest.input("hasCustomColor", input.hasCustomColor ? 1 : 0);
    bindNVarChar(insertRequest, "customColor", input.customColor, 100);
    bindNVarChar(insertRequest, "submittedBy", input.submittedBy, 256);
    bindDateTime2(insertRequest, "submittedAt", submittedAt);

    const insertResult = await insertRequest.query<{ CustomPartID: number }>(`
      INSERT INTO dbo.tblcustomparts (
        AMGSOrderNumber,
        CustomerName,
        PartNumber,
        PartSequence,
        Description,
        QtyNeeded,
        Material,
        HasCustomColor,
        CustomColor,
        SubmittedBy,
        SubmittedAt
      )
      OUTPUT INSERTED.CustomPartID
      VALUES (
        @orderNumber,
        @customerName,
        @partNumber,
        @partSequence,
        @description,
        @qtyNeeded,
        @material,
        @hasCustomColor,
        @customColor,
        @submittedBy,
        @submittedAt
      )
    `);

    const customPartId = Number(insertResult.recordset[0]?.CustomPartID);
    if (!customPartId) {
      throw new Error("Failed to reserve custom part number.");
    }

    await transaction.commit();

    return { customPartId, partNumber, partSequence };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function updateCustomPartDriveInfo(
  customPartId: number,
  driveInfo: {
    orderFolderId: string;
    partFolderId: string;
    folderUrl: string;
  },
): Promise<void> {
  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "customPartId", customPartId);
  bindNVarChar(request, "orderFolderId", driveInfo.orderFolderId, 100);
  bindNVarChar(request, "partFolderId", driveInfo.partFolderId, 100);
  bindNVarChar(request, "folderUrl", driveInfo.folderUrl, 500);

  await request.query(`
    UPDATE dbo.tblcustomparts
    SET
      GoogleDriveOrderFolderId = @orderFolderId,
      GoogleDrivePartFolderId = @partFolderId,
      GoogleDriveFolderUrl = @folderUrl
    WHERE CustomPartID = @customPartId
  `);
}

export async function updateCustomPartDetails(
  customPartId: number,
  input: Pick<CustomPartRecordInput,
    "customerName" | "description" | "qtyNeeded" | "material" | "hasCustomColor" | "customColor"
  >,
): Promise<void> {
  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "customPartId", customPartId);
  bindNVarChar(request, "customerName", input.customerName, 200);
  bindNVarChar(request, "description", input.description, 4000);
  bindInt(request, "qtyNeeded", input.qtyNeeded);
  bindNVarChar(request, "material", input.material, 50);
  request.input("hasCustomColor", input.hasCustomColor ? 1 : 0);
  bindNVarChar(request, "customColor", input.customColor, 100);
  await request.query(`
    UPDATE dbo.tblcustomparts
    SET CustomerName = @customerName,
        Description = @description,
        QtyNeeded = @qtyNeeded,
        Material = @material,
        HasCustomColor = @hasCustomColor,
        CustomColor = NULLIF(@customColor, N'')
    WHERE CustomPartID = @customPartId
  `);
}

export async function getCustomPartDriveFolderId(customPartId: number): Promise<string> {
  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "customPartId", customPartId);
  const result = await request.query<{ GoogleDrivePartFolderId: string | null }>(`
    SELECT GoogleDrivePartFolderId
    FROM dbo.tblcustomparts
    WHERE CustomPartID = @customPartId
  `);
  return result.recordset[0]?.GoogleDrivePartFolderId?.trim() || "";
}

export async function deleteCustomPart(customPartId: number): Promise<void> {
  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "customPartId", customPartId);

  await request.query(`
    DELETE FROM dbo.tblcustomparts
    WHERE CustomPartID = @customPartId
  `);
}
