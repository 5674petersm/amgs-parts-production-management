"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CustomPartFilePreview } from "@/components/CustomPartFilePreview";
import { PanelLineDocuments } from "@/components/PanelLineDocuments";
import { CUSTOM_PART_PROCESS_LABELS, type CustomPartProcess } from "@/constants/custom-part-processes";

import type {
  ShopFloorOrder,
  ShopFloorOrderDetail,
  ShopFloorOrderDrawing,
  ShopFloorOrderFileGroup,
  ShopFloorOrdersResult,
} from "@/types/shop-floor-order";

type OrderGroupKey = "thisWeek" | "nextTwoWeeks" | "rest";

const GROUPS: { key: OrderGroupKey; title: string }[] = [
  { key: "thisWeek", title: "This Week" },
  { key: "nextTwoWeeks", title: "Next Two Weeks" },
  { key: "rest", title: "Rest" },
];

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

function endOfWeek(today: string): string {
  const [year, month, day] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDays(today, weekday === 0 ? 0 : 7 - weekday);
}

function orderGroup(order: ShopFloorOrder, today: string): OrderGroupKey {
  if (!order.dueDate) {
    return "rest";
  }

  const thisWeekEnd = endOfWeek(today);
  if (order.dueDate <= thisWeekEnd) {
    return "thisWeek";
  }
  if (order.dueDate <= addDays(thisWeekEnd, 14)) {
    return "nextTwoWeeks";
  }
  return "rest";
}

