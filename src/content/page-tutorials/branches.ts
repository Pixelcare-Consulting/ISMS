import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const BRANCHES_PAGE_TUTORIAL: PageTutorialContent = {
  id: "settings-branches",
  triggerLabel: "Open branches tutorial",
  dialogTitle: "Branches — quick guide",
  dialogDescription:
    "Dealer branch locations, SAP codes, and delivery areas.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Branches are the operational locations for inventory, orders, deliveries, and sales. SAP codes and delivery areas feed logistics and reporting.",
    },
    {
      title: "How to use it",
      bullets: [
        "Create branches linked to dealers with accurate SAP codes.",
        "Sync from SAP pulls branch master data over the Service Layer and matches on SAP code — it adds and updates branches, but never deletes or deactivates ones SAP no longer lists.",
        "Keep delivery areas current so logistics can schedule correctly.",
        "Planogram and AOR assignments are per branch — create branches before those setups.",
      ],
    },
    {
      title: "Next steps",
      description:
        "Configure Warehouses, Dealers, then Areas of responsibility so users only see stock for their branches.",
    },
  ],
};
