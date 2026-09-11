import type {
  ShopFloorOrder,
  ShopFloorOrderDetail,
  ShopFloorOrderDrawing,
  ShopFloorPanelDocument,
  ShopFloorOrdersResult,
} from "@/types/shop-floor-order";
import { plantLocalCalendarDate } from "@/lib/time";
import type { PartDemandRow } from "@/types/part-demand";

type DashboardOrder = {
  order?: string | number;
  customer?: string;
  dueDate?: string | null;
  isFullyStandard?: boolean;
  workflow?: {
    customerSignedOff?: {
      checked?: boolean;
      date?: string | null;
    };
    engineeringCompletedDate?: string | null;
    productionCompletedDate?: string | null;
    notes?: string | null;
  };
};

type DashboardOrdersResponse = {
  orders?: DashboardOrder[];
  lastSyncedAt?: string | null;
  error?: string;
};

type DashboardOrderDetailResponse = {
  lines?: Array<{
    rowId?: string | number;
    lineNumber?: number | null;
    partNumber?: string;
    itemDescription?: string;
    itemName?: string;
    orderedQty?: number;
    notes?: string;
  }>;
  progress?: Record<string, {
    steps?: Record<string, { checked?: boolean; date?: string }>;
  }>;
  panelDocuments?: ShopFloorPanelDocument[];
  orderDrawings?: ShopFloorOrderDrawing[];
  error?: string;
};

export type CustomPartLineMapping = {
  customPartId: string;
  orderNumber: string;
  orderLineId: string;
};

function dashboardApiUrl(): string {
  return (process.env.DASHBOARD_API_URL?.trim() || "http://127.0.0.1:3000")
    .replace(/\/$/, "");
}

function shopFloorHeaders(): HeadersInit {
  const token = process.env.SHOP_FLOOR_API_TOKEN?.trim();
  return {
    Accept: "application/json",
    ...(token ? { "x-shop-floor-token": token } : {}),
  };
}

