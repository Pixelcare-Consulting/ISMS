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
        "Warehouse stock lists serials sitting in warehouse locations. Branch shelf stock stays under Stock units. This view is read-only — receiving and SAP sync are separate workflows.",
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
        "Rows appear after warehouse stock is loaded (feed, demo seed, or Official Sales warehouse demo serials). An empty list usually means no warehouse serials have been loaded yet — not a permissions error.",
    },
    {
      title: "Related work",
      description:
        "Use Stock units for branch STK. Use Settings → Warehouses to maintain warehouse codes and aisles. Official Sales can consume warehouse serials for WHSE_ADD.",
    },
  ],
};
