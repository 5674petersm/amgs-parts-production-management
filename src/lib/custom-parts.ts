import sql from "mssql";

import { getPool } from "@/lib/db";
import {
  bindDateTime2,
  bindInt,
  bindNVarChar,
} from "@/lib/sql-request";
import { plantLocalTimestampForSql } from "@/lib/time";
import type { CurrentCustomPart, CustomPartListItem } from "@/types/custom-part";
import { CUSTOM_PART_PROCESSES, parseCustomPartProcesses, serializeCustomPartProcesses, type CustomPartProcess } from "@/constants/custom-part-processes";

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
  groupId?: string | null;
  sourceLibraryPartId?: number | null;
  sourceLibraryGroupId?: number | null;
  libraryGroupAssignmentId?: string | null;
  libraryGroupSetQuantity?: number | null;
  requiredProcesses?: CustomPartProcess[];
};

export type ReservedCustomPart = {
  customPartId: number;
  partNumber: string;
  partSequence: number;
};

export type CopyableCustomPartRecord = {
  customPartId: number;
  amgsOrderNumber: string;
  customerName: string;
  partNumber: string;
  description: string;
  qtyNeeded: number;
  material: string;
  hasCustomColor: boolean;
  customColor: string;
  partFolderId: string;
  completedAt: string | null;
  groupId: string | null;
  requiredProcesses: CustomPartProcess[];
};

type CustomPartProcessColumns = {
  RequiredProcesses: string | null;
  CutCompletedAt: Date | null;
  WeldCompletedAt: Date | null;
  MeshCompletedAt: Date | null;
  CncCompletedAt: Date | null;
  BendCompletedAt: Date | null;
};

const PROCESS_DATE_COLUMNS: Record<CustomPartProcess, keyof CustomPartProcessColumns> = {
  cut: "CutCompletedAt", weld: "WeldCompletedAt", mesh: "MeshCompletedAt",
  cnc: "CncCompletedAt", bend: "BendCompletedAt",
};

function processProgress(row: CustomPartProcessColumns): Partial<Record<CustomPartProcess, string>> {
  return Object.fromEntries(CUSTOM_PART_PROCESSES.flatMap((process) => {
    const date = row[PROCESS_DATE_COLUMNS[process]] as Date | null;
    return date ? [[process, date.toISOString()]] : [];
  }));
}

function processSelect(available: boolean) {
  return available
    ? "RequiredProcesses, CutCompletedAt, WeldCompletedAt, MeshCompletedAt, CncCompletedAt, BendCompletedAt"
    : "NULL AS RequiredProcesses, NULL AS CutCompletedAt, NULL AS WeldCompletedAt, NULL AS MeshCompletedAt, NULL AS CncCompletedAt, NULL AS BendCompletedAt";
}

export function formatCustomPartNumber(
  amgsOrderNumber: string,
  partSequence: number,
): string {
  return `${amgsOrderNumber.trim()}-${String(partSequence).padStart(3, "0")}`;
}

function normalizeOrderNumber(amgsOrderNumber: string): string {
  return amgsOrderNumber.trim();
}

export async function customPartGroupsAvailable(): Promise<boolean> {
  const pool = await getPool();
  const result = await pool.request().query<{ Available: number }>(`
    SELECT CASE WHEN COL_LENGTH(N'dbo.tblcustomparts', N'CustomPartGroupID') IS NULL THEN 0 ELSE 1 END AS Available
  `);
  return Boolean(result.recordset[0]?.Available);
}

export async function customPartProcessesAvailable(): Promise<boolean> {
  const pool = await getPool();
  const result = await pool.request().query<{ Available: number }>(`
    SELECT CASE WHEN COL_LENGTH(N'dbo.tblcustomparts', N'RequiredProcesses') IS NOT NULL
      AND COL_LENGTH(N'dbo.tblcustomparts', N'CutCompletedAt') IS NOT NULL
      AND COL_LENGTH(N'dbo.tblcustomparts', N'WeldCompletedAt') IS NOT NULL
      AND COL_LENGTH(N'dbo.tblcustomparts', N'MeshCompletedAt') IS NOT NULL
      AND COL_LENGTH(N'dbo.tblcustomparts', N'CncCompletedAt') IS NOT NULL
      AND COL_LENGTH(N'dbo.tblcustomparts', N'BendCompletedAt') IS NOT NULL
      THEN 1 ELSE 0 END AS Available
  `);
  return Boolean(result.recordset[0]?.Available);
}

