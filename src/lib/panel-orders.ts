import { getPanelDocumentAssignments } from "@/lib/shop-floor-orders";
import type { PanelOrder } from "@/types/panel-order";

export async function getPanelOrders(): Promise<PanelOrder[]> {
  const documents = await getPanelDocumentAssignments();
  const grouped = new Map<string, PanelOrder>();
  for (const document of documents) {
    const order = grouped.get(document.orderNumber) ?? {
      order: document.orderNumber,
      customer: document.customer || "Unknown customer",
      dueDate: document.dueDate || "",
      panels: [],
      missingCodeLines: 0,
    };
    order.panels.push({
      id: `${document.orderNumber}:${document.orderLineId}`,
      rowId: document.orderLineId,
      lineNumber: document.lineNumber ?? null,
      partNumber: document.partNumber,
      quantity: Math.max(1, Number(document.orderedQty || 1)),
      notes: document.notes || "",
      drawingMode: document.drawingMode,
      drawingName: document.drawingOriginalName || `${document.partNumber} approved drawing.pdf`,
      cutlistMode: document.cutlistMode,
      cutlistName: document.cutlistOriginalName || `${document.partNumber} approved cutlist.pdf`,
    });
    grouped.set(document.orderNumber, order);
  }
  return [...grouped.values()].sort((left, right) => (left.dueDate || "9999").localeCompare(right.dueDate || "9999")
    || left.order.localeCompare(right.order, undefined, { numeric: true }));
}
