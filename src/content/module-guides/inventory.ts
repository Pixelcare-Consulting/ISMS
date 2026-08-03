import type { ModuleGuideContent } from "@/content/module-guides/types";

export const INVENTORY_MODULE_GUIDE: ModuleGuideContent = {
  title: "Stock units",
  description:
    "Serialized branch stock scoped by your areas of responsibility. Look up units, spot off-planogram exceptions, and open a serial for detail.",
  tips: [
    { label: "Series summary groups QTY and value by SKU — click to expand" },
    { label: "Off planogram means the SKU is not on that branch’s authorized list" },
    { label: "Filter by status or search serial, SKU, or branch" },
  ],
  storageKey: "module-guide.inventory",
};
