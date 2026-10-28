import type { ModuleGuideContent } from "@/content/module-guides/types";

export const WAREHOUSE_STOCK_MODULE_GUIDE: ModuleGuideContent = {
  title: "Warehouse stock",
  description:
    "Every serial with a location in a warehouse, including branch stock that has a location. Warehouse setup stays under Settings → Warehouses.",
  tips: [
    { label: "Filter by warehouse / location or search SN and SKU" },
    { label: "Edit location moves a serial to another location in the same warehouse" },
    { label: "Empty until warehouse feed, seed, or demo serials are loaded" },
    { label: "Settings → Warehouses → Stock opens the same list with a warehouse filter" },
  ],
  storageKey: "module-guide.warehouse-stock",
};