export async function libraryGroupAssignmentTrackingAvailable(): Promise<boolean> {
  const pool = await getPool();
  const result = await pool.request().query<{ Available: number }>(`
    SELECT CASE WHEN COL_LENGTH(N'dbo.tblcustomparts', N'SourceLibraryGroupID') IS NOT NULL
      AND COL_LENGTH(N'dbo.tblcustomparts', N'LibraryGroupAssignmentID') IS NOT NULL
      AND COL_LENGTH(N'dbo.tblcustomparts', N'LibraryGroupSetQuantity') IS NOT NULL
      THEN 1 ELSE 0 END AS Available
  `);
  return Boolean(result.recordset[0]?.Available);
}

export type TrackedLibraryGroupPart = {
  customPartId: number;
  orderNumber: string;
  customerName: string;
  sourceLibraryPartId: number;
  sourceLibraryGroupId: number;
  libraryGroupAssignmentId: string;
  libraryGroupSetQuantity: number;
  driveFolderId: string;
};

export async function listTrackedLibraryGroupParts(libraryGroupId: number): Promise<TrackedLibraryGroupPart[]> {
  if (!(await libraryGroupAssignmentTrackingAvailable())) return [];
  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "libraryGroupId", libraryGroupId);
  const result = await request.query<{
    CustomPartID: number; AMGSOrderNumber: string; CustomerName: string; SourceLibraryPartID: number;
    SourceLibraryGroupID: number; LibraryGroupAssignmentID: string; LibraryGroupSetQuantity: number;
    GoogleDrivePartFolderId: string | null;
  }>(`SELECT CustomPartID, AMGSOrderNumber, CustomerName, SourceLibraryPartID,
      SourceLibraryGroupID, LibraryGroupAssignmentID, LibraryGroupSetQuantity, GoogleDrivePartFolderId
    FROM dbo.tblcustomparts
    WHERE SourceLibraryGroupID=@libraryGroupId
      AND LibraryGroupAssignmentID IS NOT NULL
      AND SourceLibraryPartID IS NOT NULL
      AND LibraryGroupSetQuantity > 0
      AND CompletedAt IS NULL`);
  return result.recordset.map((row) => ({
    customPartId: Number(row.CustomPartID), orderNumber: row.AMGSOrderNumber.trim(),
    customerName: row.CustomerName.trim(), sourceLibraryPartId: Number(row.SourceLibraryPartID),
    sourceLibraryGroupId: Number(row.SourceLibraryGroupID), libraryGroupAssignmentId: String(row.LibraryGroupAssignmentID),
    libraryGroupSetQuantity: Number(row.LibraryGroupSetQuantity), driveFolderId: row.GoogleDrivePartFolderId?.trim() || "",
  }));
}

export type ActiveLibraryPartCopy = {
  customPartId: number; orderNumber: string; partNumber: string; driveFolderId: string;
};

export async function listActiveLibraryPartCopies(libraryPartId: number): Promise<ActiveLibraryPartCopy[]> {
  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "libraryPartId", libraryPartId);
  const result = await request.query<{
    CustomPartID: number; AMGSOrderNumber: string; PartNumber: string; GoogleDrivePartFolderId: string | null;
  }>(`SELECT CustomPartID, AMGSOrderNumber, PartNumber, GoogleDrivePartFolderId
    FROM dbo.tblcustomparts
    WHERE SourceLibraryPartID=@libraryPartId AND CompletedAt IS NULL
      AND NULLIF(LTRIM(RTRIM(GoogleDrivePartFolderId)), N'') IS NOT NULL`);
  return result.recordset.map((row) => ({
    customPartId: Number(row.CustomPartID), orderNumber: row.AMGSOrderNumber.trim(),
    partNumber: row.PartNumber.trim(), driveFolderId: row.GoogleDrivePartFolderId?.trim() || "",
  }));
}

