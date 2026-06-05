import { getPool } from "@/lib/db";
import { bindInt } from "@/lib/sql-request";

/** Matches tblitemhistory.HistLocID and tblitemlocation.LocLocationID. */
export const HIST_LOC_ID = 1;

type LocationRow = {
  LocOnHandQty: number;
};

/** On-hand at location 1 (for tblitemhistory.oldQty and success message). */
export async function getOnHandQtyAtHistLoc(itemId: number): Promise<number> {
  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "itemId", itemId);
  bindInt(request, "locLocationId", HIST_LOC_ID);

  const result = await request.query<LocationRow>(`
      SELECT LocOnHandQty
      FROM dbo.tblitemlocation
      WHERE LocStockID = @itemId AND LocLocationID = @locLocationId
    `);

  const row = result.recordset[0];
  if (!row) {
    throw new Error(
      "No inventory at location 1 for this item (tblitemlocation LocStockID / LocLocationID).",
    );
  }

  return Number(row.LocOnHandQty);
}

export async function getTotalOnHandQty(itemId: number): Promise<number> {
  return getOnHandQtyAtHistLoc(itemId);
}
