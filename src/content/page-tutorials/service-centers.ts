import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const SERVICE_CENTERS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "settings-service-centers",
  triggerLabel: "Open service centers tutorial",
  dialogTitle: "Service centers — quick guide",
  dialogDescription:
    "Service center master data and nested locations used by Service ops (inventory, sales, orders, deliveries, pull-outs).",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Service centers hold repair and service locations. Nested locations are the stock and sales sites used from Inventory, Orders, and Sales & Returns.",
    },
    {
      title: "How to use it",
      bullets: [
        "Maintain accurate center names and codes for reporting.",
        "Add nested locations before stocking or selling at a site.",
        "Day-to-day inventory, orders, sales, deliveries, and pull-outs open from Inventory, Orders, and Sales & Returns.",
      ],
    },
    {
      title: "Related setup",
      description:
        "Assign service centers in Areas of responsibility so users only see their scoped sites in Service ops.",
    },
  ],
};
