export type StockItem = {
  itemId: number;
  masterPNo: string;
  itemDescription: string;
  totalQty: number;
};

export type ProductionSource = "QR" | "Manual";

export type ProductionSubmitPayload = {
  itemId: number;
  masterPNo: string;
  qty: number;
  opStation: string;
  locationType: "Cart" | "Bin";
  locationNo: number;
  source: ProductionSource;
};
