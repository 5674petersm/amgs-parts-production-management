"use client";

import { useEffect, useMemo, useState } from "react";

import type { PartDemandRow } from "@/types/part-demand";

type SortKey = "partNumber" | "description" | "orderCount" | "requiredQty" | "inventoryQty" | "earliestRequiredDate";
type SortState = { key: SortKey; direction: "asc" | "desc" };

const columns: { key: SortKey; label: string }[] = [
  { key: "partNumber", label: "Part" },
  { key: "description", label: "Description" },
  { key: "orderCount", label: "Orders" },
  { key: "requiredQty", label: "Required" },
  { key: "inventoryQty", label: "Inventory" },
  { key: "earliestRequiredDate", label: "Earliest" },
];

function dateLabel(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function PartDemandTable() {
  const [rows, setRows] = useState<PartDemandRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "requiredQty", direction: "desc" });

  useEffect(() => {
    fetch("/api/parts-demand", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { rows?: PartDemandRow[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Unable to load part demand.");
        setRows(result.rows ?? []);
      })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Unable to load part demand."))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query ? rows.filter((row) =>
      row.partNumber.toLowerCase().includes(query)
      || row.description.toLowerCase().includes(query)) : rows;
    return [...filtered].sort((left, right) => {
      const a = left[sort.key];
      const b = right[sort.key];
      const comparison = typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a || "\uffff").localeCompare(String(b || "\uffff"), undefined, { numeric: true });
      return (sort.direction === "asc" ? comparison : -comparison)
        || left.partNumber.localeCompare(right.partNumber, undefined, { numeric: true });
    });
  }, [rows, search, sort]);

  const changeSort = (key: SortKey) => {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "partNumber" || key === "description" || key === "earliestRequiredDate" ? "asc" : "desc" });
  };

  return (
    <section className="floor-data-page">
      <div className="floor-page-heading">
        <div>
          <h1>Part Demand</h1>
          <p>Required quantities across all open orders compared with current inventory.</p>
        </div>
        <span>{visible.length} parts</span>
      </div>
      <input className="floor-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search part or description" />
      {loading && <p>Loading part demand…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && (
        <div className="floor-table-wrap">
          <table className="floor-data-table">
            <thead><tr>{columns.map((column) => (
              <th key={column.key} aria-sort={sort.key === column.key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                <button type="button" onClick={() => changeSort(column.key)}>
                  {column.label}<span aria-hidden="true">{sort.key === column.key ? (sort.direction === "asc" ? " \u2191" : " \u2193") : " \u2195"}</span>
                </button>
              </th>
            ))}</tr></thead>
            <tbody>
              {visible.map((row) => (
                <tr className={row.inventoryQty < row.requiredQty ? "shortfall" : ""} key={row.stockId}>
                  <td data-label="Part"><strong>{row.partNumber}</strong></td>
                  <td data-label="Description">{row.description || "—"}</td>
                  <td data-label="Orders">{row.orderCount}</td>
                  <td data-label="Required"><strong>{row.requiredQty}</strong></td>
                  <td data-label="Inventory">{row.inventoryQty}</td>
                  <td data-label="Earliest">{dateLabel(row.earliestRequiredDate)}</td>
                </tr>
              ))}
              {!visible.length && <tr><td colSpan={6}>No demanded parts found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
