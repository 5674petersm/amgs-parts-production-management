"use client";

import { FormEvent, useState } from "react";

import { ProductionForm } from "@/components/ProductionForm";
import type { StockItem } from "@/types";

type ManualLookupProps = {
  initialNotFound?: string;
};

export function ManualLookup({ initialNotFound }: ManualLookupProps) {
  const [masterPNo, setMasterPNo] = useState(initialNotFound ?? "");
  const [itemId, setItemId] = useState("");
  const [item, setItem] = useState<StockItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    initialNotFound
      ? `No part found for "${initialNotFound}". Try item ID or part number below.`
      : null,
  );

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    if (item) {
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/parts/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPNo: masterPNo.trim() || undefined,
          itemId: itemId.trim() || undefined,
        }),
      });

      const data = (await response.json()) as StockItem & { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Part not found.");
        setItem(null);
        return;
      }

      setItem(data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (item) {
    return (
      <section>
        <ProductionForm item={item} source="Manual" />
      </section>
    );
  }

  return (
    <form className="card search-form" onSubmit={handleSearch}>
      <p className="notice">
        Enter either part number (<strong>MasterPNo</strong>) or{" "}
        <strong>Item ID</strong>.
      </p>

      <label className="field-row">
        Part number
        <input
          type="text"
          value={masterPNo}
          onChange={(e) => setMasterPNo(e.target.value)}
          placeholder="MasterPNo"
          autoComplete="off"
        />
      </label>

      <label className="field-row">
        Item ID
        <input
          type="number"
          inputMode="numeric"
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          placeholder="ItemID"
        />
      </label>

      {error && <p className="error">{error}</p>}

      <button type="submit" disabled={loading || (!masterPNo.trim() && !itemId.trim())}>
        {loading ? "Searching…" : "Find part"}
      </button>
    </form>
  );
}
