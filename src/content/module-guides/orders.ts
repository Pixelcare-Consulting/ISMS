import type { ModuleGuideContent } from "@/content/module-guides/types";
import type { BranchOrderType } from "@prisma/client";

export const MANUAL_ORDERS_MODULE_GUIDE: ModuleGuideContent = {
  title: "Manual orders",
  description:
    "Create a live branch request, then send it through Product Specialist → Team Leader → Supply Planning. Orders shows only requests waiting for your role. Use Order Analytics to check stock and suggested quantities, and Order History for approved and past SO#s. Logistics fulfills only after Supply Planning’s final approval.",
  tips: [
    { label: "Open Order Analytics, pick a branch and brand, then Proceed to order — or use Create order" },
    { label: "Enter a quantity of 1 or more per model; extras come from other planogram models at the branch" },
    { label: "Review when it is your role’s turn — finished approvals live in Order History" },
    { label: "After SP approval, logistics schedules delivery; accept stock in Operations" },
  ],
  storageKey: "module-guide.orders.manual",
};

export const SPECIAL_ORDERS_MODULE_GUIDE: ModuleGuideContent = {
  title: "Special orders",
  description:
    "Team Leaders create these requests; Supply Planning gives final approval. Orders shows only requests waiting for your role. Use Order Analytics to check stock before you create, and Order History for approved and past SO#s. You can add an extra item that is not on the branch planogram. Logistics fulfills only after Supply Planning’s final approval.",
  tips: [
    { label: "Open Order Analytics, pick a branch and brand, then Proceed to order — or use Create order" },
    { label: "Leave brand empty to see every model, or pick a brand to narrow the list; extras can be off the planogram" },
    { label: "Review when it is your role’s turn — Supply Planning can adjust quantities or a delivery date" },
    { label: "After SP approval, logistics schedules delivery; accept stock in Operations" },
  ],
  storageKey: "module-guide.orders.special",
};

export const AUTO_REPLENISH_ORDERS_MODULE_GUIDE: ModuleGuideContent = {
  title: "Auto replenish orders",
  description:
    "Review suggested restock from Settings → Planning. This page shows Orders and Order History only — there is no Create order or Order Analytics here. Approval is Team Leader → Supply Planning. Logistics fulfills only after Supply Planning’s final approval.",
  tips: [
    { label: "Orders from Demand Planning Release land here already waiting for Team Leader" },
    { label: "Release confirmation lists branches with no sales history, no Drop 1, or an open Auto Replenish before you proceed" },
    { label: "Use Orders for requests waiting for your role, and Order History for approved and past SO#s" },
    { label: "Review when it is your role’s turn — Supply Planning can adjust quantities or a delivery date" },
    { label: "After SP approval, logistics schedules delivery; accept stock in Operations" },
  ],
  storageKey: "module-guide.orders.auto-replenish",
};

export function ordersModuleGuideForType(
  orderType: BranchOrderType,
): ModuleGuideContent {
  switch (orderType) {
    case "manual":
      return MANUAL_ORDERS_MODULE_GUIDE;
    case "special":
      return SPECIAL_ORDERS_MODULE_GUIDE;
    case "auto_replenish":
      return AUTO_REPLENISH_ORDERS_MODULE_GUIDE;
    default: {
      const _exhaustive: never = orderType;
      return _exhaustive;
    }
  }
}
