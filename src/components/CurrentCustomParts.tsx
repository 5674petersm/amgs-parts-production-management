"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CustomPartForm } from "@/components/CustomPartForm";
import { CustomPartFilePreview } from "@/components/CustomPartFilePreview";
import { CopyCustomPartsOrder } from "@/components/CopyCustomPartsOrder";
import { PanelOrders } from "@/components/PanelOrders";
import { PartsLibrary } from "@/components/PartsLibrary";
import type { CurrentCustomPart } from "@/types/custom-part";

type SortMode = "order" | "material";
type ViewMode = "cards" | "list";
type CustomPartGroup = {
  key: string;
  parts: CurrentCustomPart[];
  totalQty: number;
  orderQuantities: { orderNumber: string; qty: number }[];
};

function normalizeGroupValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function customPartGroupKey(part: CurrentCustomPart): string {
  const drawingNames = part.files
    .map((file) => normalizeGroupValue(file.name))
    .sort()
    .join("|");
  return [
    normalizeGroupValue(part.description),
    normalizeGroupValue(part.material),
    normalizeGroupValue(part.color),
    drawingNames,
  ].join("::");
}

function groupCustomParts(parts: CurrentCustomPart[]): CustomPartGroup[] {
  const groups = new Map<string, CurrentCustomPart[]>();
  parts.forEach((part) => {
    const key = part.groupId ? `approved:${part.groupId}` : `part:${part.customPartId}`;
    groups.set(key, [...(groups.get(key) || []), part]);
  });
  return [...groups.entries()].map(([key, groupedParts]) => {
    const quantities = new Map<string, number>();
    groupedParts.forEach((part) => quantities.set(
      part.orderNumber,
      (quantities.get(part.orderNumber) || 0) + part.qtyNeeded,
    ));
    return {
      key,
      parts: groupedParts,
      totalQty: groupedParts.reduce((total, part) => total + part.qtyNeeded, 0),
      orderQuantities: [...quantities.entries()].map(([orderNumber, qty]) => ({ orderNumber, qty })),
    };
  });
}

