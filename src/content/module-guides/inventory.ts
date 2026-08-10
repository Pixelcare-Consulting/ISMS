import type { ModuleGuideContent } from "@/content/module-guides/types";

export const INVENTORY_MODULE_GUIDE: ModuleGuideContent = {
  title: "Stock units",
  description:
    "Serialized branch stock scoped by your areas of responsibility. Look up units, spot off-planogram exceptions, and open a serial for detail.",
  tips: [
    { label: "Lists Stock (STK) units only — sold and other statuses live in Sales / Logistics" },
    { label: "Series summary groups QTY and value by SKU — click to expand" },
    { label: "Off planogram means the SKU is not on that branch’s authorized list" },
    { label: "Search by serial, SKU, or branch" },
  ],
  storageKey: "module-guide.inventory",
};
