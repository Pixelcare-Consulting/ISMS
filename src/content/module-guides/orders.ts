import type { ModuleGuideContent } from "@/content/module-guides/types";
import type { BranchOrderType } from "@prisma/client";

export const MANUAL_ORDERS_MODULE_GUIDE: ModuleGuideContent = {
  title: "Manual orders",
  description:
    "Create a live branch request; it goes straight to Supply Planning. Team Leaders may optionally edit while it is Pending SP. Orders shows requests waiting for your role (including optional edit). Order History holds approved and past orders. Order analytics on an order opens stock, sales, and days of cover for that branch. Logistics fulfills only after Supply Planning’s final approval.",
  tips: [
    { label: "Use Create order for this branch. Additional item switches that order to Special" },
    { label: "Enter a quantity of 1 or more per model. Suggest is the shelf gap" },
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
    "Team Leaders create these requests; Supply Planning gives final approval. A special order you submitted stays on this list. Other requests appear when they are waiting for your role. Order History holds approved and past orders. Additional item opens a window to pick active models that are not already on the sheet, without changing the shelf plan. Logistics fulfills only after Supply Planning’s final approval.",
  tips: [
    { label: "Use Create order, then Additional item to search for a model that is not already on the sheet" },
    { label: "Filter by brand on the sheet. Adding an extra item does not change the branch shelf plan" },
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
    { label: "Suggest on the order sheet is the remaining quantity from the released plan" },
    { label: "Use Orders for requests waiting for your role, and Order History for approved and past orders" },
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