export function CurrentCustomParts({ canManage = false, signedIn = false, initialAddOrder = "", initialAddLine = "", initialAddCustomer = "" }: { canManage?: boolean; signedIn?: boolean; initialAddOrder?: string; initialAddLine?: string; initialAddCustomer?: string }) {
  const [parts, setParts] = useState<CurrentCustomPart[]>([]);
  const [completedParts, setCompletedParts] = useState<CurrentCustomPart[]>([]);
  const [completedLoaded, setCompletedLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [material, setMaterial] = useState("");
  const [showCutParts, setShowCutParts] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("order");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<"add" | CurrentCustomPart | null>(initialAddOrder ? "add" : null);
  const [subtab, setSubtab] = useState<"parts" | "completed" | "library" | "panels">("parts");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [completingPartId, setCompletingPartId] = useState<number | null>(null);
  const [deletingPartId, setDeletingPartId] = useState<number | null>(null);
  const [completionMessage, setCompletionMessage] = useState("");
  const [expandedFilesPartId, setExpandedFilesPartId] = useState<number | null>(null);
  const [copyingOrder, setCopyingOrder] = useState(false);
  const [manualGrouping, setManualGrouping] = useState(false);
  const [selectedGroupPartIds, setSelectedGroupPartIds] = useState<number[]>([]);
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupingAvailable, setGroupingAvailable] = useState<boolean | null>(null);

  const loadParts = useCallback((background = false) => {
    if (!background) setLoading(true);
    setError("");
    fetch("/api/custom-parts/current", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { parts?: CurrentCustomPart[]; groupingAvailable?: boolean; error?: string };
        if (!response.ok) throw new Error(result.error || "Unable to load custom parts.");
        setParts(result.parts ?? []);
        setGroupingAvailable(result.groupingAvailable !== false);
      })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Unable to load custom parts."))
      .finally(() => {
        if (!background) setLoading(false);
      });
  }, []);

  const loadCompletedParts = useCallback((background = false) => {
    if (!background) setLoading(true);
    setError("");
    fetch("/api/custom-parts/completed", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { parts?: CurrentCustomPart[]; groupingAvailable?: boolean; error?: string };
        if (!response.ok) throw new Error(result.error || "Unable to load completed custom parts.");
        setCompletedParts(result.parts ?? []);
        setGroupingAvailable(result.groupingAvailable !== false);
        setCompletedLoaded(true);
      })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Unable to load completed custom parts."))
      .finally(() => {
        if (!background) setLoading(false);
      });
  }, []);

  useEffect(() => loadParts(), [loadParts]);
  useEffect(() => {
    if (subtab === "completed" && !completedLoaded) loadCompletedParts();
  }, [completedLoaded, loadCompletedParts, subtab]);
  useEffect(() => {
    if (subtab !== "parts" && subtab !== "completed") return;
    const refreshCurrentView = () => {
      if (subtab === "completed") loadCompletedParts(true);
      else loadParts(true);
    };
    const refreshId = window.setInterval(refreshCurrentView, 60_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshCurrentView();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(refreshId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadCompletedParts, loadParts, subtab]);
  useEffect(() => {
    const savedView = window.localStorage.getItem("amgs-custom-parts-view");
    if (savedView === "cards" || savedView === "list") setViewMode(savedView);
  }, []);

  function chooseView(nextView: ViewMode) {
    setViewMode(nextView);
    window.localStorage.setItem("amgs-custom-parts-view", nextView);
  }

  async function completePart(part: CurrentCustomPart) {
    const lineText = part.mappedOrderLineIds.length
      ? ` and mark ${part.mappedOrderLineIds.length} associated dashboard line${part.mappedOrderLineIds.length === 1 ? "" : "s"} complete`
      : "";
    if (!window.confirm(`Complete ${part.partNumber}? This will move its Google Drive folder into Completed${lineText}.`)) return;
    setCompletingPartId(part.customPartId);
    setCompletionMessage("");
    setError("");
    try {
      const response = await fetch(`/api/custom-parts/${encodeURIComponent(String(part.customPartId))}/complete`, { method: "POST" });
      const result = await response.json() as { error?: string; completedLineCount?: number };
      if (!response.ok) throw new Error(result.error || "Unable to complete this custom part.");
      setParts((current) => current.filter((item) => item.customPartId !== part.customPartId));
      setCompletedLoaded(false);
      const lineUpdate = result.completedLineCount
        ? ` ${result.completedLineCount} dashboard line${result.completedLineCount === 1 ? "" : "s"} updated.`
        : "";
      setCompletionMessage(`${part.partNumber} completed and moved to Google Drive Completed.${lineUpdate}`);
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : "Unable to complete this custom part.");
    } finally {
      setCompletingPartId(null);
    }
  }

  async function deletePart(part: CurrentCustomPart) {
    if (!window.confirm(
      `Delete ${part.partNumber}? This removes the part and its order-line links, and moves its Google Drive folder to trash.`,
    )) return;
    setDeletingPartId(part.customPartId);
    setCompletionMessage("");
    setError("");
    try {
      const response = await fetch(
        `/api/custom-parts/${encodeURIComponent(String(part.customPartId))}`,
        { method: "DELETE" },
      );
      const result = await response.json() as { error?: string; partNumber?: string };
      if (!response.ok) throw new Error(result.error || "Unable to delete this custom part.");
      setParts((current) => current.filter((item) => item.customPartId !== part.customPartId));
      setSelectedGroupPartIds((current) => current.filter((id) => id !== part.customPartId));
      setExpandedFilesPartId((current) => current === part.customPartId ? null : current);
      setCompletionMessage(`${result.partNumber || part.partNumber} deleted. Its Google Drive folder was moved to trash.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete this custom part.");
    } finally {
      setDeletingPartId(null);
    }
  }

  const completedView = subtab === "completed";
  const activeParts = completedView ? completedParts : parts;
  const cutPartCount = completedView ? 0 : activeParts.filter((part) => part.cut).length;
  const displayableParts = useMemo(() => activeParts.filter((part) =>
    completedView || showCutParts || !part.cut), [activeParts, completedView, showCutParts]);
  const materials = useMemo(() => [...new Set(displayableParts.map((part) => part.material))]
    .sort((a, b) => a.localeCompare(b)), [displayableParts]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return displayableParts.filter((part) =>
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
  }, [displayableParts, material, search, sortMode]);
  const visibleGroups = useMemo(() => groupCustomParts(visible), [visible]);
  const suggestedGroups = useMemo(() => {
    if (!canManage) return [];
    const suggestions = new Map<string, CurrentCustomPart[]>();
    displayableParts.filter((part) => !part.groupId).forEach((part) => {
      const key = customPartGroupKey(part);
      suggestions.set(key, [...(suggestions.get(key) || []), part]);
    });
    return [...suggestions.values()].filter((group) => group.length > 1);
  }, [displayableParts, canManage]);
  const formatCompletedDate = (value: string | null) => value
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value))
    : "";

  async function saveGroup(customPartIds: number[]) {
    setSavingGroup(true);
    setError("");
    try {
      const response = await fetch("/api/custom-parts/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customPartIds }),
      });
      const result = await response.json() as { groupedCount?: number; error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to group these parts.");
      setCompletionMessage(`${result.groupedCount || customPartIds.length} parts grouped. This approved group is now visible to everyone.`);
      setSelectedGroupPartIds([]);
      setManualGrouping(false);
      if (completedView) loadCompletedParts(); else loadParts();
    } catch (groupError) {
      setError(groupError instanceof Error ? groupError.message : "Unable to group these parts.");
    } finally {
      setSavingGroup(false);
    }
  }

  async function ungroupParts(groupId: string) {
    if (!window.confirm("Ungroup these parts? They will return to separate rows for everyone.")) return;
    setSavingGroup(true);
    setError("");
    try {
      const response = await fetch("/api/custom-parts/groups", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to ungroup these parts.");
      setCompletionMessage("The approved group was removed.");
      if (completedView) loadCompletedParts(); else loadParts();
    } catch (groupError) {
      setError(groupError instanceof Error ? groupError.message : "Unable to ungroup these parts.");
    } finally {
      setSavingGroup(false);
    }
  }

  const renderPartCard = (part: CurrentCustomPart, nested = false) => (
    <article className={`current-custom-part${nested ? " grouped-custom-part-detail" : ""}`} key={part.customPartId}>
      <div className="current-custom-part-heading"><strong>{part.partNumber}</strong><span>Order #{part.orderNumber}</span>{part.cut && <span className="custom-part-cut-badge">Cut</span>}</div>
      <p>{part.description}</p>
      <dl><div><dt>Material</dt><dd>{part.material}</dd></div><div><dt>Qty</dt><dd>{part.qtyNeeded}</dd></div><div><dt>Customer</dt><dd>{part.customerName}</dd></div><div><dt>Color</dt><dd>{part.color}</dd></div></dl>
      {completedView && <p className="custom-part-completed-date">Completed {formatCompletedDate(part.completedAt)}</p>}
      {part.mappedOrderLineIds.length > 0 && <p className="custom-part-mapping">Linked to {part.mappedOrderLineIds.length} order line{part.mappedOrderLineIds.length === 1 ? "" : "s"}</p>}
      {part.files.length ? (
        <ul className="direct-custom-files">
          {part.files.map((file) => <li key={file.id}><CustomPartFilePreview file={file} /></li>)}
        </ul>
      ) : <p className="custom-part-no-files">No drawing files found.</p>}
      <a className="drive-folder-link desktop-drive-link" href={part.folderUrl} target="_blank" rel="noreferrer">Open Google Drive folder</a>
      {!completedView && <button className="custom-part-complete-button" type="button" disabled={completingPartId !== null || deletingPartId !== null} onClick={() => void completePart(part)}>{completingPartId === part.customPartId ? "Completing…" : "Mark complete"}</button>}
      {canManage && !completedView && <button className="custom-part-edit-button" type="button" onClick={() => setEditor(part)}>Edit part</button>}
      {canManage && !completedView && <button className="custom-part-delete-button" type="button" disabled={deletingPartId !== null || completingPartId !== null} onClick={() => void deletePart(part)}>{deletingPartId === part.customPartId ? "Deleting…" : "Delete part"}</button>}
    </article>
  );

  const renderCompactPart = (part: CurrentCustomPart, nested = false) => (
    <article className={`custom-part-compact-row${nested ? " grouped-custom-part-detail" : ""}`} key={part.customPartId}>
      <strong>{part.partNumber}{part.cut && <small className="custom-part-cut-badge">Cut</small>}</strong>
      <span>#{part.orderNumber}{completedView && <small>Completed {formatCompletedDate(part.completedAt)}</small>}</span>
      <span className="compact-part-description">{part.description}</span>
      <span><b>{part.material}</b><small>{part.color}</small></span>
      <span className="compact-part-qty">{part.qtyNeeded}</span>
      <span>{part.customerName}</span>
      <div className="compact-part-actions">
        <button type="button" disabled={!part.files.length} onClick={() => setExpandedFilesPartId((current) => current === part.customPartId ? null : part.customPartId)}>Files {part.files.length}</button>
        <a href={part.folderUrl} target="_blank" rel="noreferrer">Drive</a>
        {!completedView && <button className="complete" type="button" disabled={completingPartId !== null || deletingPartId !== null} onClick={() => void completePart(part)}>{completingPartId === part.customPartId ? "Saving…" : "Complete"}</button>}
        {canManage && !completedView && <button type="button" onClick={() => setEditor(part)}>Edit</button>}
        {canManage && !completedView && <button className="delete" type="button" disabled={deletingPartId !== null || completingPartId !== null} onClick={() => void deletePart(part)}>{deletingPartId === part.customPartId ? "Deleting…" : "Delete"}</button>}
      </div>
      {expandedFilesPartId === part.customPartId && (
        <ul className="compact-part-files">
          {part.files.map((file) => <li key={file.id}><CustomPartFilePreview file={file} /></li>)}
        </ul>
      )}
    </article>
  );

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
          initialOrderNumber={editPart?.orderNumber || initialAddOrder}
          initialCustomerName={editPart?.customerName || initialAddCustomer}
          initialOrderLineId={editPart ? "" : initialAddLine}
          editPart={editPart}
          onSaved={() => {
            setEditor(null);
            setCompletionMessage(`${editPart?.partNumber || "Custom part"} updated.`);
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
          <button type="button" onClick={() => setSubtab("completed")}>Completed</button>
          <button type="button" onClick={() => setSubtab("library")}>Parts Library</button>
          <button className="active" type="button" aria-current="page">Panels</button>
        </nav>
        <PanelOrders />
      </section>
    );
  }

  if (subtab === "library") {
    return (
      <section className="floor-data-page">
        <div className="floor-page-heading"><div><h1>Custom Parts</h1><p>Reusable prepared parts and drawings for future orders.</p></div></div>
        <nav className="custom-parts-subtabs" aria-label="Custom part views">
          <button type="button" onClick={() => setSubtab("parts")}>Parts</button>
          <button type="button" onClick={() => setSubtab("completed")}>Completed</button>
          <button className="active" type="button" aria-current="page">Parts Library</button>
          <button type="button" onClick={() => setSubtab("panels")}>Panels</button>
        </nav>
        <PartsLibrary signedIn={signedIn} />
      </section>
    );
  }

  return (
    <section className="floor-data-page">
      <div className="floor-page-heading">
        <div><h1>Custom Parts</h1><p>Supporting parts and generated Custom WM Panel fabrication documents.</p></div>
        <div className="custom-parts-heading-actions">
          <span>{visibleGroups.length} displayed group{visibleGroups.length === 1 ? "" : "s"} · {visible.length} {completedView ? "completed parts" : "parts"}</span>
          {!completedView && (
            <label className="custom-part-cut-toggle">
              <input type="checkbox" checked={showCutParts} onChange={(event) => setShowCutParts(event.target.checked)} />
              Show cut parts ({cutPartCount})
            </label>
          )}
          <button className="secondary-button" type="button" disabled={loading} onClick={() => completedView ? loadCompletedParts() : loadParts()}>{loading ? "Refreshing…" : "↻ Refresh"}</button>
          {canManage && <button className="secondary-button" type="button" disabled={groupingAvailable !== true} title={groupingAvailable === false ? "Database migration required before groups can be saved" : undefined} onClick={() => setManualGrouping((value) => !value)}>Group parts</button>}
          {canManage && !completedView && <button className="secondary-button" type="button" onClick={() => setCopyingOrder(true)}>Copy existing order</button>}
          {canManage && !completedView && <button className="order-refresh-button" type="button" onClick={() => setEditor("add")}>Add parts</button>}
        </div>
      </div>
      <nav className="custom-parts-subtabs" aria-label="Custom part views">
        <button className={subtab === "parts" ? "active" : ""} type="button" aria-current={subtab === "parts" ? "page" : undefined} onClick={() => setSubtab("parts")}>Parts</button>
        <button className={completedView ? "active" : ""} type="button" aria-current={completedView ? "page" : undefined} onClick={() => setSubtab("completed")}>Completed</button>
        <button type="button" onClick={() => setSubtab("library")}>Parts Library</button>
        <button type="button" onClick={() => setSubtab("panels")}>Panels</button>
      </nav>
      {copyingOrder && !completedView && (
        <CopyCustomPartsOrder
          onCancel={() => setCopyingOrder(false)}
          onCopied={(message) => {
            setCopyingOrder(false);
            setCompletionMessage(message);
            loadParts();
          }}
        />
      )}
      {canManage && groupingAvailable === false && <p className="notice">Suggested matches are shown below for review, but approving or manually saving a group requires the one-time database migration.</p>}
      {canManage && suggestedGroups.length > 0 && (
        <section className="custom-part-group-suggestions" aria-labelledby="group-suggestions-title">
          <div><h2 id="group-suggestions-title">Suggested groups</h2><p>These are possible matches only. Review the orders, quantities, descriptions, colors, and drawing names before approving.</p></div>
          {suggestedGroups.map((suggestion) => (
            <article className="custom-part-group-suggestion" key={customPartGroupKey(suggestion[0])}>
              <header>
                <div><strong>{suggestion[0].description}</strong><span>{suggestion[0].material} · {suggestion[0].color}</span></div>
                <button type="button" disabled={savingGroup || groupingAvailable !== true} title={groupingAvailable === false ? "Database migration required before this suggestion can be approved" : undefined} onClick={() => void saveGroup(suggestion.map((part) => part.customPartId))}>{groupingAvailable === false ? "Migration required" : "Approve grouping"}</button>
              </header>
              <div className="suggested-part-review-list">
                {suggestion.map((part) => (
                  <details className="suggested-part-review" key={part.customPartId}>
                    <summary>
                      <span><strong>{part.partNumber}</strong><small>Order #{part.orderNumber} · Qty {part.qtyNeeded}</small></span>
                      <span>{part.customerName}<small>{part.files.length} drawing{part.files.length === 1 ? "" : "s"} · {part.mappedOrderLineIds.length} linked line{part.mappedOrderLineIds.length === 1 ? "" : "s"}</small></span>
                      <span className="suggested-review-label">Review part and drawings</span>
                    </summary>
                    <div className="suggested-part-review-body">
                      <dl>
                        <div><dt>Description</dt><dd>{part.description}</dd></div>
                        <div><dt>Material / color</dt><dd>{part.material} · {part.color}</dd></div>
                        <div><dt>Order quantity</dt><dd>{part.qtyNeeded}</dd></div>
                        <div><dt>Order-line links</dt><dd>{part.mappedOrderLineIds.length || "None"}</dd></div>
                      </dl>
                      {part.files.length ? <ul>{part.files.map((file) => <li key={file.id}><CustomPartFilePreview file={file} /></li>)}</ul> : <p>No drawing files found.</p>}
                      <a href={part.folderUrl} target="_blank" rel="noreferrer">Open this part's Drive folder</a>
                    </div>
                  </details>
                ))}
              </div>
            </article>
          ))}
        </section>
      )}
      {canManage && manualGrouping && (
        <section className="custom-part-manual-group card" aria-labelledby="manual-group-title">
          <div className="copy-order-heading"><div><h2 id="manual-group-title">Manually group parts</h2><p>Select two or more ungrouped records that represent the same physical design.</p></div><button className="secondary-button" type="button" onClick={() => { setManualGrouping(false); setSelectedGroupPartIds([]); }}>Cancel</button></div>
          <div className="custom-part-manual-group-list">
            {displayableParts.filter((part) => !part.groupId).map((part) => (
              <label key={part.customPartId}>
                <input type="checkbox" checked={selectedGroupPartIds.includes(part.customPartId)} onChange={(event) => setSelectedGroupPartIds((current) => event.target.checked ? [...current, part.customPartId] : current.filter((id) => id !== part.customPartId))} />
                <span><strong>{part.partNumber}</strong><small>Order #{part.orderNumber} · Qty {part.qtyNeeded}</small></span>
                <span>{part.description}<small>{part.material} · {part.color}</small></span>
              </label>
            ))}
          </div>
          <button className="primary-button" type="button" disabled={savingGroup || selectedGroupPartIds.length < 2} onClick={() => void saveGroup(selectedGroupPartIds)}>Group {selectedGroupPartIds.length} selected parts</button>
        </section>
      )}
      <div className="custom-part-controls">
        <input className="floor-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, part, or customer" />
        <label><span>Material</span><select value={material} onChange={(event) => setMaterial(event.target.value)}><option value="">All materials</option>{materials.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
        <label><span>Sort by</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}><option value="order">Order #</option><option value="material">Material</option></select></label>
        <div className="custom-part-view-toggle" role="group" aria-label="Custom part display">
          <button className={viewMode === "cards" ? "active" : ""} type="button" aria-pressed={viewMode === "cards"} onClick={() => chooseView("cards")}>Cards</button>
          <button className={viewMode === "list" ? "active" : ""} type="button" aria-pressed={viewMode === "list"} onClick={() => chooseView("list")}>List</button>
        </div>
      </div>
      {loading && <p>Loading {completedView ? "completed " : ""}custom parts…</p>}
      {completionMessage && <p className="custom-part-completion-message" role="status">{completionMessage}</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && viewMode === "cards" && (
        <div className="custom-part-grid">
          {visibleGroups.map((group) => group.parts.length === 1
            ? renderPartCard(group.parts[0])
            : (
              <details className="current-custom-part grouped-custom-parts-card" key={group.key}>
                <summary>
                  <div className="current-custom-part-heading"><strong>{group.parts[0].description}</strong><span>{group.orderQuantities.length} orders</span></div>
                  <div className="grouped-part-meta"><span>{group.parts[0].material}</span><span>{group.parts[0].color}</span><strong>Total qty {group.totalQty}</strong></div>
                  <div className="grouped-order-quantities">
                    {group.orderQuantities.map((order) => <span key={order.orderNumber}>#{order.orderNumber} <b>Qty {order.qty}</b></span>)}
                  </div>
                  <span className="grouped-part-expand-label">Expand per-order details</span>
                  {canManage && group.parts[0].groupId && <button className="grouped-part-ungroup" type="button" disabled={savingGroup} onClick={(event) => { event.preventDefault(); void ungroupParts(group.parts[0].groupId!); }}>Ungroup</button>}
                </summary>
                <div className="grouped-custom-part-details">
                  {group.parts.map((part) => renderPartCard(part, true))}
                </div>
              </details>
            ))}
          {!visible.length && <p>No {completedView ? "completed" : "current"} custom parts match these filters.</p>}
        </div>
      )}
      {!loading && !error && viewMode === "list" && (
        <div className="custom-part-list">
          <div className="custom-part-list-heading" aria-hidden="true"><span>Part</span><span>Order</span><span>Description</span><span>Material / Color</span><span>Qty</span><span>Customer</span><span>Actions</span></div>
          {visibleGroups.map((group) => group.parts.length === 1
            ? renderCompactPart(group.parts[0])
            : (
              <details className="grouped-custom-parts-list" key={group.key}>
                <summary className="custom-part-compact-row">
                  <strong>{group.parts.length} matching parts</strong>
                  <span>{group.orderQuantities.length} orders<small>{group.orderQuantities.map((order) => `#${order.orderNumber}`).join(", ")}</small></span>
                  <span className="compact-part-description">{group.parts[0].description}</span>
                  <span><b>{group.parts[0].material}</b><small>{group.parts[0].color}</small></span>
                  <span className="compact-part-qty">{group.totalQty}<small>total</small></span>
                  <span>{[...new Set(group.parts.map((part) => part.customerName))].join(", ")}</span>
                  <div className="grouped-order-quantities compact-grouped-quantities">
                    {group.orderQuantities.map((order) => <span key={order.orderNumber}>#{order.orderNumber} <b>Qty {order.qty}</b></span>)}
                  </div>
                  {canManage && group.parts[0].groupId && <button className="grouped-part-ungroup" type="button" disabled={savingGroup} onClick={(event) => { event.preventDefault(); void ungroupParts(group.parts[0].groupId!); }}>Ungroup</button>}
                </summary>
                <div className="grouped-custom-part-list-details">
                  {group.parts.map((part) => renderCompactPart(part, true))}
                </div>
              </details>
            ))}
          {!visible.length && <p className="compact-list-empty">No {completedView ? "completed" : "current"} custom parts match these filters.</p>}
        </div>
      )}
    </section>
  );
}
