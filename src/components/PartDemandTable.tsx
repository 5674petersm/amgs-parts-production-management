"use client";

import { useEffect, useMemo, useState } from "react";

import type { PartDemandRow } from "@/types/part-demand";

type SortKey = "partNumber" | "description" | "orderCount" | "requiredQty" | "inventoryQty" | "earliestRequiredDate";
type SortState = { key: SortKey; direction: "asc" | "desc" };
type DatePreset = "this-week" | "next-two-weeks" | "this-month";

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

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function presetRange(preset: DatePreset) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  if (preset === "this-week") {
    const start = new Date(today);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start: localDateKey(start), end: localDateKey(end) };
  }
  if (preset === "this-month") {
    return {
      start: localDateKey(new Date(today.getFullYear(), today.getMonth(), 1, 12)),
      end: localDateKey(new Date(today.getFullYear(), today.getMonth() + 1, 0, 12)),
    };
  }
  const end = new Date(today);
  end.setDate(end.getDate() + 13);
  return { start: localDateKey(today), end: localDateKey(end) };
}

export function PartDemandTable() {
  const [rows, setRows] = useState<PartDemandRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "requiredQty", direction: "desc" });
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [preset, setPreset] = useState<DatePreset | "">("");

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
    const byDate = startDate || endDate ? rows.flatMap((row) => {
      const buckets = row.demandByDueDate.filter((bucket) => bucket.dueDate
        && (!startDate || bucket.dueDate >= startDate)
        && (!endDate || bucket.dueDate <= endDate));
      if (!buckets.length) return [];
      return [{
        ...row,
        orderCount: buckets.reduce((total, bucket) => total + bucket.orderCount, 0),
        requiredQty: buckets.reduce((total, bucket) => total + bucket.requiredQty, 0),
        earliestRequiredDate: buckets.map((bucket) => bucket.dueDate).sort()[0] || "",
      }];
    }) : rows;
    const filtered = query ? byDate.filter((row) =>
      row.partNumber.toLowerCase().includes(query)
      || row.description.toLowerCase().includes(query)) : byDate;
    return [...filtered].sort((left, right) => {
      const a = left[sort.key];
      const b = right[sort.key];
      const comparison = typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a || "\uffff").localeCompare(String(b || "\uffff"), undefined, { numeric: true });
      return (sort.direction === "asc" ? comparison : -comparison)
        || left.partNumber.localeCompare(right.partNumber, undefined, { numeric: true });
    });
  }, [rows, search, sort, startDate, endDate]);

  const selectPreset = (value: DatePreset) => {
    const range = presetRange(value);
    setStartDate(range.start);
    setEndDate(range.end);
    setPreset(value);
  };

  const clearFilters = () => {
    setSearch("");
    setStartDate("");
    setEndDate("");
    setPreset("");
  };

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
      <div className="part-demand-filters">
        <label className="part-demand-search"><span>Part or description</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search part demand" /></label>
        <label><span>Order due from</span><input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPreset(""); }} /></label>
        <label><span>Order due through</span><input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPreset(""); }} /></label>
        <button className="secondary-button" type="button" onClick={clearFilters}>Clear</button>
        <div className="part-demand-presets" aria-label="Due date presets">
          <button type="button" aria-pressed={preset === "this-week"} onClick={() => selectPreset("this-week")}>This week</button>
          <button type="button" aria-pressed={preset === "next-two-weeks"} onClick={() => selectPreset("next-two-weeks")}>Next two weeks</button>
          <button type="button" aria-pressed={preset === "this-month"} onClick={() => selectPreset("this-month")}>This month</button>
        </div>
      </div>
      {startDate && endDate && startDate > endDate && <p className="error">The start date must be on or before the end date.</p>}
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
