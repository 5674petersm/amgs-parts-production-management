export type PartDemandRow = {
  stockId: number;
  partNumber: string;
  description: string;
  orderCount: number;
  requiredQty: number;
  inventoryQty: number;
  earliestRequiredDate: string;
  demandByDueDate: {
    dueDate: string;
    orderCount: number;
    requiredQty: number;
  }[];
};
