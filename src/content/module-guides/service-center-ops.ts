import type { ModuleGuideContent } from "@/content/module-guides/types";

export const SC_OPS_MODULE_GUIDE: ModuleGuideContent = {
  title: "Service center operations",
  description:
    "Inventory, sales, returns, orders, deliveries, and pull-outs for service centers, scoped by your area of responsibility.",
  tips: [
    { label: "Assign service centers under Settings → Areas of responsibility" },
    { label: "Stock lives on the service center ledger (not branch inventory)" },
    { label: "Order → delivery accept is the main path to add STK serials" },
    { label: "Service Returns and Replacements from CSRs are finished under Returns" },
  ],
  storageKey: "module-guide.service-center-ops",
};
