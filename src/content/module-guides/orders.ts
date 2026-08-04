import type { ModuleGuideContent } from "@/content/module-guides/types";

export const ORDERS_MODULE_GUIDE: ModuleGuideContent = {
  title: "Branch orders",
  description:
    "Approval path depends on order type: Manual (PS → TL → SP), Special (TL creates → SP), Auto replenish (TL → SP). Logistics fulfills only after Supply Planning’s final approval.",
  tips: [
    { label: "Review when it is your role’s turn — check status badges or hover if disabled" },
    { label: "Auto replenish suggestions start under Settings → Planning / Suggested orders" },
    { label: "After SP approval, logistics schedules delivery; accept stock in Operations" },
  ],
  storageKey: "module-guide.orders",
};
