"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CustomPartFilePreview } from "@/components/CustomPartFilePreview";
import type { PanelOrder, PanelOrderItem } from "@/types/panel-order";

function dateLabel(value: string) {
  if (!value) return "No due date";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function SelectionCheckbox({ checked, mixed, label, onChange }: { checked: boolean; mixed?: boolean; label: string; onChange: (checked: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = Boolean(mixed); }, [mixed]);
  return <input ref={ref} type="checkbox" checked={checked} aria-label={label} onClick={(event) => event.stopPropagation()} onChange={(event) => onChange(event.target.checked)} />;
}

function previewFile(panel: PanelOrderItem, order: PanelOrder, type: "drawing" | "cutlist") {
  const base = `/api/assigned-panel-documents/${encodeURIComponent(order.order)}/${encodeURIComponent(panel.rowId)}`;
  return {
    id: `${panel.id}-${type}`,
    name: type === "drawing" ? panel.drawingName : panel.cutlistName,
    mimeType: "application/pdf",
    url: `${base}/${type}`,
  };
}

export function PanelOrders() {
  const [orders, setOrders] = useState<PanelOrder[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState<"drawings" | "cutlist" | "">("");

  useEffect(() => {
    fetch("/api/panel-orders", { cache: "no-store" }).then(async (response) => {
      const result = await response.json() as { orders?: PanelOrder[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to load panel orders.");
      setOrders(result.orders ?? []);
    }).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Unable to load panel orders."))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? orders.filter((order) => order.order.toLowerCase().includes(query)
      || order.customer.toLowerCase().includes(query)
      || order.panels.some((panel) => panel.partNumber.toLowerCase().includes(query))) : orders;
  }, [orders, search]);
  const selectedPanels = useMemo(() => orders.flatMap((order) => order.panels
    .filter((panel) => selected.has(panel.id))
    .map((panel) => ({ panel, order }))), [orders, selected]);

  const togglePanel = (id: string, checked: boolean) => setSelected((current) => {
    const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next;
  });
  const toggleOrder = (order: PanelOrder, checked: boolean) => setSelected((current) => {
    const next = new Set(current); order.panels.forEach((panel) => checked ? next.add(panel.id) : next.delete(panel.id)); return next;
  });

  const downloadBatch = async (type: "drawings" | "cutlist") => {
    setGenerating(type);
    setError("");
    try {
      const response = await fetch("/api/panel-documents/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          items: selectedPanels.map(({ panel, order }) => ({ order: order.order, lineId: panel.rowId })),
        }),
      });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || "Unable to generate selected panel documents.");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = type === "cutlist" ? "selected-panels-consolidated-cutlist.pdf" : "selected-panels-drawings.pdf";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Unable to generate selected panel documents.");
    } finally {
      setGenerating("");
    }
  };

  return (
    <section className="panel-orders-view">
      <div className="panel-orders-toolbar">
        <input className="floor-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, customer, or CP number" />
        <span>{selectedPanels.length} panels selected</span>
        <button className="secondary-button" type="button" disabled={!selectedPanels.length || Boolean(generating)} onClick={() => void downloadBatch("drawings")}>{generating === "drawings" ? "Building…" : "Combined drawings PDF"}</button>
        <button className="primary-button" type="button" disabled={!selectedPanels.length || Boolean(generating)} onClick={() => void downloadBatch("cutlist")}>{generating === "cutlist" ? "Building…" : "Consolidated cutlist PDF"}</button>
      </div>
      {loading && <p>Loading panel orders…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && visible.map((order) => {
        const selectedCount = order.panels.filter((panel) => selected.has(panel.id)).length;
        return (
          <details className="panel-order-card" key={order.order}>
            <summary>
              <SelectionCheckbox checked={Boolean(order.panels.length) && selectedCount === order.panels.length} mixed={selectedCount > 0 && selectedCount < order.panels.length} label={`Select all panels in order ${order.order}`} onChange={(checked) => toggleOrder(order, checked)} />
              <strong>#{order.order}</strong>
              <span>{order.customer}</span>
              <span>{dateLabel(order.dueDate)}</span>
              <b>{order.panels.length} panel{order.panels.length === 1 ? "" : "s"}</b>
            </summary>
            <div className="panel-order-detail">
              {order.panels.map((panel) => (
                <div className="panel-selection-row" key={panel.id}>
                  <SelectionCheckbox checked={selected.has(panel.id)} label={`Select ${panel.partNumber}`} onChange={(checked) => togglePanel(panel.id, checked)} />
                  <div><strong>{panel.partNumber}</strong><span>Line {panel.lineNumber ?? "—"} · Qty {panel.quantity}</span><small>{panel.notes}</small></div>
                  <CustomPartFilePreview file={previewFile(panel, order, "drawing")} />
                  <CustomPartFilePreview file={previewFile(panel, order, "cutlist")} />
                </div>
              ))}
              {!order.panels.length && <p className="panel-document-message">No engineering-approved panel documents are assigned to this order.</p>}
            </div>
          </details>
        );
      })}
      {!loading && !visible.length && !error && <p>No open orders have engineering-approved panel documents matching this search.</p>}
    </section>
  );
}
