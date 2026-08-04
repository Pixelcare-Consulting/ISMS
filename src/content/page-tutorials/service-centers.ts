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
        "Service centers hold repair and service locations. Nested locations are the stock and sales sites used under the Service nav group.",
    },
    {
      title: "How to use it",
      bullets: [
        "Maintain accurate center names and codes for reporting.",
        "Add nested locations before stocking or selling at a site.",
        "Settings CRUD uses service_centers.manage; day-to-day ops use the Service menu permissions.",
      ],
    },
    {
      title: "Related setup",
      description:
        "Assign service centers in Areas of responsibility so users only see their scoped sites in Service ops.",
    },
  ],
};
