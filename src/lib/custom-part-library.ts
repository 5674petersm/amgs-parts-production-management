import sql from "mssql";

import { getPool } from "@/lib/db";
import { bindDateTime2, bindInt, bindNVarChar } from "@/lib/sql-request";
import { plantLocalTimestampForSql } from "@/lib/time";
import { parseCustomPartProcesses, serializeCustomPartProcesses, type CustomPartProcess } from "@/constants/custom-part-processes";

export type PartLibraryRecord = {
  libraryPartId: number;
  partName: string;
  description: string;
  material: string;
  hasCustomColor: boolean;
  color: string;
  driveFolderId: string;
  folderUrl: string;
  createdBy: string;
  createdAt: string;
  requiredProcesses: CustomPartProcess[];
};

export type PartLibraryInput = {
  partName: string;
  description: string;
  material: string;
  hasCustomColor: boolean;
  color: string;
  driveFolderId: string;
  folderUrl: string;
  createdBy: string;
  requiredProcesses: CustomPartProcess[];
};

export async function partLibraryAvailable(): Promise<boolean> {
  const pool = await getPool();
  const result = await pool.request().query<{ Available: number }>(`
    SELECT CASE WHEN OBJECT_ID(N'dbo.tblcustompartlibrary', N'U') IS NULL THEN 0 ELSE 1 END AS Available
  `);
  return Boolean(result.recordset[0]?.Available);
}

export async function partLibraryCanUpdate(): Promise<boolean> {
  const pool = await getPool();
  const result = await pool.request().query<{ CanUpdate: number }>(`
    SELECT HAS_PERMS_BY_NAME(N'dbo.tblcustompartlibrary', N'OBJECT', N'UPDATE') AS CanUpdate
  `);
  return Boolean(result.recordset[0]?.CanUpdate);
}

export async function partLibraryProcessesAvailable(): Promise<boolean> {
  const pool = await getPool();
  const result = await pool.request().query<{ Available: number }>(`
    SELECT CASE WHEN COL_LENGTH(N'dbo.tblcustompartlibrary', N'RequiredProcesses') IS NOT NULL THEN 1 ELSE 0 END AS Available
  `);
  return Boolean(result.recordset[0]?.Available);
}

export async function listPartLibrary(): Promise<PartLibraryRecord[]> {
  if (!(await partLibraryAvailable())) return [];
  const pool = await getPool();
  const processesAvailable = await partLibraryProcessesAvailable();
  const result = await pool.request().query<{
    LibraryPartID: number;
    PartName: string;
    Description: string;
    Material: string;
    HasCustomColor: boolean;
    CustomColor: string | null;
    GoogleDrivePartFolderId: string;
    GoogleDriveFolderUrl: string;
    CreatedBy: string;
    CreatedAt: Date;
    RequiredProcesses: string | null;
  }>(`
    SELECT LibraryPartID, PartName, Description, Material, HasCustomColor,
      CustomColor, GoogleDrivePartFolderId, GoogleDriveFolderUrl, CreatedBy, CreatedAt,
      ${processesAvailable ? "RequiredProcesses" : "NULL AS RequiredProcesses"}
    FROM dbo.tblcustompartlibrary
    ORDER BY PartName ASC, CreatedAt DESC
  `);
  return result.recordset.map((row) => ({
    libraryPartId: Number(row.LibraryPartID),
    partName: row.PartName.trim(),
    description: row.Description.trim(),
    material: row.Material.trim(),
    hasCustomColor: Boolean(row.HasCustomColor),
    color: row.CustomColor?.trim() || "No Color",
    driveFolderId: row.GoogleDrivePartFolderId.trim(),
    folderUrl: row.GoogleDriveFolderUrl.trim(),
    createdBy: row.CreatedBy.trim(),
    createdAt: row.CreatedAt.toISOString(),
    requiredProcesses: parseCustomPartProcesses(row.RequiredProcesses),
  }));
}

