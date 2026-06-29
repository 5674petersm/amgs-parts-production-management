export type StockItem = {
  itemId: number;
  masterPNo: string;
  itemDescription: string;
  totalQty: number;
  minQty: number;
  /** When set, inventory updates only at this station name. */
  finalStation: string | null;
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

export type PartLookupMatchesResponse = {
  matches: StockItem[];
};
