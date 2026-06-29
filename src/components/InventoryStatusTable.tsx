"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { STATIONS } from "@/constants/stations";
import type { StockInventoryResult, StockInventoryRow } from "@/types/dashboard";

type InventoryStatusTableProps = {
  initialRows: StockInventoryRow[];
};

type SortKey = keyof StockInventoryRow;
type SortDirection = "asc" | "desc";

const COLUMNS: {
  key: SortKey;
  label: string;
  numeric?: boolean;
}[] = [
  { key: "partNumber", label: "Part number" },
  { key: "finalStation", label: "Final station" },
  { key: "qtyOnHand", label: "Qty on hand", numeric: true },
  { key: "minQty", label: "Min Stock QTY", numeric: true },
  { key: "qtyOnOrders", label: "Qty on orders", numeric: true },
  { key: "qtyInProduction", label: "Qty in production", numeric: true },
];

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function getInventoryRowClass(row: StockInventoryRow): string {
  if (row.qtyOnHand < row.qtyOnOrders) {
    return "inventory-shortfall";
  }

  if (row.qtyOnHand < row.minQty && row.qtyOnHand > row.qtyOnOrders) {
    return "inventory-below-min";
  }

  return "";
}

function compareRows(
  a: StockInventoryRow,
  b: StockInventoryRow,
  sortKey: SortKey,
  sortDirection: SortDirection,
): number {
  const aVal = a[sortKey];
  const bVal = b[sortKey];
  const cmp =
    typeof aVal === "number" && typeof bVal === "number"
      ? aVal - bVal
      : String(aVal).localeCompare(String(bVal), undefined, {
          sensitivity: "base",
          numeric: true,
        });

  return sortDirection === "asc" ? cmp : -cmp;
}

type SortableHeaderProps = {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (column: SortKey) => void;
  numeric?: boolean;
};

function SortableHeader({
  label,
  column,
  sortKey,
  sortDirection,
  onSort,
  numeric = false,
}: SortableHeaderProps) {
  const isActive = sortKey === column;

  return (
    <th
      scope="col"
      className={numeric ? "num" : undefined}
      aria-sort={
        isActive
          ? sortDirection === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button
        type="button"
        className={`sort-header-button${numeric ? " sort-header-button-num" : ""}`}
        onClick={() => onSort(column)}
      >
        <span>{label}</span>
        <span className="sort-header-icons" aria-hidden="true">
          <span
            className={`sort-header-icon${
              isActive && sortDirection === "asc" ? " active" : ""
            }`}
          >
            ▲
          </span>
          <span
            className={`sort-header-icon${
              isActive && sortDirection === "desc" ? " active" : ""
            }`}
          >
            ▼
          </span>
        </span>
      </button>
    </th>
  );
}

export function InventoryStatusTable({ initialRows }: InventoryStatusTableProps) {
  const [search, setSearch] = useState("");
  const [station, setStation] = useState("");
  const [shortfallOnly, setShortfallOnly] = useState(false);
  const [rows, setRows] = useState(initialRows);
  const [sortKey, setSortKey] = useState<SortKey>("partNumber");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipInitialFetch = useRef(true);

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => compareRows(a, b, sortKey, sortDirection)),
    [rows, sortKey, sortDirection],
  );

  const handleSort = (column: SortKey) => {
    if (sortKey === column) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(column);
    setSortDirection(column === "partNumber" || column === "finalStation" ? "asc" : "desc");
  };

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (search.trim()) {
        params.set("search", search.trim());
      }
      if (station) {
        params.set("station", station);
      }
      if (shortfallOnly) {
        params.set("shortfallOnly", "1");
      }

      const query = params.toString();
      const response = await fetch(
        `/api/dashboard/inventory${query ? `?${query}` : ""}`,
      );
      const data = (await response.json()) as StockInventoryResult & {
        error?: string;
      };

      if (!response.ok) {
        setError(data.error ?? "Unable to load inventory status.");
        return;
      }

      setRows(data.rows);
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [search, station, shortfallOnly]);

  useEffect(() => {
    if (
      skipInitialFetch.current &&
      !search.trim() &&
      !station &&
      !shortfallOnly
    ) {
      skipInitialFetch.current = false;
      return;
    }

    skipInitialFetch.current = false;

    const timeoutId = window.setTimeout(() => {
      void fetchRows();
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [fetchRows, search, station, shortfallOnly]);

  return (
    <article className="card dashboard-panel">
      <h2>Inventory status</h2>
      <p className="hint">
        Stock parts with a final station. Qty in production is production log
        quantity not yet completed at the final station.
      </p>

      <div className="inventory-filters">
        <label>
          Part number
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search part number"
            autoComplete="off"
          />
        </label>
        <label>
          Final station
          <select
            value={station}
            onChange={(event) => setStation(event.target.value)}
          >
            <option value="">All stations</option>
            {STATIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-label inventory-shortfall-filter">
          <input
            type="checkbox"
            checked={shortfallOnly}
            onChange={(event) => setShortfallOnly(event.target.checked)}
          />
          Orders exceed on hand only
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      <p className="dashboard-total">
        Showing <strong>{formatNumber(rows.length)}</strong> parts
        {loading ? " (updating…)" : ""}
      </p>

      <div className="dashboard-table-wrap">
        <table className="dashboard-table inventory-table">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <SortableHeader
                  key={column.key}
                  label={column.label}
                  column={column.key}
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  numeric={column.numeric}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="inventory-empty">
                  No parts match the current filters.
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={row.itemId} className={getInventoryRowClass(row)}>
                  <td>
                    <Link
                      href={`/parts/edit?itemId=${row.itemId}`}
                      className="inventory-part-link"
                    >
                      {row.partNumber}
                    </Link>
                  </td>
                  <td>{row.finalStation}</td>
                  <td className="num">{formatNumber(row.qtyOnHand)}</td>
                  <td className="num">{formatNumber(row.minQty)}</td>
                  <td className="num">{formatNumber(row.qtyOnOrders)}</td>
                  <td className="num">{formatNumber(row.qtyInProduction)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}