function formatDueDate(date: string): string {
  if (!date) {
    return "No due date";
  }
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function formatProcessTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function sortOrders(a: ShopFloorOrder, b: ShopFloorOrder): number {
  if (a.isFullyStandard !== b.isFullyStandard) {
    return a.isFullyStandard ? -1 : 1;
  }
  if (!a.dueDate !== !b.dueDate) {
    return a.dueDate ? -1 : 1;
  }
  return a.dueDate.localeCompare(b.dueDate) ||
    a.order.localeCompare(b.order, undefined, { numeric: true });
}

function orderTone(order: ShopFloorOrder, today: string, group: OrderGroupKey) {
  if (order.dueDate && order.dueDate < today) {
    return "past-due";
  }
  return group === "thisWeek" ? "this-week" : group === "nextTwoWeeks" ? "next-weeks" : "rest";
}

function isCustomWmPanel(line: { partNumber: string; description: string }) {
  return `${line.partNumber} ${line.description}`.toLowerCase().includes("custom wm panel");
}

function CustomFileGroup({ group, compact = false }: { group: ShopFloorOrderFileGroup; compact?: boolean }) {
  return (
    <div className={`custom-file-group${compact ? " mapped-custom-file-group" : ""}`}>
      <div className="custom-file-heading">
        <div>
          <div className="custom-file-title">
            <strong>{group.partNumber}</strong>
            {group.completedAt && <span className="custom-part-complete-tag">Complete</span>}
          </div>
          <span>{group.description}</span>
        </div>
        <a href={group.folderUrl} target="_blank" rel="noreferrer">Drive</a>
      </div>
      {group.files.length ? <ul>{group.files.map((file) => (
        <li key={file.id}><CustomPartFilePreview file={file} /></li>
      ))}</ul> : <p>No drawing files in this folder.</p>}
    </div>
  );
}

function OrderDrawingsDialog({
  orderNumber,
  drawings,
  onClose,
  onRefresh,
}: {
  orderNumber: string;
  drawings: ShopFloorOrderDrawing[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [shareNewDrawings, setShareNewDrawings] = useState(false);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function uploadDrawings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const files = fileInputRef.current?.files;
    if (!files?.length) return;
    setSaving("upload"); setError(""); setMessage(`Uploading ${files.length} drawing${files.length === 1 ? "" : "s"}…`);
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("drawings", file));
      formData.set("shareWithCustomer", String(shareNewDrawings));
      const response = await fetch(`/api/shop-floor-orders/${encodeURIComponent(orderNumber)}/drawings`, { method: "POST", body: formData });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to add the order drawings.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMessage("Order drawings added.");
      await onRefresh();
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Unable to add the order drawings."); }
    finally { setSaving(""); }
  }

  async function updateSharing(drawing: ShopFloorOrderDrawing, checked: boolean) {
    setSaving(`share:${drawing.id}`); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/shop-floor-orders/${encodeURIComponent(orderNumber)}/drawings/${drawing.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shareWithCustomer: checked }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to update customer sharing.");
      setMessage(checked ? "Drawing will be shared with the customer." : "Drawing is now internal only.");
      await onRefresh();
    } catch (sharingError) { setError(sharingError instanceof Error ? sharingError.message : "Unable to update customer sharing."); }
    finally { setSaving(""); }
  }

  async function removeDrawing(drawing: ShopFloorOrderDrawing) {
    if (!window.confirm(`Delete ${drawing.originalName}? This cannot be undone.`)) return;
    setSaving(`delete:${drawing.id}`); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/shop-floor-orders/${encodeURIComponent(orderNumber)}/drawings/${drawing.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to delete the order drawing.");
      setMessage("Order drawing deleted.");
      await onRefresh();
    } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "Unable to delete the order drawing."); }
    finally { setSaving(""); }
  }

  return <div className="order-drawings-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="order-drawings-dialog" role="dialog" aria-modal="true" aria-labelledby={`order-drawings-${orderNumber}`}>
      <header><div><h3 id={`order-drawings-${orderNumber}`}>Order drawings</h3><span>Order #{orderNumber} · drawings associated with the entire order</span></div><button type="button" aria-label="Close order drawings" onClick={onClose}>×</button></header>
      <div className="order-drawings-dialog-body">
        <form className="order-drawings-upload" onSubmit={(event) => void uploadDrawings(event)}>
          <label><span>Drawing files</span><input ref={fileInputRef} type="file" multiple required accept=".pdf,.dxf,.dwg,.step,.stp,.iges,.igs,.png,.jpg,.jpeg" /></label>
          <label className="order-drawing-share"><input type="checkbox" checked={shareNewDrawings} onChange={(event) => setShareNewDrawings(event.target.checked)} /><span>Share with customer</span></label>
          <button className="primary-button" type="submit" disabled={Boolean(saving)}>{saving === "upload" ? "Uploading…" : "Add drawings"}</button>
        </form>
        <p className={error ? "order-detail-error" : "order-detail-message"} role={error ? "alert" : undefined}>{error || message || "PDF, DXF, DWG, STEP, IGES, PNG, or JPG · 25 MB maximum per file"}</p>
        <div className="order-drawings-list">
          {drawings.length ? drawings.map((drawing) => <article className="order-drawing-item" key={drawing.id}>
            <div><strong>{drawing.originalName}</strong><small>{(drawing.size / 1024 / 1024).toFixed(2)} MB · Added by {drawing.uploadedBy} · {formatDueDate(drawing.createdAt.slice(0, 10))}</small></div>
            <label className="order-drawing-share"><input type="checkbox" checked={drawing.shareWithCustomer} disabled={Boolean(saving)} onChange={(event) => void updateSharing(drawing, event.target.checked)} /><span>Share with customer</span></label>
            <a className="secondary-button" href={`/api/shop-floor-orders/${encodeURIComponent(orderNumber)}/drawings/${drawing.id}/file`} target="_blank" rel="noreferrer">Open</a>
            <button className="danger-button" type="button" disabled={Boolean(saving)} onClick={() => void removeDrawing(drawing)}>{saving === `delete:${drawing.id}` ? "Deleting…" : "Delete"}</button>
          </article>) : <p className="order-detail-message">No drawings are attached to this order yet.</p>}
        </div>
      </div>
      <footer><button className="secondary-button" type="button" onClick={onClose}>Close</button></footer>
    </section>
  </div>;
}

