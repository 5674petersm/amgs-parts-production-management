export type StationQtyRow = {
  station: string;
  totalQty: number;
};

export type DashboardStats = {
  startDate: string;
  endDate: string;
  produced: StationQtyRow[];
  completed: StationQtyRow[];
};

export type StockInventoryRow = {
  itemId: number;
  partNumber: string;
  finalStation: string;
  qtyOnHand: number;
  minQty: number;
  qtyOnOrders: number;
  qtyInProduction: number;
};

export type StockInventoryResult = {
  rows: StockInventoryRow[];
};
