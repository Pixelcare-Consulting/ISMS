import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const INVENTORY_PAGE_TUTORIAL: PageTutorialContent = {
  id: "inventory-stock-units",
  triggerLabel: "Open inventory tutorial",
  dialogTitle: "Inventory — quick guide",
  dialogDescription:
    "Serialized branch stock scoped by your areas of responsibility.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Stock units lists serialized inventory by branch. Planogram badges show whether an SKU is authorized for that branch. Lists are AOR-scoped to your assigned locations.",
    },
    {
      title: "How to use it",
      bullets: [
        "Filter by branch, SKU, or off-planogram to find exceptions.",
        "Open a unit for serial-level detail and status history.",
        "Use Stock count (P-Count) when you need a physical count session, not day-to-day lookup.",
      ],
    },
    {
      title: "Related work",
      description:
        "Operational receive/transfer/pull-out actions happen in Operations and Logistics — Inventory is primarily lookup and traceability.",
    },
  ],
};
