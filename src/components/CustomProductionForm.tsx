"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  LOCATION_NUMBERS,
  LOCATION_TYPES,
  STATIONS,
} from "@/constants/stations";
import type { CustomPartListItem } from "@/types/custom-part";
import type { ProductionSource } from "@/types";

type CustomProductionFormProps = {
  source: ProductionSource;
};

type CapturedCustomProduction = {
  customPartId: number;
  orderNumber: string;
  customerName: string;
  partNumber: string;
  description: string;
  qtyNeeded: number;
  qty: number;
  opStation: string;
  partComplete: boolean;
  locationType: "Cart" | "Bin";
  locationNo: number;
};

type SubmitResult = {
  totalProduced: number;
  qtyNeeded: number;
  partComplete: boolean;
  lineMarkedComplete: boolean;
};

export function CustomProductionForm({ source }: CustomProductionFormProps) {
  const [orders, setOrders] = useState<string[]>([]);
  const [parts, setParts] = useState<CustomPartListItem[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [partsLoading, setPartsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [orderNumber, setOrderNumber] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [qty, setQty] = useState("");
  const [opStation, setOpStation] = useState("");
  const [partComplete, setPartComplete] = useState(false);
  const [locationType, setLocationType] = useState<"" | "Cart" | "Bin">("");
  const [locationNo, setLocationNo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [captured, setCaptured] = useState<CapturedCustomProduction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);

  const selectedPart = useMemo(
    () => parts.find((part) => part.partNumber === partNumber) ?? null,
    [parts, partNumber],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadOrders() {
      setOrdersLoading(true);
      setLoadError(null);

      try {
        const response = await fetch("/api/custom-parts/orders");
        const data = (await response.json()) as {
          orders?: string[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "Unable to load orders.");
        }

        if (!cancelled) {
          setOrders(data.orders ?? []);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setLoadError(
            fetchError instanceof Error
              ? fetchError.message
              : "Unable to load orders.",
          );
        }
      } finally {
        if (!cancelled) {
          setOrdersLoading(false);
        }
      }
    }

    void loadOrders();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!orderNumber) {
      setParts([]);
      setPartNumber("");
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    async function loadParts() {
      setPartsLoading(true);
      setLoadError(null);
      setPartNumber("");

      try {
        const response = await fetch(
          `/api/custom-parts/parts?order=${encodeURIComponent(orderNumber)}`,
          { signal: controller.signal },
        );
        const data = (await response.json()) as {
          parts?: CustomPartListItem[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "Unable to load parts.");
        }

        if (!cancelled) {
          setParts(data.parts ?? []);
        }
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
          return;
        }
        if (!cancelled) {
          setParts([]);
          setLoadError(
            fetchError instanceof Error
              ? fetchError.message
              : "Unable to load parts.",
          );
        }
      } finally {
        if (!cancelled) {
          setPartsLoading(false);
        }
      }
    }

    void loadParts();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [orderNumber]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const qtyValue = Number(qty);
    const locationNoValue = Number(locationNo);

    if (!orderNumber) {
      setError("Select an AMGS order number.");
      return;
    }

    if (!selectedPart) {
      setError("Select a part number.");
      return;
    }

    if (!Number.isFinite(qtyValue) || qtyValue <= 0 || !Number.isInteger(qtyValue)) {
      setError("Quantity must be a positive whole number.");
      return;
    }

    if (!opStation) {
      setError("Select a station.");
      return;
    }

    if (!locationType) {
      setError("Select cart or bin.");
      return;
    }

    if (
      !Number.isInteger(locationNoValue) ||
      locationNoValue < 1 ||
      locationNoValue > 50
    ) {
      setError("Location number must be between 1 and 50.");
      return;
    }

    setCaptured({
      customPartId: selectedPart.customPartId,
      orderNumber,
      customerName: selectedPart.customerName,
      partNumber: selectedPart.partNumber,
      description: selectedPart.description,
      qtyNeeded: selectedPart.qtyNeeded,
      qty: qtyValue,
      opStation,
      partComplete,
      locationType,
      locationNo: locationNoValue,
    });
  }

  async function handleConfirmSubmit() {
    if (!captured || submitting || submitted) {
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/custom-parts/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customPartId: captured.customPartId,
          partNumber: captured.partNumber,
          qty: captured.qty,
          opStation: captured.opStation,
          partComplete: captured.partComplete,
          locationType: captured.locationType,
          locationNo: captured.locationNo,
          source,
        }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        totalProduced?: number;
        qtyNeeded?: number;
        partComplete?: boolean;
        lineMarkedComplete?: boolean;
      };

      if (!response.ok) {
        setError(data.error ?? "Submit failed.");
        return;
      }

      setSubmitted(true);
      setSubmitResult({
        totalProduced: data.totalProduced ?? captured.qty,
        qtyNeeded: data.qtyNeeded ?? captured.qtyNeeded,
        partComplete: data.partComplete ?? false,
        lineMarkedComplete: data.lineMarkedComplete ?? false,
      });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleBackToEdit() {
    setCaptured(null);
    setError(null);
  }

  function handleRecordAnother() {
    setCaptured(null);
    setSubmitted(false);
    setSubmitResult(null);
    setQty("");
    setOpStation("");
    setPartComplete(false);
    setLocationType("");
    setLocationNo("");
    setError(null);
  }

  if (submitted && captured && submitResult) {
    return (
      <div className="card success-card">
        <h2>Recorded</h2>
        <p>
          Logged <strong>{captured.qty}</strong> ea at{" "}
          <strong>{captured.opStation}</strong> for{" "}
          <strong>{captured.partNumber}</strong>.
        </p>
        <p>
          Total produced: <strong>{submitResult.totalProduced}</strong> of{" "}
          <strong>{submitResult.qtyNeeded}</strong> needed
        </p>
        {submitResult.lineMarkedComplete && (
          <p>Part line marked complete.</p>
        )}
        {submitResult.partComplete && !submitResult.lineMarkedComplete && (
          <p className="hint">This part line was already marked complete.</p>
        )}
        <p className="hint">
          {source === "QR"
            ? "Scan the custom QR code again for the next entry."
            : "Select another custom part for the next entry."}
        </p>
        <button
          type="button"
          className="primary-button"
          onClick={handleRecordAnother}
        >
          Record another
        </button>
      </div>
    );
  }

  if (captured) {
    return (
      <section>
        <div className="card">
          <h2>Review entry</h2>
          <p>Confirm details, then submit to the production log.</p>
          <dl className="part-details">
            <div>
              <dt>AMGS order number</dt>
              <dd>{captured.orderNumber}</dd>
            </div>
            <div>
              <dt>Customer</dt>
              <dd>{captured.customerName}</dd>
            </div>
            <div>
              <dt>Part number</dt>
              <dd>{captured.partNumber}</dd>
            </div>
            <div>
              <dt>Description</dt>
              <dd>{captured.description}</dd>
            </div>
            <div>
              <dt>Quantity</dt>
              <dd>{captured.qty}</dd>
            </div>
            <div>
              <dt>Station</dt>
              <dd>{captured.opStation}</dd>
            </div>
            <div>
              <dt>Part complete</dt>
              <dd>{captured.partComplete ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>
                {captured.locationType} {captured.locationNo}
              </dd>
            </div>
          </dl>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="action-row">
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleConfirmSubmit()}
            disabled={submitting}
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleBackToEdit}
            disabled={submitting}
          >
            Edit
          </button>
        </div>
      </section>
    );
  }

  return (
    <form className="card form-card" onSubmit={handleSubmit}>
      <p className="notice">Custom part production — select an order and part.</p>

      {loadError && <p className="error">{loadError}</p>}

      <label>
        AMGS order number
        <select
          required
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          disabled={ordersLoading}
        >
          <option value="">
            {ordersLoading ? "Loading orders…" : "Select order…"}
          </option>
          {orders.map((order) => (
            <option key={order} value={order}>
              {order}
            </option>
          ))}
        </select>
      </label>

      <label>
        Part number
        <select
          required
          value={partNumber}
          onChange={(e) => setPartNumber(e.target.value)}
          disabled={!orderNumber || partsLoading}
        >
          <option value="">
            {!orderNumber
              ? "Select an order first"
              : partsLoading
                ? "Loading parts…"
                : parts.length === 0
                  ? "No parts on this order"
                  : "Select part…"}
          </option>
          {parts.map((part) => (
            <option key={part.partNumber} value={part.partNumber}>
              {part.partNumber}
              {part.description ? ` — ${part.description}` : ""}
              {part.completedAt ? " (complete)" : ""}
            </option>
          ))}
        </select>
      </label>

      {selectedPart && (
        <dl className="part-details">
          <div>
            <dt>Customer</dt>
            <dd>{selectedPart.customerName}</dd>
          </div>
          <div>
            <dt>Description</dt>
            <dd>{selectedPart.description || "—"}</dd>
          </div>
          <div>
            <dt>Qty needed</dt>
            <dd>{selectedPart.qtyNeeded}</dd>
          </div>
          <div>
            <dt>Material</dt>
            <dd>{selectedPart.material}</dd>
          </div>
          {selectedPart.completedAt && (
            <div>
              <dt>Status</dt>
              <dd>Part line complete</dd>
            </div>
          )}
        </dl>
      )}

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

      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={partComplete}
          onChange={(e) => setPartComplete(e.target.checked)}
        />
        Part complete
      </label>
      <p className="hint field-hint">
        Check when the entire part order line is finished. You can still record
        production after marking complete.
      </p>

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

      <button type="submit">Review entry</button>
    </form>
  );
}
