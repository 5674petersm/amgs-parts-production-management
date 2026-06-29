import { STATIONS } from "@/constants/stations";
import { getPool } from "@/lib/db";
import { bindDateTime2 } from "@/lib/sql-request";
import {
  plantLocalDateRangeToSql,
  plantLocalWeekRange,
} from "@/lib/time";
import type { DashboardStats, StationQtyRow } from "@/types/dashboard";

type ProducedQueryRow = {
  OpStation: string;
  TotalQty: number | null;
};

type StockCompletedQueryRow = {
  OpStation: string;
  StockCompletedQty: number | null;
};

type CustomCompletedQueryRow = {
  OpStation: string;
  CustomCompletedQty: number | null;
};

function mergeQtyRows(
  stations: readonly string[],
  rows: { OpStation: string; qty: number }[],
): StationQtyRow[] {
  const byStation = new Map(rows.map((row) => [row.OpStation.trim(), row.qty]));

  return stations.map((station) => ({
    station,
    totalQty: byStation.get(station) ?? 0,
  }));
}

function mergeCompletedRows(
  stockRows: StockCompletedQueryRow[],
  customRows: CustomCompletedQueryRow[],
): StationQtyRow[] {
  const totals = new Map<string, number>();

  for (const row of stockRows) {
    const station = row.OpStation.trim();
    totals.set(station, (totals.get(station) ?? 0) + Number(row.StockCompletedQty ?? 0));
  }

  for (const row of customRows) {
    const station = row.OpStation.trim();
    totals.set(
      station,
      (totals.get(station) ?? 0) + Number(row.CustomCompletedQty ?? 0),
    );
  }

  return STATIONS.map((station) => ({
    station,
    totalQty: totals.get(station) ?? 0,
  }));
}

export async function getDashboardStats(
  startDate: string,
  endDate: string,
): Promise<DashboardStats> {
  const { start, endExclusive } = plantLocalDateRangeToSql(startDate, endDate);
  const pool = await getPool();

  const producedRequest = pool.request();
  bindDateTime2(producedRequest, "start", start);
  bindDateTime2(producedRequest, "endExclusive", endExclusive);

  const stockCompletedRequest = pool.request();
  bindDateTime2(stockCompletedRequest, "start", start);
  bindDateTime2(stockCompletedRequest, "endExclusive", endExclusive);

  const customCompletedRequest = pool.request();
  bindDateTime2(customCompletedRequest, "start", start);
  bindDateTime2(customCompletedRequest, "endExclusive", endExclusive);

  const [producedResult, stockCompletedResult, customCompletedResult] =
    await Promise.all([
      producedRequest.query<ProducedQueryRow>(`
        SELECT
          pl.OpStation,
          SUM(pl.Qty) AS TotalQty
        FROM dbo.tblproductionlog AS pl
        WHERE pl.TimeStamp >= @start
          AND pl.TimeStamp < @endExclusive
        GROUP BY pl.OpStation
      `),
      stockCompletedRequest.query<StockCompletedQueryRow>(`
        SELECT
          pl.OpStation,
          SUM(pl.Qty) AS StockCompletedQty
        FROM dbo.tblproductionlog AS pl
        INNER JOIN dbo.tblstockitems AS s ON s.ItemID = pl.ItemID
        WHERE pl.ItemID IS NOT NULL
          AND pl.TimeStamp >= @start
          AND pl.TimeStamp < @endExclusive
          AND (
            NULLIF(LTRIM(RTRIM(s.FinalStation)), N'') IS NULL
            OR pl.OpStation = LTRIM(RTRIM(s.FinalStation))
          )
        GROUP BY pl.OpStation
      `),
      customCompletedRequest.query<CustomCompletedQueryRow>(`
        SELECT
          pl.OpStation,
          SUM(pl.Qty) AS CustomCompletedQty
        FROM dbo.tblcustomparts AS cp
        INNER JOIN dbo.tblproductionlog AS pl
          ON pl.CustomPartID = cp.CustomPartID
         AND pl.TimeStamp = cp.CompletedAt
        WHERE cp.CompletedAt IS NOT NULL
          AND cp.CompletedAt >= @start
          AND cp.CompletedAt < @endExclusive
        GROUP BY pl.OpStation
      `),
    ]);

  const produced = mergeQtyRows(
    STATIONS,
    producedResult.recordset.map((row) => ({
      OpStation: row.OpStation,
      qty: Number(row.TotalQty ?? 0),
    })),
  );

  return {
    startDate,
    endDate,
    produced,
    completed: mergeCompletedRows(
      stockCompletedResult.recordset,
      customCompletedResult.recordset,
    ),
  };
}

export function getDefaultDashboardWeek(): { startDate: string; endDate: string } {
  return plantLocalWeekRange();
}

export async function getDefaultDashboardStats(): Promise<DashboardStats> {
  const { startDate, endDate } = getDefaultDashboardWeek();
  return getDashboardStats(startDate, endDate);
}
