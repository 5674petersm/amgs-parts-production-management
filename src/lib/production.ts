import sql from "mssql";

import { getOnHandQtyAtHistLoc, HIST_LOC_ID } from "@/lib/item-location";
import { getPool } from "@/lib/db";
import {
  bindDateTime2,
  bindDecimal,
  bindInt,
  bindNVarChar,
} from "@/lib/sql-request";
import { plantLocalDateMidnightForSql, plantLocalTimestampForSql } from "@/lib/time";
import type { ProductionSubmitPayload } from "@/types";

/** MiniMRP inventory increase — matches existing Adjustment(+) rows. */
const PRODUCTION_HIST_TYPE = "Adjustment(+)";

/** Always recorded on tblitemhistory.HisText1 for production entries. */
const HIS_TEXT1 = "mpete";

export async function recordProduction(
  payload: ProductionSubmitPayload,
  userEmail: string,
): Promise<{ newTotalQty: number }> {
  const oldQty = await getOnHandQtyAtHistLoc(payload.itemId);

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin();

  try {
    const histDate = plantLocalDateMidnightForSql();

    const historyRequest = new sql.Request(transaction);
    bindInt(historyRequest, "stockId", payload.itemId);
    bindDateTime2(historyRequest, "histDate", histDate);
    bindNVarChar(historyRequest, "histType", PRODUCTION_HIST_TYPE, 50);
    bindDecimal(historyRequest, "histQty", payload.qty);
    bindNVarChar(historyRequest, "histText", payload.opStation, 255);
    bindDecimal(historyRequest, "oldQty", oldQty);
    bindInt(historyRequest, "histLocId", HIST_LOC_ID);
    bindNVarChar(historyRequest, "hisText1", HIS_TEXT1, 255);

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
    bindInt(locationRequest, "itemId", payload.itemId);
    bindInt(locationRequest, "locLocationId", HIST_LOC_ID);
    bindDecimal(locationRequest, "qty", payload.qty);

    const locationResult = await locationRequest.query<{ LocOnHandQty: number }>(`
        UPDATE dbo.tblitemlocation
        SET LocOnHandQty = LocOnHandQty + @qty
        OUTPUT INSERTED.LocOnHandQty
        WHERE LocStockID = @itemId AND LocLocationID = @locLocationId
      `);

    if (locationResult.recordset.length === 0) {
      throw new Error(
        "No inventory row to update (tblitemlocation LocStockID / LocLocationID).",
      );
    }

    const newTotalQty = Number(locationResult.recordset[0].LocOnHandQty);

    const timeStamp = plantLocalTimestampForSql();
    const logRequest = new sql.Request(transaction);
    bindInt(logRequest, "itemId", payload.itemId);
    bindNVarChar(logRequest, "masterPNo", payload.masterPNo, 50);
    bindNVarChar(logRequest, "opStation", payload.opStation, 50);
    bindInt(logRequest, "qty", payload.qty);
    bindNVarChar(logRequest, "locationType", payload.locationType, 10);
    bindInt(logRequest, "locationNo", payload.locationNo);
    bindNVarChar(logRequest, "user", userEmail, 256);
    bindDateTime2(logRequest, "timeStamp", timeStamp);
    bindNVarChar(logRequest, "source", payload.source, 10);

    await logRequest.query(`
        INSERT INTO dbo.tblproductionlog (
          ItemID, MasterPNo, OpStation, Qty,
          LocationType, LocationNo, [User], TimeStamp, Source
        )
        VALUES (
          @itemId, @masterPNo, @opStation, @qty,
          @locationType, @locationNo, @user, @timeStamp, @source
        )
      `);

    await transaction.commit();

    return { newTotalQty };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