export async function getShopFloorOrders(forceRefresh = false): Promise<ShopFloorOrdersResult> {
  const refreshQuery = forceRefresh ? "?refresh=1" : "";
  const response = await fetch(`${dashboardApiUrl()}/api/production-orders${refreshQuery}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  const data = (await response.json()) as DashboardOrdersResponse;
  if (!response.ok) {
    throw new Error(data.error || `Dashboard returned ${response.status}.`);
  }

  const orders: ShopFloorOrder[] = (data.orders ?? [])
    .filter((order) => !order.workflow?.productionCompletedDate)
    .map((order) => ({
      order: String(order.order ?? "").trim(),
      customer: order.customer?.trim() || "Unknown customer",
      dueDate: order.dueDate?.slice(0, 10) || "",
      isReleased: Boolean(order.workflow?.engineeringCompletedDate),
      isCustomerApproved: Boolean(order.workflow?.customerSignedOff?.checked),
      customerApprovedDate: order.workflow?.customerSignedOff?.date?.slice(0, 10) || "",
      isFullyStandard: Boolean(order.isFullyStandard),
      notes: order.workflow?.notes?.trim() || "",
    }))
    .filter((order) => order.order);

  return {
    orders,
    today: plantLocalCalendarDate(),
    lastSyncedAt: data.lastSyncedAt ?? null,
  };
}

export async function getShopFloorOrderDetail(
  orderId: string,
): Promise<Omit<ShopFloorOrderDetail, "files">> {
  const response = await fetch(
    `${dashboardApiUrl()}/api/shop-floor-orders/${encodeURIComponent(orderId)}`,
    { cache: "no-store", headers: shopFloorHeaders() },
  );
  const data = (await response.json()) as DashboardOrderDetailResponse;
  if (!response.ok) {
    throw new Error(data.error || `Dashboard returned ${response.status}.`);
  }

  return {
    lines: (data.lines ?? []).map((line) => {
      const rowId = String(line.rowId ?? "");
      const completed = data.progress?.[rowId]?.steps?.completed;
      const steps = Object.fromEntries(Object.entries(data.progress?.[rowId]?.steps || {}).map(([key, value]) => [key, { checked: Boolean(value.checked), date: value.date || "" }]));
      return {
        rowId,
        lineNumber: line.lineNumber ?? null,
        partNumber: line.partNumber?.trim() || "Unknown part",
        description: line.itemDescription?.trim() || line.itemName?.trim() || "",
        orderedQty: Number(line.orderedQty ?? 0),
        notes: line.notes?.trim() || "",
        completed: Boolean(completed?.checked),
        completedDate: completed?.date || "",
        steps,
      };
    }).filter((line) => line.rowId),
    panelDocuments: (data.panelDocuments ?? []).map((document) => ({
      ...document,
      orderNumber: String(document.orderNumber ?? ""),
      orderLineId: String(document.orderLineId ?? ""),
    })),
    orderDrawings: (data.orderDrawings ?? []).map((drawing) => ({
      ...drawing,
      id: Number(drawing.id),
      orderNumber: String(drawing.orderNumber ?? orderId),
      shareWithCustomer: Boolean(drawing.shareWithCustomer),
      size: Number(drawing.size ?? 0),
    })),
  };
}

export async function getPanelDocumentAssignments(orderId = "", includeContent = false): Promise<ShopFloorPanelDocument[]> {
  const query = new URLSearchParams();
  if (orderId) query.set("orderId", orderId);
  if (includeContent) query.set("includeContent", "1");
  const suffix = query.size ? `?${query.toString()}` : "";
  const response = await fetch(`${dashboardApiUrl()}/api/shop-floor-panel-documents${suffix}`, {
    cache: "no-store",
    headers: shopFloorHeaders(),
  });
  const data = await response.json() as { documents?: ShopFloorPanelDocument[]; error?: string };
  if (!response.ok) throw new Error(data.error || "Unable to load approved panel documents.");
  return data.documents ?? [];
}

export async function getUploadedPanelDocument(orderId: string, lineId: string, kind: "drawing" | "cutlist"): Promise<{ bytes: ArrayBuffer; contentDisposition: string }> {
  const response = await fetch(`${dashboardApiUrl()}/api/shop-floor-panel-documents/${encodeURIComponent(orderId)}/${encodeURIComponent(lineId)}/${kind}`, {
    cache: "no-store",
    headers: shopFloorHeaders(),
  });
  if (!response.ok) throw new Error(`Approved ${kind} PDF was not found.`);
  return { bytes: await response.arrayBuffer(), contentDisposition: response.headers.get("content-disposition") || "" };
}

export async function createShopFloorOrderDrawing(input: {
  orderId: string;
  fileName: string;
  contentBase64: string;
  shareWithCustomer: boolean;
  uploadedBy: string;
}): Promise<ShopFloorOrderDrawing> {
  const response = await fetch(`${dashboardApiUrl()}/api/order-drawings/${encodeURIComponent(input.orderId)}`, {
    method: "POST",
    headers: { ...shopFloorHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      file: { name: input.fileName, contentBase64: input.contentBase64 },
      shareWithCustomer: input.shareWithCustomer,
      uploadedBy: input.uploadedBy,
    }),
    cache: "no-store",
  });
  const data = await response.json() as { drawing?: ShopFloorOrderDrawing; error?: string };
  if (!response.ok || !data.drawing) throw new Error(data.error || "Unable to add the order drawing.");
  return data.drawing;
}

export async function setShopFloorOrderDrawingSharing(input: {
  orderId: string; drawingId: number; shareWithCustomer: boolean;
}): Promise<void> {
  const response = await fetch(`${dashboardApiUrl()}/api/order-drawings/${encodeURIComponent(input.orderId)}/${input.drawingId}`, {
    method: "PATCH", headers: { ...shopFloorHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ shareWithCustomer: input.shareWithCustomer }), cache: "no-store",
  });
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error || "Unable to update customer sharing.");
}

export async function deleteShopFloorOrderDrawing(orderId: string, drawingId: number): Promise<void> {
  const response = await fetch(`${dashboardApiUrl()}/api/order-drawings/${encodeURIComponent(orderId)}/${drawingId}`, {
    method: "DELETE", headers: shopFloorHeaders(), cache: "no-store",
  });
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error || "Unable to delete the order drawing.");
}

export async function getShopFloorOrderDrawingFile(orderId: string, drawingId: number): Promise<{
  bytes: ArrayBuffer; contentType: string; contentDisposition: string;
}> {
  const response = await fetch(`${dashboardApiUrl()}/api/order-drawings/${encodeURIComponent(orderId)}/${drawingId}/file`, {
    headers: shopFloorHeaders(), cache: "no-store",
  });
  if (!response.ok) throw new Error("Order drawing was not found.");
  return {
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") || "application/octet-stream",
    contentDisposition: response.headers.get("content-disposition") || "attachment",
  };
}

export async function setShopFloorLineComplete(input: {
  orderId: string;
  lineId: string;
  checked: boolean;
  allowCompletedClear: boolean;
}): Promise<void> {
  const response = await fetch(
    `${dashboardApiUrl()}/api/shop-floor-orders/${encodeURIComponent(input.orderId)}/lines/${encodeURIComponent(input.lineId)}/complete`,
    {
      method: "PATCH",
      headers: { ...shopFloorHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        checked: input.checked,
        allowCompletedClear: input.allowCompletedClear,
      }),
      cache: "no-store",
    },
  );
  const data = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Unable to update this line.");
  }
}

export async function setShopFloorLineProcess(input: {
  orderId: string; lineId: string; process: "weld" | "mesh"; checked: boolean;
}): Promise<void> {
  const response = await fetch(
    `${dashboardApiUrl()}/api/shop-floor-orders/${encodeURIComponent(input.orderId)}/lines/${encodeURIComponent(input.lineId)}/process`,
    {
      method: "PATCH", headers: { ...shopFloorHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ process: input.process, checked: input.checked }), cache: "no-store",
    },
  );
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error || "Unable to update this line process.");
}

export async function getCustomPartLineMappings(orderId = ""): Promise<CustomPartLineMapping[]> {
  const query = orderId ? `?orderId=${encodeURIComponent(orderId)}` : "";
  const response = await fetch(`${dashboardApiUrl()}/api/shop-floor-custom-part-mappings${query}`, {
    cache: "no-store",
    headers: shopFloorHeaders(),
  });
  const data = await response.json() as { mappings?: CustomPartLineMapping[]; error?: string };
  if (!response.ok) throw new Error(data.error || "Unable to load custom part mappings.");
  return data.mappings ?? [];
}

export async function setCustomPartLineMappings(input: {
  customPartId: number;
  orderNumber: string;
  orderLineIds: string[];
}): Promise<void> {
  const response = await fetch(
    `${dashboardApiUrl()}/api/shop-floor-custom-part-mappings/${encodeURIComponent(String(input.customPartId))}`,
    {
      method: "PATCH",
      headers: { ...shopFloorHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    },
  );
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error || "Unable to save custom part mapping.");
}

export async function validateCustomPartLineMapping(orderNumber: string, orderLineId: string): Promise<void> {
  if (!orderLineId) return;
  const detail = await getShopFloorOrderDetail(orderNumber);
  if (!detail.lines.some((line) => line.rowId === orderLineId)) {
    throw new Error("The selected order line does not belong to this order.");
  }
}

export async function validateCustomPartLineMappings(orderNumber: string, orderLineIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(orderLineIds.map((value) => value.trim()).filter(Boolean))];
  if (!uniqueIds.length) return;
  const detail = await getShopFloorOrderDetail(orderNumber);
  const validIds = new Set(detail.lines.map((line) => line.rowId));
  if (uniqueIds.some((lineId) => !validIds.has(lineId))) {
    throw new Error("One or more selected order lines do not belong to this order.");
  }
}

export async function getShopFloorPartDemand(): Promise<PartDemandRow[]> {
  const response = await fetch(`${dashboardApiUrl()}/api/shop-floor-part-demand`, {
    cache: "no-store",
    headers: shopFloorHeaders(),
  });
  const data = await response.json() as { rows?: PartDemandRow[]; error?: string };
  if (!response.ok) throw new Error(data.error || "Unable to load part demand.");
  return data.rows ?? [];
}
