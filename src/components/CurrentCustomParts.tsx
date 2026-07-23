"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CustomPartForm } from "@/components/CustomPartForm";
import { CustomPartFilePreview } from "@/components/CustomPartFilePreview";
import { PanelOrders } from "@/components/PanelOrders";
import type { CurrentCustomPart } from "@/types/custom-part";

type SortMode = "order" | "material";

export function CurrentCustomParts({ canManage = false }: { canManage?: boolean }) {
  const [parts, setParts] = useState<CurrentCustomPart[]>([]);
  const [search, setSearch] = useState("");
  const [material, setMaterial] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("order");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<"add" | CurrentCustomPart | null>(null);
  const [subtab, setSubtab] = useState<"parts" | "panels">("parts");

  const loadParts = useCallback(() => {
    setLoading(true);
    setError("");
    fetch("/api/custom-parts/current", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { parts?: CurrentCustomPart[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Unable to load custom parts.");
        setParts(result.parts ?? []);
      })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Unable to load custom parts."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => loadParts(), [loadParts]);

  const materials = useMemo(() => [...new Set(parts.map((part) => part.material))]
    .sort((a, b) => a.localeCompare(b)), [parts]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return parts.filter((part) =>
      (!material || part.material === material)
      && (!query
        || part.orderNumber.toLowerCase().includes(query)
        || part.partNumber.toLowerCase().includes(query)
        || part.description.toLowerCase().includes(query)
        || part.customerName.toLowerCase().includes(query)))
      .sort((a, b) => {
        const primary = sortMode === "material"
          ? a.material.localeCompare(b.material)
          : a.orderNumber.localeCompare(b.orderNumber, undefined, { numeric: true });
        return primary || a.partNumber.localeCompare(b.partNumber, undefined, { numeric: true });
      });
  }, [parts, material, search, sortMode]);

  if (editor) {
    const editPart = editor === "add" ? null : editor;
    return (
      <section className="custom-part-editor">
        <div className="floor-page-heading">
          <div><h1>{editPart ? `Edit ${editPart.partNumber}` : "Add Custom Parts"}</h1><p>{editPart ? "Update details, mapping, or add drawing files." : "Keep the order selected while adding multiple supporting parts."}</p></div>
          <button className="order-refresh-button" type="button" onClick={() => setEditor(null)}>Back to list</button>
        </div>
        <CustomPartForm
          key={editPart?.customPartId ?? "add"}
          initialOrderNumber={editPart?.orderNumber || ""}
          editPart={editPart}
          onSaved={() => {
            setEditor(null);
            loadParts();
          }}
        />
      </section>
    );
  }

  if (subtab === "panels") {
    return (
      <section className="floor-data-page">
        <div className="floor-page-heading"><div><h1>Custom Parts</h1><p>Supporting parts and generated Custom WM Panel fabrication documents.</p></div></div>
        <nav className="custom-parts-subtabs" aria-label="Custom part views">
          <button type="button" onClick={() => setSubtab("parts")}>Parts</button>
          <button className="active" type="button" aria-current="page">Panels</button>
        </nav>
        <PanelOrders />
      </section>
    );
  }

  return (
    <section className="floor-data-page">
      <div className="floor-page-heading">
        <div><h1>Custom Parts</h1><p>Supporting parts and generated Custom WM Panel fabrication documents.</p></div>
        <div className="custom-parts-heading-actions">
          <span>{visible.length} parts</span>
          {canManage && <button className="order-refresh-button" type="button" onClick={() => setEditor("add")}>Add parts</button>}
        </div>
      </div>
      <nav className="custom-parts-subtabs" aria-label="Custom part views">
        <button className="active" type="button" aria-current="page">Parts</button>
        <button type="button" onClick={() => setSubtab("panels")}>Panels</button>
      </nav>
      <div className="custom-part-controls">
        <input className="floor-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, part, or customer" />
        <label><span>Material</span><select value={material} onChange={(event) => setMaterial(event.target.value)}><option value="">All materials</option>{materials.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
        <label><span>Sort by</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}><option value="order">Order #</option><option value="material">Material</option></select></label>
      </div>
      {loading && <p>Loading custom parts…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && (
        <div className="custom-part-grid">
          {visible.map((part) => (
            <article className="current-custom-part" key={part.customPartId}>
              <div className="current-custom-part-heading"><strong>{part.partNumber}</strong><span>Order #{part.orderNumber}</span></div>
              <p>{part.description}</p>
              <dl><div><dt>Material</dt><dd>{part.material}</dd></div><div><dt>Qty</dt><dd>{part.qtyNeeded}</dd></div><div><dt>Customer</dt><dd>{part.customerName}</dd></div><div><dt>Color</dt><dd>{part.color}</dd></div></dl>
              {part.mappedOrderLineId && <p className="custom-part-mapping">Linked to an order line</p>}
              {part.files.length ? (
                <ul className="direct-custom-files">
                  {part.files.map((file) => <li key={file.id}><CustomPartFilePreview file={file} /></li>)}
                </ul>
              ) : <p className="custom-part-no-files">No drawing files found.</p>}
              <a className="drive-folder-link desktop-drive-link" href={part.folderUrl} target="_blank" rel="noreferrer">Open Google Drive folder</a>
              {canManage && <button className="custom-part-edit-button" type="button" onClick={() => setEditor(part)}>Edit part</button>}
            </article>
          ))}
          {!visible.length && <p>No current custom parts match these filters.</p>}
        </div>
      )}
    </section>
  );
}
