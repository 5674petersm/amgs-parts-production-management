import sql from "mssql";

import { getPool } from "@/lib/db";
import {
  bindDateTime2,
  bindInt,
  bindNVarChar,
} from "@/lib/sql-request";
import { plantLocalTimestampForSql } from "@/lib/time";
import type { CustomPartListItem } from "@/types/custom-part";

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
    completedAt: row.CompletedAt ? row.CompletedAt.toISOString() : null,
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

export async function deleteCustomPart(customPartId: number): Promise<void> {
  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "customPartId", customPartId);

  await request.query(`
    DELETE FROM dbo.tblcustomparts
    WHERE CustomPartID = @customPartId
  `);
}
