import { getPool } from "@/lib/db";
import { HIST_LOC_ID } from "@/lib/item-location";
import { bindInt, bindNVarChar } from "@/lib/sql-request";
import type { StockItem } from "@/types";

type StockRow = {
  ItemID: number;
  MasterPNo: string;
  ItemDescription: string;
  TotalQty: number;
};

function stockSelectSql(): string {
  return `
  SELECT
    s.ItemID,
    s.MasterPNo,
    s.ItemDescription,
    COALESCE(l.LocOnHandQty, 0) AS TotalQty
  FROM dbo.tblstockitems s
  LEFT JOIN dbo.tblitemlocation l
    ON l.LocStockID = s.ItemID AND l.LocLocationID = @locLocationId
`;
}

function mapRow(row: StockRow): StockItem {
  return {
    itemId: row.ItemID,
    masterPNo: row.MasterPNo?.trim() ?? "",
    itemDescription: row.ItemDescription?.trim() ?? "",
    totalQty: Number(row.TotalQty),
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
