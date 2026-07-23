export type ShopFloorOrder = {
  order: string;
  customer: string;
  dueDate: string;
  isReleased: boolean;
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
};

export type ShopFloorOrderFileGroup = {
  customPartId: number;
  partNumber: string;
  description: string;
  folderUrl: string;
  files: { id: string; name: string; mimeType: string; url: string }[];
  mappedOrderLineId: string;
};

export type ShopFloorPanelDocument = {
  orderNumber: string;
  orderLineId: string;
  partNumber: string;
  drawingMode: "generated" | "uploaded";
  drawingOriginalName: string;
  cutlistMode: "generated" | "uploaded";
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
};

export type ShopFloorOrderDetail = {
  lines: ShopFloorOrderLine[];
  files: ShopFloorOrderFileGroup[];
  panelDocuments: ShopFloorPanelDocument[];
  filesError?: string;
};
