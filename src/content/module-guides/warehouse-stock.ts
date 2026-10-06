import type { ModuleGuideContent } from "@/content/module-guides/types";

export const WAREHOUSE_STOCK_MODULE_GUIDE: ModuleGuideContent = {
  title: "Warehouse stock",
  description:
    "Read-only serial list for warehouse locations. Branch serials stay on Stock units; warehouse setup stays under Settings → Warehouses.",
  tips: [
    { label: "Filter by warehouse / location or search SN and SKU" },
    { label: "Filled from SAP as the Serial numbers sync runs: each serial SAP holds in a warehouse lands here, under a location named after the SAP warehouse" },
    { label: "Settings → Warehouses → Stock opens the same list with a warehouse filter" },
  ],
  storageKey: "module-guide.warehouse-stock",
};
