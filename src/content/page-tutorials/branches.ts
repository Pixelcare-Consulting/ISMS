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
        "Branches are the operational locations for inventory, orders, deliveries, and sales. SAP is the source of truth for SAP Code and Branch Name — Sync from SAP adds and updates them.",
    },
    {
      title: "How to use it",
      bullets: [
        "Use Sync from SAP to bring in new branches and refresh codes and names. There is no Add branch — SAP owns those identity fields.",
        "Sync matches on SAP code. It adds and updates branches, but never deletes or deactivates ones SAP no longer lists.",
        "Edit a branch to set status, dealer, area, warehouses, and delivery schedule. SAP Code and Branch Name stay locked.",
        "Import is still available for bulk updates. Planogram and AOR assignments are per branch — sync branches before those setups.",
      ],
    },
    {
      title: "Next steps",
      description:
        "Configure Warehouses, Dealers, then Areas of responsibility so users only see stock for their branches.",
    },
  ],
};
