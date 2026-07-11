import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const WAREHOUSES_PAGE_TUTORIAL: PageTutorialContent = {
  id: "settings-warehouses",
  triggerLabel: "Open warehouses tutorial",
  dialogTitle: "Warehouses — quick guide",
  dialogDescription: "Warehouse locations and storage aisles for stock movement.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Warehouses hold central or regional stock that feeds branch deliveries, transfers, and pull-outs. Aisles support location detail in inventory workflows.",
    },
    {
      title: "How to use it",
      bullets: [
        "Add warehouses with clear codes that match your ERP/SAP naming where possible.",
        "Define aisles when your process tracks storage slots.",
        "Link warehouses in Areas of responsibility when users need warehouse-scoped access.",
      ],
    },
    {
      title: "Next steps",
      description:
        "After warehouses exist, finish Branches/Dealers and AORs, then use Logistics for movement between warehouse and branch.",
    },
  ],
};