export type CustomPartOrderChoice = { order: string; customer: string };

export async function listCustomPartOrderChoices(): Promise<CustomPartOrderChoice[]> {
  const pool = await getPool();
  const result = await pool.request().query<{
    AMGSOrderNumber: string;
    CustomerName: string;
  }>(`
    SELECT AMGSOrderNumber, MAX(CustomerName) AS CustomerName
    FROM dbo.tblcustomparts
    GROUP BY AMGSOrderNumber
    ORDER BY AMGSOrderNumber
  `);

  return result.recordset
    .map((row) => ({
      order: row.AMGSOrderNumber?.trim() ?? "",
      customer: row.CustomerName?.trim() || "Unknown customer",
    }))
    .filter((choice) => choice.order);
}

export async function listCustomPartOrders(): Promise<string[]> {
  return (await listCustomPartOrderChoices()).map((choice) => choice.order);
}

export async function listCurrentDriveCustomParts(): Promise<CurrentCustomPart[]> {
  const pool = await getPool();
  const groupingAvailable = await customPartGroupsAvailable();
  const processesAvailable = await customPartProcessesAvailable();
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
    CustomPartGroupID: string | null;
  } & CustomPartProcessColumns>(`
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
      GoogleDrivePartFolderId,
      ${groupingAvailable ? "CustomPartGroupID" : "NULL AS CustomPartGroupID"},
      ${processSelect(processesAvailable)}
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
    color: row.HasCustomColor
      ? row.CustomColor?.trim() || "Custom"
      : row.CustomColor?.trim() || "Standard (unspecified)",
    hasCustomColor: Boolean(row.HasCustomColor),
    customColor: row.CustomColor?.trim() || "",
    folderUrl: row.GoogleDriveFolderUrl?.trim()
      || `https://drive.google.com/drive/folders/${row.GoogleDrivePartFolderId.trim()}`,
    driveFolderId: row.GoogleDrivePartFolderId.trim(),
    files: [],
    mappedOrderLineIds: [],
    cut: false,
    completedAt: null,
    groupId: row.CustomPartGroupID ? String(row.CustomPartGroupID) : null,
    requiredProcesses: parseCustomPartProcesses(row.RequiredProcesses),
    processProgress: processProgress(row),
  }));
}

export async function listCompletedDriveCustomParts(): Promise<CurrentCustomPart[]> {
  const pool = await getPool();
  const groupingAvailable = await customPartGroupsAvailable();
  const processesAvailable = await customPartProcessesAvailable();
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
    CompletedAt: Date;
    CustomPartGroupID: string | null;
  } & CustomPartProcessColumns>(`
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
      GoogleDrivePartFolderId,
      CompletedAt,
      ${groupingAvailable ? "CustomPartGroupID" : "NULL AS CustomPartGroupID"},
      ${processSelect(processesAvailable)}
    FROM dbo.tblcustomparts
    WHERE CompletedAt IS NOT NULL
      AND NULLIF(LTRIM(RTRIM(GoogleDrivePartFolderId)), N'') IS NOT NULL
    ORDER BY CompletedAt DESC, AMGSOrderNumber DESC, PartSequence ASC
  `);

  return result.recordset.map((row) => ({
    customPartId: Number(row.CustomPartID),
    orderNumber: row.AMGSOrderNumber.trim(),
    customerName: row.CustomerName.trim(),
    partNumber: row.PartNumber.trim(),
    description: row.Description.trim(),
    qtyNeeded: Number(row.QtyNeeded),
    material: row.Material.trim(),
    color: row.HasCustomColor
      ? row.CustomColor?.trim() || "Custom"
      : row.CustomColor?.trim() || "Standard (unspecified)",
    hasCustomColor: Boolean(row.HasCustomColor),
    customColor: row.CustomColor?.trim() || "",
    folderUrl: row.GoogleDriveFolderUrl?.trim()
      || `https://drive.google.com/drive/folders/${row.GoogleDrivePartFolderId.trim()}`,
    driveFolderId: row.GoogleDrivePartFolderId.trim(),
    files: [],
    mappedOrderLineIds: [],
    cut: false,
    completedAt: row.CompletedAt.toISOString(),
    groupId: row.CustomPartGroupID ? String(row.CustomPartGroupID) : null,
    requiredProcesses: parseCustomPartProcesses(row.RequiredProcesses),
    processProgress: processProgress(row),
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
    CustomPartGroupID: string | null;
  } & CustomPartProcessColumns>(`
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

export async function listCopyableCustomPartsByOrder(
  amgsOrderNumber: string,
): Promise<CopyableCustomPartRecord[]> {
  const order = normalizeOrderNumber(amgsOrderNumber);
  if (!order) throw new Error("AMGS order number is required.");

  const pool = await getPool();
  const groupingAvailable = await customPartGroupsAvailable();
  const processesAvailable = await customPartProcessesAvailable();
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
    HasCustomColor: boolean;
    CustomColor: string | null;
    GoogleDrivePartFolderId: string | null;
    CompletedAt: Date | null;
    CustomPartGroupID: string | null;
  } & CustomPartProcessColumns>(`
    SELECT CustomPartID, AMGSOrderNumber, CustomerName, PartNumber,
      Description, QtyNeeded, Material, HasCustomColor, CustomColor,
      GoogleDrivePartFolderId, CompletedAt, ${groupingAvailable ? "CustomPartGroupID" : "NULL AS CustomPartGroupID"},
      ${processSelect(processesAvailable)}
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
    hasCustomColor: Boolean(row.HasCustomColor),
    customColor: row.CustomColor?.trim() || "",
    partFolderId: row.GoogleDrivePartFolderId?.trim() || "",
    completedAt: row.CompletedAt ? row.CompletedAt.toISOString() : null,
    groupId: row.CustomPartGroupID ? String(row.CustomPartGroupID) : null,
    requiredProcesses: parseCustomPartProcesses(row.RequiredProcesses),
  }));
}

