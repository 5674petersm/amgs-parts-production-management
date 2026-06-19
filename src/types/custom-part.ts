export type CustomPartListItem = {
  customPartId: number;
  amgsOrderNumber: string;
  customerName: string;
  partNumber: string;
  description: string;
  qtyNeeded: number;
  material: string;
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
