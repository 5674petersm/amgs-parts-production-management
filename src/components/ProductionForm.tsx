"use client";

import { FormEvent, useState } from "react";

import {
  LOCATION_NUMBERS,
  LOCATION_TYPES,
  STATIONS,
} from "@/constants/stations";
import type { ProductionSource, StockItem } from "@/types";

type ProductionFormProps = {
  item: StockItem;
  source: ProductionSource;
};

export function ProductionForm({ item, source }: ProductionFormProps) {
  const [qty, setQty] = useState("");
  const [opStation, setOpStation] = useState("");
  const [locationType, setLocationType] = useState<"" | "Cart" | "Bin">("");
  const [locationNo, setLocationNo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTotalQty, setNewTotalQty] = useState<number | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitted || submitting) {
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.itemId,
          masterPNo: item.masterPNo,
          qty: Number(qty),
          opStation,
          locationType,
          locationNo: Number(locationNo),
          source,
        }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        newTotalQty?: number;
      };

      if (!response.ok) {
        setError(data.error ?? "Submit failed.");
        return;
      }

      setSubmitted(true);
      setNewTotalQty(data.newTotalQty ?? null);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="card success-card">
        <h2>Recorded</h2>
        <p>
          Added <strong>{qty}</strong> ea to <strong>{item.masterPNo}</strong>.
        </p>
        {newTotalQty !== null && (
          <p>
            New quantity on hand: <strong>{newTotalQty}</strong> ea
          </p>
        )}
        <p className="hint">
          {source === "QR"
            ? "Scan the QR code again for the next entry."
            : "Search again or scan a QR code for the next entry."}
        </p>
      </div>
    );
  }

  return (
    <form className="card form-card" onSubmit={handleSubmit}>
      <dl className="part-details">
        <div>
          <dt>Part number</dt>
          <dd>{item.masterPNo}</dd>
        </div>
        <div>
          <dt>Description</dt>
          <dd>{item.itemDescription || "—"}</dd>
        </div>
        <div>
          <dt>Qty on hand</dt>
          <dd>{item.totalQty} ea</dd>
        </div>
      </dl>

      <label>
        Quantity produced
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          required
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
      </label>

      <label>
        Station
        <select
          required
          value={opStation}
          onChange={(e) => setOpStation(e.target.value)}
        >
          <option value="">Select station…</option>
          {STATIONS.map((station) => (
            <option key={station} value={station}>
              {station}
            </option>
          ))}
        </select>
      </label>

      <label>
        Cart or bin
        <select
          required
          value={locationType}
          onChange={(e) =>
            setLocationType(e.target.value as "" | "Cart" | "Bin")
          }
        >
          <option value="">Select…</option>
          {LOCATION_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>

      <label>
        Number (1–50)
        <select
          required
          value={locationNo}
          onChange={(e) => setLocationNo(e.target.value)}
          disabled={!locationType}
        >
          <option value="">Select…</option>
          {LOCATION_NUMBERS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="error">{error}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}
