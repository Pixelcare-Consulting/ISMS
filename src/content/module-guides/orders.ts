import type { ModuleGuideContent } from "@/content/module-guides/types";

export const ORDERS_MODULE_GUIDE: ModuleGuideContent = {
  title: "Branch orders",
  description:
    "Create, review, and track replenishment requests. Manual, Special, and Auto replenish each follow PS → TL → SP before logistics delivery.",
  tips: [
    { label: "Review when it is your role’s turn — hover if the button is disabled" },
    { label: "Auto replenish drafts start from Planning → Suggested orders" },
    { label: "Approved orders queue logistics delivery for branch acceptance" },
  ],
  storageKey: "module-guide.orders",
};