export async function getPartLibraryItem(libraryPartId: number): Promise<PartLibraryRecord | null> {
  if (!(await partLibraryAvailable())) return null;
  const pool = await getPool();
  const processesAvailable = await partLibraryProcessesAvailable();
  const request = pool.request();
  bindInt(request, "libraryPartId", libraryPartId);
  const result = await request.query<{
    LibraryPartID: number; PartName: string; Description: string; Material: string;
    HasCustomColor: boolean; CustomColor: string | null; GoogleDrivePartFolderId: string;
    GoogleDriveFolderUrl: string; CreatedBy: string; CreatedAt: Date; RequiredProcesses: string | null;
  }>(`
    SELECT LibraryPartID, PartName, Description, Material, HasCustomColor,
      CustomColor, GoogleDrivePartFolderId, GoogleDriveFolderUrl, CreatedBy, CreatedAt,
      ${processesAvailable ? "RequiredProcesses" : "NULL AS RequiredProcesses"}
    FROM dbo.tblcustompartlibrary WHERE LibraryPartID = @libraryPartId
  `);
  const row = result.recordset[0];
  return row ? {
    libraryPartId: Number(row.LibraryPartID), partName: row.PartName.trim(),
    description: row.Description.trim(), material: row.Material.trim(),
    hasCustomColor: Boolean(row.HasCustomColor), color: row.CustomColor?.trim() || "No Color",
    driveFolderId: row.GoogleDrivePartFolderId.trim(), folderUrl: row.GoogleDriveFolderUrl.trim(),
    createdBy: row.CreatedBy.trim(), createdAt: row.CreatedAt.toISOString(),
    requiredProcesses: parseCustomPartProcesses(row.RequiredProcesses),
  } : null;
}

export async function createPartLibraryItem(input: PartLibraryInput): Promise<number> {
  if (!(await partLibraryAvailable())) throw new Error("Parts Library is awaiting its database migration.");
  const pool = await getPool();
  const request = pool.request();
  bindNVarChar(request, "partName", input.partName, 200);
  bindNVarChar(request, "description", input.description, 4000);
  bindNVarChar(request, "material", input.material, 50);
  request.input("hasCustomColor", input.hasCustomColor ? 1 : 0);
  bindNVarChar(request, "color", input.color, 100);
  bindNVarChar(request, "folderId", input.driveFolderId, 100);
  bindNVarChar(request, "folderUrl", input.folderUrl, 500);
  bindNVarChar(request, "createdBy", input.createdBy, 256);
  bindDateTime2(request, "createdAt", plantLocalTimestampForSql());
  const processesAvailable = await partLibraryProcessesAvailable();
  if (input.requiredProcesses.length && !processesAvailable) throw new Error("Library part processes are awaiting their database migration.");
  if (processesAvailable) bindNVarChar(request, "requiredProcesses", serializeCustomPartProcesses(input.requiredProcesses), 100);
  const result = await request.query<{ LibraryPartID: number }>(`
    INSERT INTO dbo.tblcustompartlibrary
      (PartName, Description, Material, HasCustomColor, CustomColor,
       GoogleDrivePartFolderId, GoogleDriveFolderUrl, CreatedBy, CreatedAt${processesAvailable ? ", RequiredProcesses" : ""})
    OUTPUT INSERTED.LibraryPartID
    VALUES (@partName, @description, @material, @hasCustomColor, NULLIF(@color, N''),
      @folderId, @folderUrl, @createdBy, @createdAt${processesAvailable ? ", NULLIF(@requiredProcesses, N'')" : ""})
  `);
  return Number(result.recordset[0].LibraryPartID);
}

