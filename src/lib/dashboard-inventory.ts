import { STATIONS } from "@/constants/stations";
import { getPool } from "@/lib/db";
import { HIST_LOC_ID } from "@/lib/item-location";
import { bindInt, bindNVarChar } from "@/lib/sql-request";
import type { StockInventoryResult, StockInventoryRow } from "@/types/dashboard";

type InventoryQueryRow = {
  ItemID: number;
  MasterPNo: string;
  FinalStation: string;
  QtyOnHand: number | null;
  MinQty: number | null;
  QtyOnOrders: number | null;
  TotalLogged: number | null;
  CompletedLogged: number | null;
};

export type StockInventoryFilters = {
  search?: string;
  finalStation?: string;
  shortfallOnly?: boolean;
};

function mapInventoryRow(row: InventoryQueryRow): StockInventoryRow {
  const totalLogged = Number(row.TotalLogged ?? 0);
  const completedLogged = Number(row.CompletedLogged ?? 0);
  const qtyInProduction = Math.max(0, totalLogged - completedLogged);

  return {
    itemId: Number(row.ItemID),
    partNumber: row.MasterPNo?.trim() ?? "",
    finalStation: row.FinalStation?.trim() ?? "",
    qtyOnHand: Number(row.QtyOnHand ?? 0),
    minQty: Number(row.MinQty ?? 0),
    qtyOnOrders: Number(row.QtyOnOrders ?? 0),
    qtyInProduction,
  };
}

export async function getStockInventoryStatus(
  filters: StockInventoryFilters = {},
): Promise<StockInventoryResult> {
  const search = filters.search?.trim() ?? "";
  const finalStation = filters.finalStation?.trim() ?? "";
  const shortfallOnly = filters.shortfallOnly === true;

  if (finalStation && !STATIONS.includes(finalStation as (typeof STATIONS)[number])) {
    throw new Error("Invalid final station.");
  }

  const pool = await getPool();
  const request = pool.request();
  bindInt(request, "locLocationId", HIST_LOC_ID);
  bindNVarChar(request, "search", search, 50);
  bindNVarChar(request, "finalStation", finalStation, 50);

  const result = await request.query<InventoryQueryRow>(`
    SELECT
      s.ItemID,
      RTRIM(s.MasterPNo) AS MasterPNo,
      LTRIM(RTRIM(s.FinalStation)) AS FinalStation,
      COALESCE(l.LocOnHandQty, 0) AS QtyOnHand,
      COALESCE(s.MinQty, 0) AS MinQty,
      COALESCE(l.LocAllocQty, 0) AS QtyOnOrders,
      COALESCE(prod.TotalLogged, 0) AS TotalLogged,
      COALESCE(prod.CompletedLogged, 0) AS CompletedLogged
    FROM dbo.tblstockitems AS s
    LEFT JOIN dbo.tblitemlocation AS l
      ON l.LocStockID = s.ItemID AND l.LocLocationID = @locLocationId
    LEFT JOIN (
      SELECT
        pl.ItemID,
        SUM(pl.Qty) AS TotalLogged,
        SUM(
          CASE
            WHEN pl.OpStation = LTRIM(RTRIM(fs.FinalStation)) THEN pl.Qty
            ELSE 0
          END
        ) AS CompletedLogged
      FROM dbo.tblproductionlog AS pl
      INNER JOIN dbo.tblstockitems AS fs ON fs.ItemID = pl.ItemID
      WHERE pl.ItemID IS NOT NULL
      GROUP BY pl.ItemID
    ) AS prod ON prod.ItemID = s.ItemID
    WHERE NULLIF(LTRIM(RTRIM(s.FinalStation)), N'') IS NOT NULL
      AND (@search = N'' OR CHARINDEX(LOWER(@search), LOWER(RTRIM(s.MasterPNo))) > 0)
      AND (@finalStation = N'' OR LTRIM(RTRIM(s.FinalStation)) = @finalStation)
    ORDER BY RTRIM(s.MasterPNo)
  `);

  let rows = result.recordset.map(mapInventoryRow);

  if (shortfallOnly) {
    rows = rows.filter((row) => row.qtyOnOrders > row.qtyOnHand);
  }

  return { rows };
}