export type CustomPartDriveFolder = {
  customPartId: number;
  partNumber: string;
  description: string;
  completedAt: string | null;
  folderId: string;
  folderUrl: string;
  mappedOrderLineIds: string[];
  requiredProcesses: CustomPartProcess[];
  processProgress: Partial<Record<CustomPartProcess, string>>;
};

export async function listCustomPartDriveFoldersByOrder(
  amgsOrderNumber: string,
): Promise<CustomPartDriveFolder[]> {
  const order = normalizeOrderNumber(amgsOrderNumber);
  if (!order) {
    throw new Error("AMGS order number is required.");
  }

  const pool = await getPool();
  const processesAvailable = await customPartProcessesAvailable();
  const request = pool.request();
  bindNVarChar(request, "orderNumber", order, 50);
  const result = await request.query<{
    CustomPartID: number;
    PartNumber: string;
    Description: string;
    CompletedAt: Date | null;
    GoogleDrivePartFolderId: string | null;
    GoogleDriveFolderUrl: string | null;
  } & CustomPartProcessColumns>(`
    SELECT
      CustomPartID,
      PartNumber,
      Description,
      CompletedAt,
      GoogleDrivePartFolderId,
      GoogleDriveFolderUrl,
      ${processSelect(processesAvailable)}
    FROM dbo.tblcustomparts
    WHERE AMGSOrderNumber = @orderNumber
      AND NULLIF(LTRIM(RTRIM(GoogleDrivePartFolderId)), N'') IS NOT NULL
    ORDER BY PartSequence ASC
  `);

  return result.recordset.map((row) => ({
    customPartId: Number(row.CustomPartID),
    partNumber: row.PartNumber.trim(),
    description: row.Description.trim(),
    completedAt: row.CompletedAt ? row.CompletedAt.toISOString() : null,
    folderId: row.GoogleDrivePartFolderId?.trim() || "",
    folderUrl: row.GoogleDriveFolderUrl?.trim() || "",
    mappedOrderLineIds: [],
    requiredProcesses: parseCustomPartProcesses(row.RequiredProcesses),
    processProgress: processProgress(row),
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
  const trackLibraryGroup = Boolean(input.sourceLibraryGroupId && input.libraryGroupAssignmentId
    && input.libraryGroupSetQuantity && await libraryGroupAssignmentTrackingAvailable());
  const processesAvailable = await customPartProcessesAvailable();
  if (input.requiredProcesses?.length && !processesAvailable) {
    throw new Error("Custom part processes are awaiting their database migration.");
  }
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
    if (processesAvailable) bindNVarChar(insertRequest, "requiredProcesses", serializeCustomPartProcesses(input.requiredProcesses || []), 100);
    insertRequest.input("groupId", sql.UniqueIdentifier, input.groupId || null);
    if (input.sourceLibraryPartId) {
      bindInt(insertRequest, "sourceLibraryPartId", input.sourceLibraryPartId);
    }
    if (trackLibraryGroup) {
      bindInt(insertRequest, "sourceLibraryGroupId", input.sourceLibraryGroupId!);
      insertRequest.input("libraryGroupAssignmentId", sql.UniqueIdentifier, input.libraryGroupAssignmentId);
      bindInt(insertRequest, "libraryGroupSetQuantity", input.libraryGroupSetQuantity!);
    }

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
        ${input.groupId ? ", CustomPartGroupID" : ""}
        ${input.sourceLibraryPartId ? ", SourceLibraryPartID" : ""}
        ${trackLibraryGroup ? ", SourceLibraryGroupID, LibraryGroupAssignmentID, LibraryGroupSetQuantity" : ""}
        ${processesAvailable ? ", RequiredProcesses" : ""}
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
        ${input.groupId ? ", @groupId" : ""}
        ${input.sourceLibraryPartId ? ", @sourceLibraryPartId" : ""}
        ${trackLibraryGroup ? ", @sourceLibraryGroupId, @libraryGroupAssignmentId, @libraryGroupSetQuantity" : ""}
        ${processesAvailable ? ", NULLIF(@requiredProcesses, N'')" : ""}
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
    "customerName" | "description" | "qtyNeeded" | "material" | "hasCustomColor" | "customColor" | "requiredProcesses"
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
  const processesAvailable = await customPartProcessesAvailable();
  if (input.requiredProcesses?.length && !processesAvailable) {
    throw new Error("Custom part processes are awaiting their database migration.");
  }
  if (processesAvailable) bindNVarChar(request, "requiredProcesses", serializeCustomPartProcesses(input.requiredProcesses || []), 100);
  await request.query(`
    UPDATE dbo.tblcustomparts
    SET CustomerName = @customerName,
        Description = @description,
        QtyNeeded = @qtyNeeded,
        Material = @material,
        HasCustomColor = @hasCustomColor,
        CustomColor = NULLIF(@customColor, N'')
        ${processesAvailable ? ", RequiredProcesses = NULLIF(@requiredProcesses, N'')" : ""}
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

export type CustomPartProcessTarget = {
  customPartId: number;
  orderNumber: string;
  partNumber: string;
  requiredProcesses: CustomPartProcess[];
  processProgress: Partial<Record<CustomPartProcess, string>>;
  completedAt: string | null;
};

export async function getCustomPartProcessTarget(customPartId: number): Promise<CustomPartProcessTarget | null> {
  if (!(await customPartProcessesAvailable())) throw new Error("Custom part processes are awaiting their database migration.");
  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "customPartId", customPartId);
  const result = await request.query<({
    CustomPartID: number; AMGSOrderNumber: string; PartNumber: string; CompletedAt: Date | null;
  } & CustomPartProcessColumns)>(`SELECT CustomPartID, AMGSOrderNumber, PartNumber, CompletedAt,
      ${processSelect(true)}
    FROM dbo.tblcustomparts WHERE CustomPartID=@customPartId`);
  const row = result.recordset[0];
  return row ? {
    customPartId: Number(row.CustomPartID), orderNumber: row.AMGSOrderNumber.trim(), partNumber: row.PartNumber.trim(),
    requiredProcesses: parseCustomPartProcesses(row.RequiredProcesses), processProgress: processProgress(row),
    completedAt: row.CompletedAt ? row.CompletedAt.toISOString() : null,
  } : null;
}

export async function setCustomPartProcessCompletion(input: {
  customPartId: number; process: CustomPartProcess; checked: boolean;
}): Promise<CustomPartProcessTarget> {
  const target = await getCustomPartProcessTarget(input.customPartId);
  if (!target) throw new Error("Custom part not found.");
  if (target.completedAt && !input.checked) throw new Error("Completed custom parts cannot be reopened here.");
  if (!target.requiredProcesses.includes(input.process)) throw new Error("This process is not required for the custom part.");
  const column = PROCESS_DATE_COLUMNS[input.process];
  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "customPartId", input.customPartId);
  bindDateTime2(request, "completedAt", plantLocalTimestampForSql());
  await request.query(`UPDATE dbo.tblcustomparts SET ${column}=${input.checked ? "@completedAt" : "NULL"}
    WHERE CustomPartID=@customPartId`);
  const updated = await getCustomPartProcessTarget(input.customPartId);
  if (!updated) throw new Error("Custom part not found.");
  return updated;
}

export async function markRequiredCustomPartProcessesComplete(customPartId: number): Promise<void> {
  const target = await getCustomPartProcessTarget(customPartId);
  if (!target) throw new Error("Custom part not found.");
  if (!target.requiredProcesses.length) return;
  const assignments = target.requiredProcesses.map((process) => `${PROCESS_DATE_COLUMNS[process]}=COALESCE(${PROCESS_DATE_COLUMNS[process]}, @completedAt)`);
  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "customPartId", customPartId);
  bindDateTime2(request, "completedAt", plantLocalTimestampForSql());
  await request.query(`UPDATE dbo.tblcustomparts SET ${assignments.join(", ")} WHERE CustomPartID=@customPartId`);
}

export type CustomPartCompletionTarget = {
  customPartId: number;
  orderNumber: string;
  partNumber: string;
  partFolderId: string;
  orderFolderId: string;
  completedAt: string | null;
};

export type CustomPartDeletionTarget = CustomPartCompletionTarget & {
  productionLogCount: number;
};

export async function getCustomPartDeletionTarget(customPartId: number): Promise<CustomPartDeletionTarget | null> {
  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "customPartId", customPartId);
  const result = await request.query<{
    CustomPartID: number;
    AMGSOrderNumber: string;
    PartNumber: string;
    GoogleDrivePartFolderId: string | null;
    GoogleDriveOrderFolderId: string | null;
    CompletedAt: Date | null;
    ProductionLogCount: number;
  }>(`
    SELECT parts.CustomPartID, parts.AMGSOrderNumber, parts.PartNumber,
      parts.GoogleDrivePartFolderId, parts.GoogleDriveOrderFolderId, parts.CompletedAt,
      (SELECT COUNT(1) FROM dbo.tblproductionlog AS production
       WHERE production.CustomPartID = parts.CustomPartID) AS ProductionLogCount
    FROM dbo.tblcustomparts AS parts
    WHERE parts.CustomPartID = @customPartId
  `);
  const row = result.recordset[0];
  if (!row) return null;
  return {
    customPartId: Number(row.CustomPartID),
    orderNumber: row.AMGSOrderNumber.trim(),
    partNumber: row.PartNumber.trim(),
    partFolderId: row.GoogleDrivePartFolderId?.trim() || "",
    orderFolderId: row.GoogleDriveOrderFolderId?.trim() || "",
    completedAt: row.CompletedAt ? row.CompletedAt.toISOString() : null,
    productionLogCount: Number(row.ProductionLogCount || 0),
  };
}

export async function getCustomPartCompletionTarget(customPartId: number): Promise<CustomPartCompletionTarget | null> {
  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "customPartId", customPartId);
  const result = await request.query<{
    CustomPartID: number;
    AMGSOrderNumber: string;
    PartNumber: string;
    GoogleDrivePartFolderId: string | null;
    GoogleDriveOrderFolderId: string | null;
    CompletedAt: Date | null;
  }>(`
    SELECT CustomPartID, AMGSOrderNumber, PartNumber,
      GoogleDrivePartFolderId, GoogleDriveOrderFolderId, CompletedAt
    FROM dbo.tblcustomparts
    WHERE CustomPartID = @customPartId
  `);
  const row = result.recordset[0];
  if (!row) return null;
  return {
    customPartId: Number(row.CustomPartID),
    orderNumber: row.AMGSOrderNumber.trim(),
    partNumber: row.PartNumber.trim(),
    partFolderId: row.GoogleDrivePartFolderId?.trim() || "",
    orderFolderId: row.GoogleDriveOrderFolderId?.trim() || "",
    completedAt: row.CompletedAt ? row.CompletedAt.toISOString() : null,
  };
}

export async function markCustomPartComplete(
  customPartId: number,
  completedBy: string,
  completedAt = plantLocalTimestampForSql(),
): Promise<string> {
  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "customPartId", customPartId);
  bindNVarChar(request, "completedBy", completedBy, 256);
  bindDateTime2(request, "completedAt", completedAt);
  const result = await request.query<{ CompletedAt: Date }>(`
    UPDATE dbo.tblcustomparts
    SET CompletedAt = @completedAt, CompletedBy = @completedBy
    WHERE CustomPartID = @customPartId AND CompletedAt IS NULL;

    SELECT CompletedAt
    FROM dbo.tblcustomparts
    WHERE CustomPartID = @customPartId;
  `);
  const date = result.recordset[0]?.CompletedAt;
  if (!date) throw new Error("Custom part not found.");
  return date.toISOString();
}

export async function approveCustomPartGroup(
  customPartIds: number[],
  groupedBy: string,
): Promise<{ groupId: string; groupedCount: number }> {
  if (!(await customPartGroupsAvailable())) throw new Error("Part grouping is awaiting its database migration.");
  const ids = [...new Set(customPartIds.filter(Number.isInteger))];
  if (ids.length < 2) throw new Error("Choose at least two ungrouped parts.");
  const pool = await getPool();
  const request = pool.request();
  bindNVarChar(request, "groupedBy", groupedBy, 256);
  const groupedAt = plantLocalTimestampForSql();
  bindDateTime2(request, "groupedAt", groupedAt);
  const result = await request.query<{ GroupID: string; GroupedCount: number }>(`
    DECLARE @GroupID UNIQUEIDENTIFIER = NEWID();
    IF (SELECT COUNT(1) FROM dbo.tblcustomparts WHERE CustomPartID IN (${ids.join(",")}) AND CustomPartGroupID IS NULL) <> ${ids.length}
      THROW 50001, 'One or more parts are already grouped. Refresh and try again.', 1;

    UPDATE dbo.tblcustomparts
    SET CustomPartGroupID = @GroupID,
        CustomPartGroupedBy = @groupedBy,
        CustomPartGroupedAt = @groupedAt
    WHERE CustomPartID IN (${ids.join(",")});

    SELECT CONVERT(NVARCHAR(36), @GroupID) AS GroupID, @@ROWCOUNT AS GroupedCount;
  `);
  const row = result.recordset[0];
  return { groupId: row.GroupID, groupedCount: Number(row.GroupedCount) };
}

export async function clearCustomPartGroup(groupId: string): Promise<number> {
  if (!(await customPartGroupsAvailable())) throw new Error("Part grouping is awaiting its database migration.");
  const pool = await getPool();
  const request = pool.request();
  request.input("groupId", sql.UniqueIdentifier, groupId);
  const result = await request.query<{ ClearedCount: number }>(`
    UPDATE dbo.tblcustomparts
    SET CustomPartGroupID = NULL,
        CustomPartGroupedBy = NULL,
        CustomPartGroupedAt = NULL
    WHERE CustomPartGroupID = @groupId;
    SELECT @@ROWCOUNT AS ClearedCount;
  `);
  return Number(result.recordset[0]?.ClearedCount || 0);
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

export async function deleteUnusedCurrentCustomPart(customPartId: number): Promise<boolean> {
  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "customPartId", customPartId);
  const result = await request.query<{ DeletedCount: number }>(`
    DELETE FROM dbo.tblcustomparts
    WHERE CustomPartID = @customPartId
      AND CompletedAt IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM dbo.tblproductionlog
        WHERE CustomPartID = @customPartId
      );
    SELECT @@ROWCOUNT AS DeletedCount;
  `);
  return Number(result.recordset[0]?.DeletedCount || 0) === 1;
}
