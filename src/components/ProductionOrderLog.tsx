"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CustomPartFilePreview } from "@/components/CustomPartFilePreview";
import { PanelLineDocuments } from "@/components/PanelLineDocuments";

import type {
  ShopFloorOrder,
  ShopFloorOrderDetail,
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

function CustomFileGroup({ group, compact = false }: { group: ShopFloorOrderFileGroup; compact?: boolean }) {
  return (
    <div className={`custom-file-group${compact ? " mapped-custom-file-group" : ""}`}>
      <div className="custom-file-heading">
        <div><strong>{group.partNumber}</strong><span>{group.description}</span></div>
        <a href={group.folderUrl} target="_blank" rel="noreferrer">Drive</a>
      </div>
      {group.files.length ? <ul>{group.files.map((file) => (
        <li key={file.id}><CustomPartFilePreview file={file} /></li>
      ))}</ul> : <p>No drawing files in this folder.</p>}
    </div>
  );
}

function FloorOrderCard({
  order,
  today,
  group,
  canCorrectCompletion,
}: {
  order: ShopFloorOrder;
  today: string;
  group: OrderGroupKey;
  canCorrectCompletion: boolean;
}) {
  const [detail, setDetail] = useState<ShopFloorOrderDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingLine, setSavingLine] = useState("");
  const [expandedLine, setExpandedLine] = useState("");

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
            <section className="floor-order-items" aria-label={`Order ${order.order} database line items`}>
              <h4>Order Line Items</h4>
              {!order.isReleased && (
                <p className="order-detail-message">Items can be completed after engineering releases the order.</p>
              )}
              {detail.lines.length ? detail.lines.map((line) => {
                const mappedParts = detail.files.filter((file) => file.mappedOrderLineId === line.rowId);
                const panelDocuments = detail.panelDocuments.filter((document) => document.orderLineId === line.rowId);
                const hasPanelDocuments = panelDocuments.length > 0;
                const hasLineDetail = mappedParts.length > 0 || hasPanelDocuments;
                const lineIsExpanded = expandedLine === line.rowId;
                return (
                  <div className={`floor-order-line${line.completed ? " complete" : ""}`} key={line.rowId}>
                    <label className="floor-order-completion">
                      <input
                        type="checkbox"
                        checked={line.completed}
                        disabled={!order.isReleased || (line.completed && !canCorrectCompletion) || Boolean(savingLine)}
                        onChange={(event) => void setLineComplete(line.rowId, event.target.checked)}
                      />
                      <span className="sr-only">Mark {line.partNumber} complete</span>
                    </label>
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
                      {hasPanelDocuments && <span className="panel-document-count">{panelDocuments.length * 2} approved panel documents {lineIsExpanded ? "▲" : "▼"}</span>}
                    </button>
                    <span className="floor-order-line-state">
                      {savingLine === line.rowId ? "Saving…" : line.completed ? canCorrectCompletion ? "Complete · uncheck to correct" : "Complete" : "Use checkbox to mark complete"}
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

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/shop-floor-orders", { cache: "no-store" });
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
          onClick={() => void loadOrders()}
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
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