export async function updatePartLibraryItem(input: {
  libraryPartId: number;
  partName: string;
  description: string;
  material: string;
  hasCustomColor: boolean;
  color: string;
  requiredProcesses: CustomPartProcess[];
}): Promise<boolean> {
  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "libraryPartId", input.libraryPartId);
  bindNVarChar(request, "partName", input.partName, 200);
  bindNVarChar(request, "description", input.description, 4000);
  bindNVarChar(request, "material", input.material, 50);
  request.input("hasCustomColor", input.hasCustomColor ? 1 : 0);
  bindNVarChar(request, "color", input.color, 100);
  const processesAvailable = await partLibraryProcessesAvailable();
  if (input.requiredProcesses.length && !processesAvailable) throw new Error("Library part processes are awaiting their database migration.");
  if (processesAvailable) bindNVarChar(request, "requiredProcesses", serializeCustomPartProcesses(input.requiredProcesses), 100);
  const result = await request.query(`UPDATE dbo.tblcustompartlibrary
    SET PartName=@partName, Description=@description, Material=@material,
      HasCustomColor=@hasCustomColor, CustomColor=NULLIF(@color, N'')
      ${processesAvailable ? ", RequiredProcesses=NULLIF(@requiredProcesses, N'')" : ""}
    WHERE LibraryPartID=@libraryPartId`);
  return Boolean(result.rowsAffected[0]);
}

export type PartLibraryGroupRecord = {
  libraryGroupId: number;
  groupName: string;
  description: string;
  members: { libraryPartId: number; qtyPerSet: number; sortOrder: number }[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  driveFolderId: string;
  folderUrl: string;
};

export async function partLibraryGroupsAvailable(): Promise<boolean> {
  const pool = await getPool();
  const result = await pool.request().query<{ Available: number }>(`
    SELECT CASE WHEN OBJECT_ID(N'dbo.tblcustompartlibrarygroups', N'U') IS NOT NULL
      AND OBJECT_ID(N'dbo.tblcustompartlibrarygroupmembers', N'U') IS NOT NULL
      THEN 1 ELSE 0 END AS Available
  `);
  return Boolean(result.recordset[0]?.Available);
}

export async function partLibraryGroupFilesAvailable(): Promise<boolean> {
  const pool = await getPool();
  const result = await pool.request().query<{ Available: number }>(`
    SELECT CASE WHEN COL_LENGTH(N'dbo.tblcustompartlibrarygroups', N'GoogleDriveFolderId') IS NOT NULL
      AND COL_LENGTH(N'dbo.tblcustompartlibrarygroups', N'GoogleDriveFolderUrl') IS NOT NULL
      THEN 1 ELSE 0 END AS Available
  `);
  return Boolean(result.recordset[0]?.Available);
}

export async function listPartLibraryGroups(): Promise<PartLibraryGroupRecord[]> {
  if (!(await partLibraryGroupsAvailable())) return [];
  const pool = await getPool();
  const filesAvailable = await partLibraryGroupFilesAvailable();
  const [groupsResult, membersResult] = await Promise.all([
    pool.request().query<{
      LibraryGroupID: number; GroupName: string; Description: string | null;
      CreatedBy: string; CreatedAt: Date; UpdatedAt: Date;
      GoogleDriveFolderId: string | null; GoogleDriveFolderUrl: string | null;
    }>(`SELECT LibraryGroupID, GroupName, Description, CreatedBy, CreatedAt, UpdatedAt
       ${filesAvailable ? ", GoogleDriveFolderId, GoogleDriveFolderUrl" : ", NULL AS GoogleDriveFolderId, NULL AS GoogleDriveFolderUrl"}
       FROM dbo.tblcustompartlibrarygroups ORDER BY GroupName`),
    pool.request().query<{
      LibraryGroupID: number; LibraryPartID: number; QtyPerSet: number; SortOrder: number;
    }>(`SELECT LibraryGroupID, LibraryPartID, QtyPerSet, SortOrder
       FROM dbo.tblcustompartlibrarygroupmembers ORDER BY LibraryGroupID, SortOrder, LibraryPartID`),
  ]);
  const membersByGroup = new Map<number, PartLibraryGroupRecord["members"]>();
  membersResult.recordset.forEach((row) => membersByGroup.set(Number(row.LibraryGroupID), [
    ...(membersByGroup.get(Number(row.LibraryGroupID)) || []),
    { libraryPartId: Number(row.LibraryPartID), qtyPerSet: Number(row.QtyPerSet), sortOrder: Number(row.SortOrder) },
  ]));
  return groupsResult.recordset.map((row) => ({
    libraryGroupId: Number(row.LibraryGroupID), groupName: row.GroupName.trim(),
    description: row.Description?.trim() || "", members: membersByGroup.get(Number(row.LibraryGroupID)) || [],
    createdBy: row.CreatedBy.trim(), createdAt: row.CreatedAt.toISOString(), updatedAt: row.UpdatedAt.toISOString(),
    driveFolderId: row.GoogleDriveFolderId?.trim() || "",
    folderUrl: row.GoogleDriveFolderUrl?.trim() || "",
  }));
}

export async function setPartLibraryGroupDriveFolder(input: {
  libraryGroupId: number; driveFolderId: string; folderUrl: string;
}): Promise<void> {
  if (!(await partLibraryGroupFilesAvailable())) throw new Error("Group drawings are awaiting their database migration.");
  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "libraryGroupId", input.libraryGroupId);
  bindNVarChar(request, "driveFolderId", input.driveFolderId, 100);
  bindNVarChar(request, "folderUrl", input.folderUrl, 500);
  const result = await request.query(`UPDATE dbo.tblcustompartlibrarygroups
    SET GoogleDriveFolderId=@driveFolderId, GoogleDriveFolderUrl=@folderUrl
    WHERE LibraryGroupID=@libraryGroupId`);
  if (!result.rowsAffected[0]) throw new Error("Library group not found.");
}

