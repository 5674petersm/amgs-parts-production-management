import type { ProductionSource } from "@/types";

export type CustomPartListItem = {
  customPartId: number;
  amgsOrderNumber: string;
  customerName: string;
  partNumber: string;
  description: string;
  qtyNeeded: number;
  material: string;
  completedAt: string | null;
  mappedOrderLineIds?: string[];
};

export type CustomProductionSubmitPayload = {
  customPartId: number;
  partNumber: string;
  qty: number;
  opStation: string;
  partComplete: boolean;
  locationType: "Cart" | "Bin";
  locationNo: number;
  source: ProductionSource;
};

export type CustomPartDraft = {
  amgsOrderNumber: string;
  customerName: string;
  partNumber: string;
  description: string;
  qtyNeeded: number;
  material: string;
  hasCustomColor: boolean;
  customColor: string;
  drawingFiles: File[];
  mappedOrderLineIds: string[];
};

export type CustomPartOrderLookup = {
  amgsOrderNumber: string;
  nextPartNumber: string;
  nextPartSequence: number;
  existingCustomerName: string | null;
  partCount: number;
};

export type CustomPartUploadResponse = {
  ok: true;
  partNumber: string;
  orderFolderId: string;
  partFolderId: string;
  folderUrl: string;
  uploadedFiles: { name: string; id: string }[];
};

export type CurrentCustomPart = {
  customPartId: number;
  orderNumber: string;
  customerName: string;
  partNumber: string;
  description: string;
  qtyNeeded: number;
  material: string;
  color: string;
  hasCustomColor: boolean;
  customColor: string;
  folderUrl: string;
  driveFolderId: string;
  files: { id: string; name: string; mimeType: string; url: string }[];
  mappedOrderLineIds: string[];
};

export type CustomPartOrderLineChoice = {
  rowId: string;
  lineNumber: number | null;
  partNumber: string;
  description: string;
  notes: string;
};
