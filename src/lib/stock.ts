import sql from "mssql";

import { getPool } from "@/lib/db";
import { HIST_LOC_ID, getOnHandQtyAtHistLoc } from "@/lib/item-location";
import {
  bindDateTime2,
  bindDecimal,
  bindInt,
  bindNVarChar,
} from "@/lib/sql-request";
import { plantLocalDateMidnightForSql } from "@/lib/time";
import type { StockItem } from "@/types";

type StockRow = {
  ItemID: number;
  MasterPNo: string;
  ItemDescription: string;
  TotalQty: number;
  MinQty: number;
  FinalStation: string | null;
};

function stockSelectSql(): string {
  return `
  SELECT
    s.ItemID,
    s.MasterPNo,
    s.ItemDescription,
    s.FinalStation,
    COALESCE(s.MinQty, 0) AS MinQty,
    COALESCE(l.LocOnHandQty, 0) AS TotalQty
  FROM dbo.tblstockitems s
  LEFT JOIN dbo.tblitemlocation l
    ON l.LocStockID = s.ItemID AND l.LocLocationID = @locLocationId
`;
}

function mapRow(row: StockRow): StockItem {
  const finalStation = row.FinalStation?.trim() ?? "";
  return {
    itemId: row.ItemID,
    masterPNo: row.MasterPNo?.trim() ?? "",
    itemDescription: row.ItemDescription?.trim() ?? "",
    totalQty: Number(row.TotalQty),
    minQty: Number(row.MinQty),
    finalStation: finalStation || null,
  };
}

export async function getStockByMasterPNo(
  masterPNo: string,
): Promise<StockItem | null> {
  const pool = await getPool();
  const request = pool.request();
  bindNVarChar(request, "masterPNo", masterPNo, 50);
  bindInt(request, "locLocationId", HIST_LOC_ID);

  const result = await request.query<StockRow>(`
      ${stockSelectSql()}
      WHERE RTRIM(s.MasterPNo) = @masterPNo
    `);

  const row = result.recordset[0];
  return row ? mapRow(row) : null;
}

export async function getStockByItemId(itemId: number): Promise<StockItem | null> {
  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "itemId", itemId);
  bindInt(request, "locLocationId", HIST_LOC_ID);

  const result = await request.query<StockRow>(`
      ${stockSelectSql()}
      WHERE s.ItemID = @itemId
    `);

  const row = result.recordset[0];
  return row ? mapRow(row) : null;
}

const PART_SEARCH_LIMIT = 25;

export async function searchStockItems(query: string): Promise<StockItem[]> {
  const term = query.trim();
  if (!term) {
    return [];
  }

  const pool = await getPool();
  const request = pool.request();
  bindNVarChar(request, "query", term, 50);
  bindInt(request, "locLocationId", HIST_LOC_ID);
  bindInt(request, "limit", PART_SEARCH_LIMIT);

  const result = await request.query<StockRow>(`
      SELECT TOP (@limit)
        s.ItemID,
        s.MasterPNo,
        s.ItemDescription,
        s.FinalStation,
        COALESCE(s.MinQty, 0) AS MinQty,
        COALESCE(l.LocOnHandQty, 0) AS TotalQty
      FROM dbo.tblstockitems s
      LEFT JOIN dbo.tblitemlocation l
        ON l.LocStockID = s.ItemID AND l.LocLocationID = @locLocationId
      WHERE CHARINDEX(LOWER(@query), LOWER(RTRIM(s.MasterPNo))) > 0
         OR CHARINDEX(LOWER(@query), LOWER(s.ItemDescription)) > 0
      ORDER BY RTRIM(s.MasterPNo)
    `);

  return result.recordset.map(mapRow);
}

export type StockItemUpdate = {
  masterPNo: string;
  itemDescription: string;
  finalStation: string | null;
  minQty: number;
  totalQty?: number;
};

const ADJUSTMENT_INCREASE = "Adjustment(+)";
const ADJUSTMENT_DECREASE = "Adjustment(-)";