export async function getPartLibraryGroup(libraryGroupId: number): Promise<PartLibraryGroupRecord | null> {
  return (await listPartLibraryGroups()).find((group) => group.libraryGroupId === libraryGroupId) || null;
}

function normalizeGroupMembers(members: Array<{ libraryPartId: number; qtyPerSet: number }>) {
  const unique = new Map<number, number>();
  members.forEach((member) => {
    if (Number.isInteger(member.libraryPartId) && member.libraryPartId > 0
      && Number.isInteger(member.qtyPerSet) && member.qtyPerSet > 0) {
      unique.set(member.libraryPartId, member.qtyPerSet);
    }
  });
  return [...unique.entries()].map(([libraryPartId, qtyPerSet], sortOrder) => ({ libraryPartId, qtyPerSet, sortOrder }));
}

async function replaceGroupMembers(
  transaction: sql.Transaction,
  libraryGroupId: number,
  members: Array<{ libraryPartId: number; qtyPerSet: number }>,
  userEmail: string,
) {
  const normalized = normalizeGroupMembers(members);
  const clear = new sql.Request(transaction);
  bindInt(clear, "libraryGroupId", libraryGroupId);
  await clear.query(`DELETE FROM dbo.tblcustompartlibrarygroupmembers WHERE LibraryGroupID = @libraryGroupId`);
  for (const member of normalized) {
    const request = new sql.Request(transaction);
    bindInt(request, "libraryGroupId", libraryGroupId);
    bindInt(request, "libraryPartId", member.libraryPartId);
    bindInt(request, "qtyPerSet", member.qtyPerSet);
    bindInt(request, "sortOrder", member.sortOrder);
    bindNVarChar(request, "addedBy", userEmail, 256);
    bindDateTime2(request, "addedAt", plantLocalTimestampForSql());
    await request.query(`INSERT INTO dbo.tblcustompartlibrarygroupmembers
      (LibraryGroupID, LibraryPartID, QtyPerSet, SortOrder, AddedBy, AddedAt)
      VALUES (@libraryGroupId, @libraryPartId, @qtyPerSet, @sortOrder, @addedBy, @addedAt)`);
  }
}