function FloorOrderCard({
  order,
  today,
  group,
  canCorrectCompletion,
  refreshToken,
}: {
  order: ShopFloorOrder;
  today: string;
  group: OrderGroupKey;
  canCorrectCompletion: boolean;
  refreshToken: number;
}) {
  const [detail, setDetail] = useState<ShopFloorOrderDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingLine, setSavingLine] = useState("");
  const [expandedLine, setExpandedLine] = useState("");
  const [processPanelLineId, setProcessPanelLineId] = useState("");
  const [orderDrawingsOpen, setOrderDrawingsOpen] = useState(false);
  const previousRefreshToken = useRef(refreshToken);

  const loadDetail = useCallback(async () => {
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/shop-floor-orders/${encodeURIComponent(order.order)}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as ShopFloorOrderDetail & { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Unable to load order details.");
      }
      setDetail(result);
      setDetailError("");
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Unable to load order details.");
    } finally {
      setDetailLoading(false);
    }
  }, [order.order]);

  useEffect(() => {
    if (previousRefreshToken.current === refreshToken) return;
    previousRefreshToken.current = refreshToken;
    if (detail) void loadDetail();
  }, [detail, loadDetail, refreshToken]);

  useEffect(() => {
    if (!processPanelLineId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProcessPanelLineId("");
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [processPanelLineId]);

  async function setLineComplete(lineId: string, checked: boolean) {
    setSavingLine(lineId);
    setDetailError("");
    try {
      const response = await fetch(`/api/shop-floor-orders/${encodeURIComponent(order.order)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineId, checked }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Unable to mark this item complete.");
      }
      setDetail((current) => current ? {
        ...current,
        lines: current.lines.map((line) => line.rowId === lineId
          ? { ...line, completed: checked, completedDate: checked ? today : "" }
          : line),
      } : current);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Unable to mark this item complete.");
    } finally {
      setSavingLine("");
    }
  }

  async function setLineProcess(lineId: string, process: "weld" | "mesh", checked: boolean) {
    setSavingLine(`${lineId}:${process}`); setDetailError("");
    try {
      const response = await fetch(`/api/shop-floor-orders/${encodeURIComponent(order.order)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lineId, process, checked }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to update this process.");
      await loadDetail();
    } catch (error) { setDetailError(error instanceof Error ? error.message : "Unable to update this process."); }
    finally { setSavingLine(""); }
  }

  async function setCustomPartProcess(customPartId: number, process: CustomPartProcess, checked: boolean) {
    setSavingLine(`${customPartId}:${process}`); setDetailError("");
    try {
      const response = await fetch(`/api/custom-parts/${customPartId}/processes`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ process, checked }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to update this custom part process.");
      await loadDetail();
    } catch (error) { setDetailError(error instanceof Error ? error.message : "Unable to update this custom part process."); }
    finally { setSavingLine(""); }
  }

  async function completeMappedPart(customPartId: number) {
    setSavingLine(`${customPartId}:complete`); setDetailError("");
    try {
      const response = await fetch(`/api/custom-parts/${customPartId}/complete`, { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to complete this custom part.");
      await loadDetail();
    } catch (error) { setDetailError(error instanceof Error ? error.message : "Unable to complete this custom part."); }
    finally { setSavingLine(""); }
  }

  async function completeAllMappedParts(lineId: string, parts: ShopFloorOrderFileGroup[]) {
    if (!window.confirm(`Complete every outstanding process for all ${parts.length} attributed parts on this line?`)) return;
    setSavingLine(`${lineId}:all`); setDetailError("");
    try {
      for (const part of parts) {
        if (part.completedAt) continue;
        if (part.requiredProcesses.length) {
          for (const process of part.requiredProcesses) {
            if (part.processProgress[process]) continue;
            const response = await fetch(`/api/custom-parts/${part.customPartId}/processes`, {
              method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ process, checked: true }),
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error || `Unable to complete ${part.partNumber}.`);
          }
        } else {
          const response = await fetch(`/api/custom-parts/${part.customPartId}/complete`, { method: "POST" });
          const result = await response.json() as { error?: string };
          if (!response.ok) throw new Error(result.error || `Unable to complete ${part.partNumber}.`);
        }
      }
      await loadDetail();
    } catch (error) { setDetailError(error instanceof Error ? error.message : "Unable to complete all attributed parts."); }
    finally { setSavingLine(""); }
  }

  function mappedPartProcessControls(part: ShopFloorOrderFileGroup) {
    return part.requiredProcesses.length ? part.requiredProcesses.map((process) => { const completedAt = part.processProgress[process] || part.completedAt; return (
      <label key={process}>
        <input
          type="checkbox"
          checked={Boolean(part.processProgress[process]) || Boolean(part.completedAt)}
          disabled={!order.isReleased || Boolean(part.completedAt) || Boolean(savingLine)}
          onChange={(event) => void setCustomPartProcess(part.customPartId, process, event.target.checked)}
        />
        <span>{CUSTOM_PART_PROCESS_LABELS[process]}{completedAt && <small className="process-completed-at">{formatProcessTimestamp(completedAt)}</small>}</span>
      </label>
    ); }) : (
      <label>
        <input
          type="checkbox"
          checked={Boolean(part.completedAt)}
          disabled={!order.isReleased || Boolean(part.completedAt) || Boolean(savingLine)}
          onChange={(event) => event.target.checked && void completeMappedPart(part.customPartId)}
        />
        <span>Complete{part.completedAt && <small className="process-completed-at">{formatProcessTimestamp(part.completedAt)}</small>}</span>
      </label>
    );
  }

  const processPanelLine = detail?.lines.find((line) => line.rowId === processPanelLineId);
  const processPanelParts = detail?.files.filter((file) => file.mappedOrderLineIds.includes(processPanelLineId)) || [];

  return (
    <details
      className={`floor-order-card ${orderTone(order, today, group)}${order.isFullyStandard ? " fully-standard" : ""}`}
      onToggle={(event) => {
        if (event.currentTarget.open && !detail && !detailLoading) {
          void loadDetail();
        }
      }}
    >
      <summary>
        <strong className="floor-order-number">#{order.order}</strong>
        <span className="floor-order-customer">{order.customer}</span>
        <strong className="floor-order-summary-due">{formatDueDate(order.dueDate)}</strong>
        <div className="floor-order-badges">
          {order.isFullyStandard && (
            <span className="standard-badge">STANDARD · PRIORITY</span>
          )}
          {order.isCustomerApproved && (
            <span
              className="approval-badge"
              title={order.customerApprovedDate ? `Approved ${formatDueDate(order.customerApprovedDate)}` : "Approved by customer"}
            >
              Customer Approved
            </span>
          )}
          <span className={order.isReleased ? "release-badge released" : "release-badge pending"}>
            {order.isReleased ? "Released" : "Engineering"}
          </span>
        </div>
      </summary>
      <div className="floor-order-expanded">
        <div className="floor-order-notes">
          <strong>Notes</strong>
          <p>{order.notes || "No production notes."}</p>
        </div>

        {detailLoading && <p className="order-detail-message">Loading items and files…</p>}
        {detailError && <p className="order-detail-error" role="alert">{detailError}</p>}
        {detail && (
          <>
            <div className="order-drawings-bar">
              <div>
                <strong>Order drawings</strong>
                <span>{detail.orderDrawings.length ? `${detail.orderDrawings.length} file${detail.orderDrawings.length === 1 ? "" : "s"} · ${detail.orderDrawings.filter((drawing) => drawing.shareWithCustomer).length} shared with customer` : "No drawings attached to this order"}</span>
              </div>
              <button className="secondary-button" type="button" onClick={() => setOrderDrawingsOpen(true)}>{detail.orderDrawings.length ? "Manage drawings" : "Add drawings"}</button>
            </div>
            <section className="floor-order-items" aria-label={`Order ${order.order} database line items`}>
              <h4>Order Line Items</h4>
              {!order.isReleased && (
                <p className="order-detail-message">Items can be completed after engineering releases the order.</p>
              )}
              {detail.lines.length ? detail.lines.map((line) => {
                const mappedParts = detail.files.filter((file) => file.mappedOrderLineIds.includes(line.rowId));
                const panelDocuments = detail.panelDocuments.filter((document) => document.orderLineId === line.rowId);
                const hasPanelDocuments = panelDocuments.length > 0;
                const hasLineDetail = mappedParts.length > 0 || hasPanelDocuments;
                const lineIsExpanded = expandedLine === line.rowId;
                const panelProcesses = isCustomWmPanel(line) ? (["weld", "mesh"] as const) : [];
                const hasAttributedProcesses = panelProcesses.length > 0 || mappedParts.length > 0;
                return (
                  <div className={`floor-order-line${line.completed ? " complete" : ""}`} key={line.rowId}>
                    {!hasAttributedProcesses && <label className="floor-order-completion">
                      <input
                        type="checkbox"
                        checked={line.completed}
                        disabled={!order.isReleased || (line.completed && !canCorrectCompletion) || Boolean(savingLine)}
                        onChange={(event) => void setLineComplete(line.rowId, event.target.checked)}
                      />
                      <span className="sr-only">Mark {line.partNumber} complete</span>
                    </label>}
                    {hasAttributedProcesses && <div className="floor-line-processes">
                      {panelProcesses.length > 0 && <div className="floor-line-panel-processes">{panelProcesses.map((process) => { const step = process === "weld" ? "welded" : "meshed"; const completedAt = line.steps[step]?.date; return <label key={process}><input type="checkbox" checked={Boolean(line.steps[step]?.checked)} disabled={!order.isReleased || Boolean(savingLine)} onChange={(event) => void setLineProcess(line.rowId, process, event.target.checked)} /><span>{CUSTOM_PART_PROCESS_LABELS[process]}{completedAt && <small className="process-completed-at">{formatProcessTimestamp(completedAt)}</small>}</span></label>; })}</div>}
                      {mappedParts.length > 1 ? <div className="floor-line-process-summary">
                        <button type="button" onClick={() => setProcessPanelLineId(line.rowId)}>Check off items</button>
                        <span>{mappedParts.filter((part) => part.completedAt).length} of {mappedParts.length} complete</span>
                      </div> : mappedParts.map((part) => <div className="floor-line-single-part-process" key={part.customPartId}>
                        <strong><span>{part.partNumber}</span><small>{part.description || "Custom part"}</small></strong>
                        {mappedPartProcessControls(part)}
                      </div>)}
                    </div>}
                    <button
                      className={`floor-order-line-info${hasLineDetail ? " has-mapped-parts" : ""}`}
                      type="button"
                      onClick={() => hasLineDetail && setExpandedLine(lineIsExpanded ? "" : line.rowId)}
                      aria-expanded={hasLineDetail ? lineIsExpanded : undefined}
                    >
                      <span className="floor-order-line-text">
                        <strong>{line.partNumber}</strong>
                        <span>{line.description || `Line ${line.lineNumber ?? ""}`}</span>
                      </span>
                      <span className="floor-order-line-qty">Qty {line.orderedQty}</span>
                      {mappedParts.length > 0 && <span className="mapped-part-count">{mappedParts.length} custom part{mappedParts.length === 1 ? "" : "s"} {lineIsExpanded ? "▲" : "▼"}</span>}
                      {hasPanelDocuments && <span className="panel-document-count">{panelDocuments.reduce((count, document) => count + 1 + (document.cutlistMode === "none" ? 0 : 1), 0)} approved panel documents {lineIsExpanded ? "▲" : "▼"}</span>}
                    </button>
                    <span className="floor-order-line-state">
                      {savingLine.startsWith(`${line.rowId}:`) || savingLine === line.rowId ? "Saving…" : line.completed ? canCorrectCompletion ? "Complete · uncheck to correct" : "Complete" : hasAttributedProcesses ? "Complete required processes" : "Use checkbox to mark complete"}
                    </span>
                    {line.notes && <span className="floor-order-line-notes">{line.notes}</span>}
                    {lineIsExpanded && <div className="mapped-custom-parts">
                      {hasPanelDocuments && <PanelLineDocuments documents={panelDocuments} />}
                      {mappedParts.map((file) => <CustomFileGroup group={file} compact key={file.customPartId} />)}
                    </div>}
                  </div>
                );
              }) : <p className="order-detail-message">No line items found.</p>}
            </section>

            <section className="floor-order-files" aria-label={`Order ${order.order} supporting custom parts from Google Drive`}>
              <h4>Supporting Custom Parts</h4>
              <p className="supporting-parts-help">Fine-detail parts and drawings from Google Drive, listed separately from the order lines above.</p>
              {detail.filesError && <p className="order-detail-error">{detail.filesError}</p>}
              {detail.files.length ? detail.files.map((group) => (
                <CustomFileGroup group={group} key={group.customPartId} />
              )) : !detail.filesError && (
                <p className="order-detail-message">No custom part files are associated with this order.</p>
              )}
            </section>
          </>
        )}
      </div>
      {processPanelLine && <div
        className="floor-process-dialog-backdrop"
        onMouseDown={(event) => event.target === event.currentTarget && setProcessPanelLineId("")}
      >
        <section className="floor-process-dialog" role="dialog" aria-modal="true" aria-labelledby={`floor-process-title-${processPanelLine.rowId}`}>
          <header>
            <div>
              <h4 id={`floor-process-title-${processPanelLine.rowId}`}>Check off items</h4>
              <span>Order #{order.order} · {processPanelLine.partNumber} · {processPanelParts.length} attributed parts</span>
            </div>
            <button type="button" aria-label="Close process checklist" onClick={() => setProcessPanelLineId("")}>×</button>
          </header>
          <div className="floor-process-dialog-body">
            <div className="floor-process-dialog-toolbar">
              <span>{processPanelParts.filter((part) => part.completedAt).length} of {processPanelParts.length} complete</span>
              <button
                className="primary-button"
                type="button"
                disabled={!order.isReleased || Boolean(savingLine) || processPanelParts.every((part) => part.completedAt)}
                onClick={() => void completeAllMappedParts(processPanelLine.rowId, processPanelParts)}
              >{savingLine === `${processPanelLine.rowId}:all` ? "Checking off…" : "Check off all"}</button>
            </div>
            {!order.isReleased && <p className="order-detail-message">Processes can be completed after engineering releases the order.</p>}
            {processPanelParts.map((part) => <article className="floor-process-dialog-item" key={part.customPartId}>
              <div>
                <strong>{part.partNumber} <span>— {part.description || "Custom part"}</span></strong>
                <small>{part.completedAt ? `Completed ${formatDueDate(part.completedAt.slice(0, 10))}` : "In progress"}</small>
              </div>
              <div className="floor-process-dialog-controls">{mappedPartProcessControls(part)}</div>
            </article>)}
          </div>
          <footer><button className="secondary-button" type="button" onClick={() => setProcessPanelLineId("")}>Close</button></footer>
        </section>
      </div>}
      {detail && orderDrawingsOpen && <OrderDrawingsDialog
        orderNumber={order.order}
        drawings={detail.orderDrawings}
        onClose={() => setOrderDrawingsOpen(false)}
        onRefresh={loadDetail}
      />}
    </details>
  );
}

export function ProductionOrderLog({
  canCorrectCompletion = false,
}: {
  canCorrectCompletion?: boolean;
}) {
  const [data, setData] = useState<ShopFloorOrdersResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  const loadOrders = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/shop-floor-orders${forceRefresh ? "?refresh=1" : ""}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as ShopFloorOrdersResult & { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Unable to load orders.");
      }
      setData(result);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshPageData = useCallback(async () => {
    setRefreshToken((value) => value + 1);
    await loadOrders(true);
  }, [loadOrders]);

  useEffect(() => {
    void loadOrders();
    const refreshId = window.setInterval(() => void loadOrders(), 60_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void loadOrders();
      }
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(refreshId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadOrders]);

  const groupedOrders = useMemo(() => {
    const groups: Record<OrderGroupKey, ShopFloorOrder[]> = {
      thisWeek: [],
      nextTwoWeeks: [],
      rest: [],
    };
    if (!data) {
      return groups;
    }
    const query = search.trim().toLowerCase();
    data.orders
      .filter((order) => !query
        || order.order.toLowerCase().includes(query)
        || order.customer.toLowerCase().includes(query)
        || order.notes.toLowerCase().includes(query))
      .forEach((order) => groups[orderGroup(order, data.today)].push(order));
    GROUPS.forEach(({ key }) => groups[key].sort(sortOrders));
    return groups;
  }, [data, search]);

  return (
    <section className="production-order-log" aria-labelledby="production-order-log-title">
      <div className="production-order-log-header">
        <div>
          <h2 id="production-order-log-title">Production Log</h2>
          <p>Tap an order for notes, line items, and supporting files.</p>
        </div>
        <button
          type="button"
          className="order-refresh-button"
          onClick={() => void refreshPageData()}
          disabled={loading}
          aria-label="Refresh production orders and custom parts"
        >
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      <label className="order-log-search">
        <span className="sr-only">Search production orders</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search order, customer, or notes"
        />
      </label>

      {error && <p className="order-log-error" role="alert">{error}</p>}
      {!data && loading && <p className="order-log-message">Loading production orders…</p>}

      {data && GROUPS.map(({ key, title }) => (
        <section className={`order-group order-group-${key}`} key={key}>
          <h3>
            <span>{title}</span>
            <span className="order-group-count">{groupedOrders[key].length}</span>
          </h3>
          {groupedOrders[key].length ? (
            <div className="order-card-list">
              {groupedOrders[key].map((order) => (
                <FloorOrderCard
                  key={order.order}
                  order={order}
                  today={data.today}
                  group={key}
                  canCorrectCompletion={canCorrectCompletion}
                  refreshToken={refreshToken}
                />
              ))}
            </div>
          ) : (
            <p className="empty-order-group">No orders in this section.</p>
          )}
        </section>
      ))}
    </section>
  );
}