async function recordQtyAdjustment(
  transaction: sql.Transaction,
  itemId: number,
  oldQty: number,
  newQty: number,
  adjustedBy: string,
): Promise<void> {
  const delta = newQty - oldQty;
  if (delta === 0) {
    return;
  }

  const histType = delta > 0 ? ADJUSTMENT_INCREASE : ADJUSTMENT_DECREASE;
  const histQty = Math.abs(delta);
  const histDate = plantLocalDateMidnightForSql();

  const historyRequest = new sql.Request(transaction);
  bindInt(historyRequest, "stockId", itemId);
  bindDateTime2(historyRequest, "histDate", histDate);
  bindNVarChar(historyRequest, "histType", histType, 50);
  bindDecimal(historyRequest, "histQty", histQty);
  bindNVarChar(historyRequest, "histText", "Edit parts", 255);
  bindDecimal(historyRequest, "oldQty", oldQty);
  bindInt(historyRequest, "histLocId", HIST_LOC_ID);
  bindNVarChar(historyRequest, "hisText1", adjustedBy, 255);

  await historyRequest.query(`
    INSERT INTO dbo.tblitemhistory (
      StockID, HistDate, HistType, HistQty, HistText,
      oldQty, HistLocID, HisText1
    )
    VALUES (
      @stockId, @histDate, @histType, @histQty, @histText,
      @oldQty, @histLocId, @hisText1
    )
  `);

  const locationRequest = new sql.Request(transaction);
  bindInt(locationRequest, "itemId", itemId);
  bindInt(locationRequest, "locLocationId", HIST_LOC_ID);
  bindDecimal(locationRequest, "newQty", newQty);

  const locationResult = await locationRequest.query<{ LocOnHandQty: number }>(`
    UPDATE dbo.tblitemlocation
    SET LocOnHandQty = @newQty
    OUTPUT INSERTED.LocOnHandQty
    WHERE LocStockID = @itemId AND LocLocationID = @locLocationId
  `);

  if (locationResult.recordset.length === 0) {
    throw new Error(
      "No inventory row to update (tblitemlocation LocStockID / LocLocationID).",
    );
  }
}

async function isMasterPNoTaken(
  masterPNo: string,
  excludeItemId: number,
): Promise<boolean> {
  const pool = await getPool();
  const request = pool.request();
  bindNVarChar(request, "masterPNo", masterPNo, 50);
  bindInt(request, "excludeItemId", excludeItemId);

  const result = await request.query<{ ItemID: number }>(`
    SELECT TOP (1) ItemID
    FROM dbo.tblstockitems
    WHERE RTRIM(MasterPNo) = @masterPNo
      AND ItemID <> @excludeItemId
  `);

  return result.recordset.length > 0;
}

export async function updateStockItem(
  itemId: number,
  update: StockItemUpdate,
  adjustedBy?: string,
): Promise<StockItem | null> {
  if (await isMasterPNoTaken(update.masterPNo, itemId)) {
    throw new Error("Part number already in use.");
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const stockRequest = new sql.Request(transaction);
    bindInt(stockRequest, "itemId", itemId);
    bindNVarChar(stockRequest, "masterPNo", update.masterPNo, 50);
    bindNVarChar(stockRequest, "itemDescription", update.itemDescription, 4000);
    bindNVarChar(stockRequest, "finalStation", update.finalStation ?? "", 50);
    bindDecimal(stockRequest, "minQty", update.minQty);

    const stockResult = await stockRequest.query(`
      UPDATE dbo.tblstockitems
      SET
        MasterPNo = @masterPNo,
        ItemDescription = @itemDescription,
        FinalStation = NULLIF(LTRIM(RTRIM(@finalStation)), ''),
        MinQty = @minQty
      WHERE ItemID = @itemId;

      SELECT @@ROWCOUNT AS Affected;
    `);

    const affected = Number(stockResult.recordset[0]?.Affected ?? 0);
    if (affected === 0) {
      await transaction.rollback();
      return null;
    }

    if (update.totalQty !== undefined) {
      const oldQty = await getOnHandQtyAtHistLoc(itemId);
      const newQty = update.totalQty;
      if (newQty !== oldQty) {
        if (!adjustedBy?.trim()) {
          throw new Error("Adjusted by user is required to change quantity.");
        }
        await recordQtyAdjustment(transaction, itemId, oldQty, newQty, adjustedBy);
      }
    }

    await transaction.commit();
    return getStockByItemId(itemId);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
