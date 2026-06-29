"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

import { PartSearchResults } from "@/components/PartSearchResults";
import { STATIONS } from "@/constants/stations";
import type { PartLookupMatchesResponse, StockItem } from "@/types";

function isLookupMatches(
  data: StockItem | PartLookupMatchesResponse,
): data is PartLookupMatchesResponse {
  return "matches" in data && Array.isArray(data.matches);
}

type EditPartFormProps = {
  initialItemId?: string;
};

export function EditPartForm({ initialItemId }: EditPartFormProps) {
  const [masterPNo, setMasterPNo] = useState("");
  const [itemId, setItemId] = useState("");
  const [item, setItem] = useState<StockItem | null>(null);
  const [matches, setMatches] = useState<StockItem[] | null>(null);
  const [editMasterPNo, setEditMasterPNo] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [totalQty, setTotalQty] = useState("");
  const [minQty, setMinQty] = useState("");
  const [finalStation, setFinalStation] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const preloadedItemId = useRef<string | null>(null);

  function selectItem(selected: StockItem) {
    setItem(selected);
    setMatches(null);
    setEditMasterPNo(selected.masterPNo);
    setItemDescription(selected.itemDescription);
    setTotalQty(String(selected.totalQty));
    setMinQty(String(selected.minQty));
    setFinalStation(selected.finalStation ?? "");
    setError(null);
    setSaved(false);
  }

  useEffect(() => {
    const itemIdParam = initialItemId?.trim();
    if (!itemIdParam || preloadedItemId.current === itemIdParam) {
      return;
    }
    preloadedItemId.current = itemIdParam;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setMatches(null);

    void (async () => {
      try {
        const response = await fetch("/api/parts/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: itemIdParam }),
        });

        const data = (await response.json()) as
          | StockItem
          | PartLookupMatchesResponse
          | { error?: string };

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setError((data as { error?: string }).error ?? "Part not found.");
          return;
        }

        const result = data as StockItem | PartLookupMatchesResponse;
        if (isLookupMatches(result)) {
          setMatches(result.matches);
          return;
        }

        selectItem(result);
      } catch {
        if (!cancelled) {
          setError("Network error. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      preloadedItemId.current = null;
    };
  }, [initialItemId]);

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
    setSaved(false);
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

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!item) {
      return;
    }

    setError(null);
    setSaved(false);
    setSaving(true);

    try {
      const response = await fetch(`/api/parts/${item.itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPNo: editMasterPNo.trim(),
          itemDescription: itemDescription.trim(),
          totalQty: Number(totalQty),
          minQty: Number(minQty),
          finalStation: finalStation || null,
        }),
      });

      const data = (await response.json()) as StockItem & { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Unable to save changes.");
        return;
      }

      setItem(data);
      setEditMasterPNo(data.masterPNo);
      setItemDescription(data.itemDescription);
      setTotalQty(String(data.totalQty));
      setMinQty(String(data.minQty));
      setFinalStation(data.finalStation ?? "");
      setSaved(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleSearchAnother() {
    setItem(null);
    setMatches(null);
    setMasterPNo("");
    setItemId("");
    setEditMasterPNo("");
    setItemDescription("");
    setTotalQty("");
    setMinQty("");
    setFinalStation("");
    setError(null);
    setSaved(false);
  }

  if (item) {
    return (
      <section>
        <div className="card form-card">
          <h2>Edit part</h2>
          <dl className="part-details compact-details">
            <div>
              <dt>Item ID</dt>
              <dd>{item.itemId}</dd>
            </div>
          </dl>

          <form onSubmit={handleSave}>
            <label>
              Part number
              <input
                type="text"
                required
                value={editMasterPNo}
                onChange={(e) => {
                  setEditMasterPNo(e.target.value);
                  setSaved(false);
                }}
                autoComplete="off"
              />
            </label>

            <label>
              Description
              <textarea
                required
                rows={3}
                value={itemDescription}
                onChange={(e) => {
                  setItemDescription(e.target.value);
                  setSaved(false);
                }}
              />
            </label>

            <label>
              Qty on hand
              <input
                type="number"
                required
                min={0}
                step={1}
                inputMode="numeric"
                value={totalQty}
                onChange={(e) => {
                  setTotalQty(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <p className="hint field-hint">
              Changes are recorded in inventory history as a manual adjustment.
            </p>

            <label>
              Min Stock QTY
              <input
                type="number"
                required
                min={0}
                step={1}
                inputMode="numeric"
                value={minQty}
                onChange={(e) => {
                  setMinQty(e.target.value);
                  setSaved(false);
                }}
              />
            </label>

            <label>
              Final station
              <select
                value={finalStation}
                onChange={(e) => {
                  setFinalStation(e.target.value);
                  setSaved(false);
                }}
              >
                <option value="">Any station (always update inventory)</option>
                {STATIONS.map((station) => (
                  <option key={station} value={station}>
                    {station}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint field-hint">
              Inventory updates only when production is recorded at the final
              station. Leave blank to update on every submit.
            </p>

            {error && <p className="error">{error}</p>}
            {saved && <p className="success">Part saved.</p>}

            <div className="action-row">
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={handleSearchAnother}
                disabled={saving}
              >
                Find another part
              </button>
            </div>
          </form>
        </div>
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
    <section>
      <p className="notice">
        Look up a stock part by part number or item ID. Partial part numbers
        show a list of matches to choose from.
      </p>

      <form className="card search-form" onSubmit={handleSearch}>
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

        <button
          type="submit"
          disabled={loading || (!masterPNo.trim() && !itemId.trim())}
        >
          {loading ? "Searching…" : "Find part"}
        </button>
      </form>

      <p className="hint" style={{ marginTop: "1rem" }}>
        <Link href="/custom-part">Add custom part</Link>
      </p>
    </section>
  );
}
