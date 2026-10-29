import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const WAREHOUSE_STOCK_PAGE_TUTORIAL: PageTutorialContent = {
  id: "inventory-warehouse-stock",
  triggerLabel: "Open warehouse stock tutorial",
  dialogTitle: "Warehouse stock — quick guide",
  dialogDescription:
    "Browse serial numbers held in warehouses (separate from branch Stock units).",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Warehouse stock lists serials sitting in warehouse locations. Branch shelf stock stays under Stock units. This view is read-only: stock comes from SAP through the serial number sync, and ISMS has no separate stock in.",
    },
    {
      title: "How to use it",
      bullets: [
        "Filter by warehouse and location, or search by serial number or SKU.",
        "Status shows the warehouse system status when available (for example Stock).",
        "Open Settings → Warehouses → Stock to jump here with a warehouse already selected.",
      ],
    },
    {
      title: "Empty list?",
      description:
        "Only serials that have a warehouse location appear here (for example units returned to a location). Serials SAP holds in a warehouse without a location are still dispatchable from that warehouse. An empty list is not a permissions error.",
    },
    {
      title: "Related work",
      description:
        "Use Stock units for branch STK. Use Settings → Warehouses to maintain locations and stock serials in. Official Sales can consume warehouse serials for WHSE_ADD.",
    },
  ],
};
