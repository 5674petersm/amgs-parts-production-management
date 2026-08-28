"use client";

import { useEffect, useMemo, useState } from "react";

import type { CopyableCustomPart } from "@/types/custom-part";

type OrderChoice = { order: string; customer: string };

function matchesOrder(choice: OrderChoice, search: string): boolean {
  const query = search.trim().toLowerCase();
  return !query
    || choice.order.toLowerCase().includes(query)
    || choice.customer.toLowerCase().includes(query);
}

export function CopyCustomPartsOrder({
  onCancel,
  onCopied,
}: {
  onCancel: () => void;
  onCopied: (message: string) => void;
}) {
  const [sourceOrders, setSourceOrders] = useState<OrderChoice[]>([]);
  const [targetOrders, setTargetOrders] = useState<OrderChoice[]>([]);
  const [sourceOrder, setSourceOrder] = useState("");
  const [targetOrder, setTargetOrder] = useState("");
  const [sourceSearch, setSourceSearch] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [parts, setParts] = useState<CopyableCustomPart[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/custom-parts/orders", { cache: "no-store" }).then(async (response) => {
        const result = await response.json() as {
          orders?: string[];
          orderChoices?: OrderChoice[];
          error?: string;
        };
        if (!response.ok) throw new Error(result.error || "Unable to load previous orders.");
        return result.orderChoices
          ?? (result.orders ?? []).map((order) => ({ order, customer: "Unknown customer" }));
      }),
      fetch("/api/shop-floor-orders", { cache: "no-store" }).then(async (response) => {
        const result = await response.json() as { orders?: OrderChoice[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Unable to load new orders.");
        return result.orders ?? [];
      }),
    ]).then(([sources, targets]) => {
      setSourceOrders(sources);
      setTargetOrders(targets);
    }).catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "Unable to load orders.");
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!sourceOrder) {
      setParts([]);
      setSelectedIds([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/custom-parts/copy-order?sourceOrder=${encodeURIComponent(sourceOrder)}`, {
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      const result = await response.json() as { parts?: CopyableCustomPart[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to load the source order.");
      const loaded = result.parts ?? [];
      setParts(loaded);
      setSelectedIds(loaded.map((part) => part.customPartId));
    }).catch((loadError: unknown) => {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load the source order.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [sourceOrder]);

  const allSelected = parts.length > 0 && selectedIds.length === parts.length;
  const filteredSourceOrders = useMemo(
    () => sourceOrders.filter((order) => matchesOrder(order, sourceSearch)),
    [sourceOrders, sourceSearch],
  );
  const filteredTargetOrders = useMemo(
    () => targetOrders.filter((order) =>
      order.order !== sourceOrder && matchesOrder(order, targetSearch)),
    [sourceOrder, targetOrders, targetSearch],
  );
  const targetCustomer = useMemo(
    () => targetOrders.find((order) => order.order === targetOrder)?.customer || "",
    [targetOrder, targetOrders],
  );

  async function copyOrder() {
    setCopying(true);
    setError("");
    try {
      const response = await fetch("/api/custom-parts/copy-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceOrder, targetOrder, customPartIds: selectedIds }),
      });
      const result = await response.json() as {
        copiedParts?: { partNumber: string; mappedLineCount: number; unmatchedLineCount: number }[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Unable to copy this order.");
      const copied = result.copiedParts ?? [];
      const mapped = copied.reduce((total, part) => total + part.mappedLineCount, 0);
      const unmatched = copied.reduce((total, part) => total + part.unmatchedLineCount, 0);
      onCopied(`${copied.length} custom part${copied.length === 1 ? "" : "s"} copied to order #${targetOrder}.${mapped ? ` ${mapped} matching order-line link${mapped === 1 ? "" : "s"} carried over.` : ""}${unmatched ? ` ${unmatched} old link${unmatched === 1 ? " has" : "s have"} no matching line on the new order and can be assigned while editing the copied part.` : ""}`);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "Unable to copy this order.");
    } finally {
      setCopying(false);
    }
  }

  return (
    <section className="copy-order-card card" aria-labelledby="copy-order-title">
      <div className="copy-order-heading">
        <div>
          <h2 id="copy-order-title">Copy a previous order</h2>
          <p>Bring all custom-part details and drawing files forward, or choose only the lines needed again.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onCancel} disabled={copying}>Cancel</button>
      </div>

      <div className="copy-order-selectors">
        <div className="copy-order-selector">
          <label htmlFor="copy-source-order">Previous order</label>
          <input
            type="search"
            value={sourceSearch}
            onChange={(event) => {
              setSourceSearch(event.target.value);
              setSourceOrder("");
            }}
            placeholder="Search order or customer"
            aria-label="Search previous orders"
            disabled={copying}
          />
          <select id="copy-source-order" value={sourceOrder} onChange={(event) => setSourceOrder(event.target.value)} disabled={copying}>
            <option value="">Choose source order</option>
            {filteredSourceOrders.map((order) => (
              <option value={order.order} key={order.order}>#{order.order} · {order.customer}</option>
            ))}
          </select>
          {sourceSearch && <small>{filteredSourceOrders.length} matching previous order{filteredSourceOrders.length === 1 ? "" : "s"}</small>}
        </div>
        <span aria-hidden="true">→</span>
        <div className="copy-order-selector">
          <label htmlFor="copy-target-order">New order</label>
          <input
            type="search"
            value={targetSearch}
            onChange={(event) => {
              setTargetSearch(event.target.value);
              setTargetOrder("");
            }}
            placeholder="Search order or customer"
            aria-label="Search destination orders"
            disabled={copying}
          />
          <select id="copy-target-order" value={targetOrder} onChange={(event) => setTargetOrder(event.target.value)} disabled={copying}>
            <option value="">Choose destination order</option>
            {filteredTargetOrders.map((order) => (
              <option value={order.order} key={order.order}>#{order.order} · {order.customer}</option>
            ))}
          </select>
          {targetSearch && <small>{filteredTargetOrders.length} matching active order{filteredTargetOrders.length === 1 ? "" : "s"}</small>}
          {targetCustomer && <small>New parts will use customer: {targetCustomer}</small>}
        </div>
      </div>

      {loading && <p>Loading order details…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {!loading && sourceOrder && !parts.length && !error && <p>No custom parts were found on this order.</p>}
      {parts.length > 0 && (
        <>
          <div className="copy-order-selection-heading">
            <strong>{selectedIds.length} of {parts.length} lines selected</strong>
            <button type="button" className="link-button" onClick={() => setSelectedIds(allSelected ? [] : parts.map((part) => part.customPartId))} disabled={copying}>
              {allSelected ? "Clear all" : "Copy entire order"}
            </button>
          </div>
          <div className="copy-order-lines">
            {parts.map((part) => (
              <label key={part.customPartId} className={selectedIds.includes(part.customPartId) ? "selected" : ""}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(part.customPartId)}
                  disabled={copying}
                  onChange={(event) => setSelectedIds((current) => event.target.checked
                    ? [...current, part.customPartId]
                    : current.filter((id) => id !== part.customPartId))}
                />
                <span>
                  <strong>{part.partNumber}</strong>
                  <small>{part.description}</small>
                </span>
                <span className="copy-order-line-meta">Qty {part.qtyNeeded} · {part.material} · {part.color || "No color"}<small>{part.fileCount} drawing file{part.fileCount === 1 ? "" : "s"}{part.mappedLineCount ? ` · ${part.mappedLineCount} linked order line${part.mappedLineCount === 1 ? "" : "s"}` : ""}{part.completed ? " · Previously completed" : ""}</small></span>
              </label>
            ))}
          </div>
        </>
      )}

      <div className="action-row">
        <button className="primary-button" type="button" onClick={() => void copyOrder()} disabled={copying || !sourceOrder || !targetOrder || !selectedIds.length}>
          {copying ? "Copying details and drawings…" : allSelected ? `Copy entire order to #${targetOrder || "…"}` : `Copy ${selectedIds.length} selected line${selectedIds.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </section>
  );
}
