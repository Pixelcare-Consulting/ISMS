import type { ModuleGuideContent } from "@/content/module-guides/types";
import type { BranchOrderType } from "@prisma/client";

export const MANUAL_ORDERS_MODULE_GUIDE: ModuleGuideContent = {
  title: "Manual orders",
  description:
    "Create a live branch request; it goes straight to Supply Planning. Team Leaders may optionally edit while it is Pending SP. Orders shows requests waiting for your role (including optional edit). Use Order Analytics to check stock and suggested quantities, and Order History for approved and past SO#s. Logistics fulfills only after Supply Planning’s final approval.",
  tips: [
    { label: "Open Order Analytics, pick a branch and brand, then Proceed to order — or use Create order" },
    { label: "Enter a quantity of 1 or more per model; extras come from other planogram models at the branch" },
    {
      label:
        "SUG is the shelf gap from planogram Shelf max (Shelf max − STK) — not the Planning forecast. Confirm stock on Stock units → By model or Reports → Inventory Report; set CBM on Models import so Total CBM is correct",
    },
    { label: "Product Specialists and Team Leaders can Edit while Pending SP; only Supply Planning Reviews" },
    { label: "After SP approval, logistics schedules delivery; accept stock in Operations" },
    {
      label:
        "Super Admin: select rows on Orders and use Cancel selected to discard drafts or cancel pending orders (they move to Order History)",
    },
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
    {
      label:
        "Additional lines show real branch STK. SUG is shelf gap from planogram Shelf max, not forecast — validate with By model or Inventory Report; fill CBM on Models import for volume",
    },
    { label: "Review when it is your role’s turn — Supply Planning can adjust quantities or a delivery date" },
    { label: "After SP approval, logistics schedules delivery; accept stock in Operations" },
  ],
  storageKey: "module-guide.orders.special",
};

export const AUTO_REPLENISH_ORDERS_MODULE_GUIDE: ModuleGuideContent = {
  title: "Auto replenish orders",
  description:
    "Review suggestions from Suggested Orders on this screen. They become a draft when you add them, and they are not submitted until you submit that draft. This page shows Orders and Order History. Approval is Team Leader, then Supply Planning. Logistics fulfills only after Supply Planning’s final approval.",
  tips: [
    {
      label:
        "Open Suggested Orders, choose a branch, and add the quantities you want. The order stays a draft until you submit it",
    },
    {
      label:
        "Draft rows from Suggested orders can be discarded with Delete before Submit for review — submitted orders use Review to reject or cancel instead",
    },
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