export async function createPartLibraryGroup(input: {
  groupName: string; description: string; members: Array<{ libraryPartId: number; qtyPerSet: number }>; userEmail: string;
}): Promise<number> {
  if (!(await partLibraryGroupsAvailable())) throw new Error("Parts Library groups are awaiting their database migration.");
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const request = new sql.Request(transaction);
    bindNVarChar(request, "groupName", input.groupName, 200);
    bindNVarChar(request, "description", input.description, 1000);
    bindNVarChar(request, "createdBy", input.userEmail, 256);
    const now = plantLocalTimestampForSql();
    bindDateTime2(request, "now", now);
    const result = await request.query<{ LibraryGroupID: number }>(`INSERT INTO dbo.tblcustompartlibrarygroups
      (GroupName, Description, CreatedBy, CreatedAt, UpdatedAt)
      OUTPUT INSERTED.LibraryGroupID
      VALUES (@groupName, NULLIF(@description, N''), @createdBy, @now, @now)`);
    const libraryGroupId = Number(result.recordset[0].LibraryGroupID);
    await replaceGroupMembers(transaction, libraryGroupId, input.members, input.userEmail);
    await transaction.commit();
    return libraryGroupId;
  } catch (error) { await transaction.rollback(); throw error; }
}

export async function updatePartLibraryGroup(input: {
  libraryGroupId: number; groupName: string; description: string;
  members: Array<{ libraryPartId: number; qtyPerSet: number }>; userEmail: string;
}): Promise<void> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const request = new sql.Request(transaction);
    bindInt(request, "libraryGroupId", input.libraryGroupId);
    bindNVarChar(request, "groupName", input.groupName, 200);
    bindNVarChar(request, "description", input.description, 1000);
    bindDateTime2(request, "updatedAt", plantLocalTimestampForSql());
    const result = await request.query(`UPDATE dbo.tblcustompartlibrarygroups
      SET GroupName=@groupName, Description=NULLIF(@description,N''), UpdatedAt=@updatedAt
      WHERE LibraryGroupID=@libraryGroupId`);
    if (!result.rowsAffected[0]) throw new Error("Library group not found.");
    await replaceGroupMembers(transaction, input.libraryGroupId, input.members, input.userEmail);
    await transaction.commit();
  } catch (error) { await transaction.rollback(); throw error; }
}

export async function deletePartLibraryGroup(libraryGroupId: number): Promise<boolean> {
  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "libraryGroupId", libraryGroupId);
  const result = await request.query(`DELETE FROM dbo.tblcustompartlibrarygroups WHERE LibraryGroupID=@libraryGroupId`);
  return Boolean(result.rowsAffected[0]);
}

export async function addPartLibraryItemToGroup(input: {
  libraryGroupId: number; libraryPartId: number; qtyPerSet: number; userEmail: string;
}): Promise<void> {
  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "libraryGroupId", input.libraryGroupId);
  bindInt(request, "libraryPartId", input.libraryPartId);
  bindInt(request, "qtyPerSet", Math.max(1, Math.trunc(input.qtyPerSet)));
  bindNVarChar(request, "addedBy", input.userEmail, 256);
  bindDateTime2(request, "addedAt", plantLocalTimestampForSql());
  await request.query(`
    DECLARE @SortOrder INT = ISNULL((SELECT MAX(SortOrder) + 1
      FROM dbo.tblcustompartlibrarygroupmembers WHERE LibraryGroupID=@libraryGroupId), 0);
    MERGE dbo.tblcustompartlibrarygroupmembers AS target
    USING (SELECT @libraryGroupId AS LibraryGroupID, @libraryPartId AS LibraryPartID) AS source
      ON target.LibraryGroupID=source.LibraryGroupID AND target.LibraryPartID=source.LibraryPartID
    WHEN MATCHED THEN UPDATE SET QtyPerSet=@qtyPerSet
    WHEN NOT MATCHED THEN INSERT (LibraryGroupID, LibraryPartID, QtyPerSet, SortOrder, AddedBy, AddedAt)
      VALUES (@libraryGroupId, @libraryPartId, @qtyPerSet, @SortOrder, @addedBy, @addedAt);
  `);
}
