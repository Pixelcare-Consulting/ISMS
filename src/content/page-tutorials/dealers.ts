import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const DEALERS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "settings-dealers",
  triggerLabel: "Open dealers tutorial",
  dialogTitle: "Dealers — quick guide",
  dialogDescription:
    "Dealer master data with area, type, and mode of payment.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Dealers own one or more branches. Area, dealer type, and payment mode support sales and logistics context across the network.",
    },
    {
      title: "How to use it",
      bullets: [
        "Create dealers before or alongside their branches.",
        "Keep SAP codes and area assignments aligned with master-data lookups.",
        "Mode of payment and dealer type feed downstream sales/ops forms where used.",
      ],
    },
    {
      title: "Next steps",
      description:
        "Add Branches under each dealer, then assign Areas of responsibility so staff only see their network.",
    },
  ],
};
