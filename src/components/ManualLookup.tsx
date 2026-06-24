"use client";

import { FormEvent, useState } from "react";

import { PartSearchResults } from "@/components/PartSearchResults";
import { ProductionForm } from "@/components/ProductionForm";
import type { PartLookupMatchesResponse, StockItem } from "@/types";

type ManualLookupProps = {
  initialNotFound?: string;
};

function isNumericItemId(value: string): boolean {
  return /^\d+$/.test(value.trim()) && Number(value) > 0;
}

function isLookupMatches(
  data: StockItem | PartLookupMatchesResponse,
): data is PartLookupMatchesResponse {
  return "matches" in data && Array.isArray(data.matches);
}

export function ManualLookup({ initialNotFound }: ManualLookupProps) {
  const notFound = initialNotFound?.trim() ?? "";
  const notFoundIsItemId = notFound ? isNumericItemId(notFound) : false;

  const [masterPNo, setMasterPNo] = useState(notFoundIsItemId ? "" : notFound);
  const [itemId, setItemId] = useState(notFoundIsItemId ? notFound : "");
  const [item, setItem] = useState<StockItem | null>(null);
  const [matches, setMatches] = useState<StockItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    notFound
      ? notFoundIsItemId
        ? `No part found for item ID ${notFound}. Try again or search by part number below.`
        : `No part found for "${notFound}". Try item ID or part number below.`
      : null,
  );

  function selectItem(selected: StockItem) {
    setItem(selected);
    setMatches(null);
    setError(null);
  }

  function clearSearch() {
    setMatches(null);
    setError(null);
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    if (item) {
      return;
    }

    setError(null);
    setMatches(null);
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

      const data = (await response.json()) as
        | StockItem
        | PartLookupMatchesResponse
        | { error?: string };

      if (!response.ok) {
        setError((data as { error?: string }).error ?? "Part not found.");
        setItem(null);
        return;
      }

      const result = data as StockItem | PartLookupMatchesResponse;
      if (isLookupMatches(result)) {
        setMatches(result.matches);
        return;
      }

      selectItem(result);
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

  if (matches) {
    return (
      <PartSearchResults
        matches={matches}
        onSelect={selectItem}
        onBack={clearSearch}
      />
    );
  }

  return (
    <form className="card search-form" onSubmit={handleSearch}>
      <p className="notice">
        Enter part number (<strong>MasterPNo</strong>) or <strong>Item ID</strong>.
        Partial part numbers show a list of matches.
      </p>

      <label className="field-row">
        Part number
        <input
          type="text"
          value={masterPNo}
          onChange={(e) => setMasterPNo(e.target.value)}
          placeholder="Full or partial part number"
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
