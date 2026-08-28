export type PanelOrderItem = {
  id: string;
  rowId: string;
  lineNumber: number | null;
  partNumber: string;
  quantity: number;
  notes: string;
  drawingMode: "generated" | "uploaded";
  drawingName: string;
  cutlistMode: "generated" | "uploaded" | "none";
  cutlistName: string;
};

export type PanelOrder = {
  order: string;
  customer: string;
  dueDate: string;
  panels: PanelOrderItem[];
  missingCodeLines: number;
};
