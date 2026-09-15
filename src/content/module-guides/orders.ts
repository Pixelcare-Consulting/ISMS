import type { ModuleGuideContent } from "@/content/module-guides/types";

export const ORDERS_MODULE_GUIDE: ModuleGuideContent = {
  title: "Branch orders",
  description:
    "Use Orders for live requests and Order History for past SO#s. Manual and Special also have Order Analytics for stock and suggested quantities before you create. Auto replenish starts from Settings → Planning. Approval path: Manual (PS → TL → SP), Special (TL creates → SP), Auto replenish (TL → SP). Logistics fulfills only after Supply Planning’s final approval.",
  tips: [
    { label: "On Manual or Special, open Order Analytics, pick a branch and brand, then Proceed to order" },
    { label: "Create fills a branch workspace — enter quantities (1+) per model; Auto replenish starts from Suggested orders in Planning" },
    { label: "Review when it is your role’s turn — check status badges or hover if disabled" },
    { label: "After SP approval, logistics schedules delivery; accept stock in Operations" },
  ],
  storageKey: "module-guide.orders",
};
