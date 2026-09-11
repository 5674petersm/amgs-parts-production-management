export type ShopFloorOrder = {
  order: string;
  customer: string;
  dueDate: string;
  isReleased: boolean;
  isCustomerApproved: boolean;
  customerApprovedDate: string;
  isFullyStandard: boolean;
  notes: string;
};

export type ShopFloorOrdersResult = {
  orders: ShopFloorOrder[];
  today: string;
  lastSyncedAt: string | null;
};

export type ShopFloorOrderLine = {
  rowId: string;
  lineNumber: number | null;
  partNumber: string;
  description: string;
  orderedQty: number;
  notes: string;
  completed: boolean;
  completedDate: string;
  steps: Record<string, { checked: boolean; date: string }>;
};

export type ShopFloorOrderFileGroup = {
  customPartId: number;
  partNumber: string;
  description: string;
  completedAt: string | null;
  folderUrl: string;
  files: { id: string; name: string; mimeType: string; url: string }[];
  mappedOrderLineIds: string[];
  requiredProcesses: import("@/constants/custom-part-processes").CustomPartProcess[];
  processProgress: Partial<Record<import("@/constants/custom-part-processes").CustomPartProcess, string>>;
};

export type ShopFloorPanelDocument = {
  orderNumber: string;
  orderLineId: string;
  partNumber: string;
  drawingMode: "generated" | "uploaded";
  drawingOriginalName: string;
  cutlistMode: "generated" | "uploaded" | "none";
  cutlistOriginalName: string;
  assignedBy: string;
  assignedAt: string;
  customer?: string;
  dueDate?: string;
  lineNumber?: number | null;
  orderedQty?: number;
  notes?: string;
  drawingSvg?: string;
  cutlistJson?: string;
  cutlistQuantity?: number | null;
};

export type ShopFloorOrderDrawing = {
  id: number;
  orderNumber: string;
  originalName: string;
  mimeType: string;
  size: number;
  shareWithCustomer: boolean;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ShopFloorOrderDetail = {
  lines: ShopFloorOrderLine[];
  files: ShopFloorOrderFileGroup[];
  panelDocuments: ShopFloorPanelDocument[];
  orderDrawings: ShopFloorOrderDrawing[];
  filesError?: string;
};
