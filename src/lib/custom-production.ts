import sql from "mssql";

import { getPool } from "@/lib/db";
import {
  bindDateTime2,
  bindInt,
  bindNVarChar,
} from "@/lib/sql-request";
import { plantLocalTimestampForSql } from "@/lib/time";
import type { CustomProductionSubmitPayload } from "@/types/custom-part";

export type RecordCustomProductionResult = {
  totalProduced: number;
  qtyNeeded: number;
  partComplete: boolean;
  completedAt: string | null;
  lineMarkedComplete: boolean;
};

type CustomPartRow = {
  CustomPartID: number;
  PartNumber: string;
  QtyNeeded: number;
  CompletedAt: Date | null;
};

export async function getCustomPartProducedQty(
  customPartId: number,
): Promise<number> {
  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "customPartId", customPartId);

  const result = await request.query<{ TotalProduced: number | null }>(`
    SELECT SUM(Qty) AS TotalProduced
    FROM dbo.tblproductionlog
    WHERE CustomPartID = @customPartId
  `);

  return Number(result.recordset[0]?.TotalProduced ?? 0);
}

async function getCustomPartForProduction(
  customPartId: number,
  transaction: sql.Transaction,
): Promise<CustomPartRow | null> {
  const request = new sql.Request(transaction);
  bindInt(request, "customPartId", customPartId);

  const result = await request.query<CustomPartRow>(`
    SELECT CustomPartID, PartNumber, QtyNeeded, CompletedAt
    FROM dbo.tblcustomparts
    WHERE CustomPartID = @customPartId
  `);

  return result.recordset[0] ?? null;
}

export async function recordCustomProduction(
  payload: CustomProductionSubmitPayload,
  userEmail: string,
): Promise<RecordCustomProductionResult> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin();

  try {
    const part = await getCustomPartForProduction(
      payload.customPartId,
      transaction,
    );
    if (!part) {
      throw new Error("Custom part not found.");
    }

    if (part.PartNumber.trim() !== payload.partNumber.trim()) {
      throw new Error("Part number does not match the selected custom part.");
    }

    const timeStamp = plantLocalTimestampForSql();
    const logRequest = new sql.Request(transaction);
    bindInt(logRequest, "customPartId", payload.customPartId);
    bindNVarChar(logRequest, "partNumber", part.PartNumber.trim(), 50);
    bindNVarChar(logRequest, "opStation", payload.opStation, 50);
    bindInt(logRequest, "qty", payload.qty);
    bindNVarChar(logRequest, "locationType", payload.locationType, 10);
    bindInt(logRequest, "locationNo", payload.locationNo);
    bindNVarChar(logRequest, "user", userEmail, 256);
    bindDateTime2(logRequest, "timeStamp", timeStamp);
    bindNVarChar(logRequest, "source", payload.source, 10);

    await logRequest.query(`
      INSERT INTO dbo.tblproductionlog (
        ItemID, CustomPartID, MasterPNo, OpStation, Qty,
        LocationType, LocationNo, [User], TimeStamp, Source
      )
      VALUES (
        NULL, @customPartId, @partNumber, @opStation, @qty,
        @locationType, @locationNo, @user, @timeStamp, @source
      )
    `);

    let lineMarkedComplete = false;
    let completedAt: Date | null = part.CompletedAt;

    if (payload.partComplete && !part.CompletedAt) {
      const completeRequest = new sql.Request(transaction);
      bindInt(completeRequest, "customPartId", payload.customPartId);
      bindNVarChar(completeRequest, "completedBy", userEmail, 256);
      bindDateTime2(completeRequest, "completedAt", timeStamp);

      const completeResult = await completeRequest.query<{ CompletedAt: Date }>(`
        UPDATE dbo.tblcustomparts
        SET
          CompletedAt = @completedAt,
          CompletedBy = @completedBy
        OUTPUT INSERTED.CompletedAt
        WHERE CustomPartID = @customPartId
          AND CompletedAt IS NULL
      `);

      if (completeResult.recordset.length > 0) {
        lineMarkedComplete = true;
        completedAt = completeResult.recordset[0].CompletedAt;
      }
    }

    const totalRequest = new sql.Request(transaction);
    bindInt(totalRequest, "customPartId", payload.customPartId);

    const totalResult = await totalRequest.query<{ TotalProduced: number | null }>(`
      SELECT SUM(Qty) AS TotalProduced
      FROM dbo.tblproductionlog
      WHERE CustomPartID = @customPartId
    `);

    const totalProduced = Number(totalResult.recordset[0]?.TotalProduced ?? 0);

    await transaction.commit();

    return {
      totalProduced,
      qtyNeeded: Number(part.QtyNeeded),
      partComplete: completedAt !== null,
      completedAt: completedAt ? completedAt.toISOString() : null,
      lineMarkedComplete,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
