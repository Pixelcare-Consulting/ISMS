import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const DASHBOARD_PAGE_TUTORIAL: PageTutorialContent = {
  id: "dashboard-home",
  triggerLabel: "Open overview tutorial",
  dialogTitle: "Overview — quick guide",
  dialogDescription:
    "Your Dashboard Overview starts with the company announcement feed, then shows role-based activity cards and ops numbers when you have access.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "After sign-in, Overview is your home for announcements and a snapshot of work that needs attention for your role.",
    },
    {
      title: "Announcements feed",
      bullets: [
        "Read each post, mark it as read, and open the reader list to see who has acknowledged it.",
        "Like or comment to acknowledge updates without leaving Overview.",
        "Managers still create and edit posts under Announcements in the menu.",
      ],
    },
    {
      title: "Ops snapshot",
      bullets: [
        "Below the feed, tap an activity card to jump to Orders, Inventory, Logistics, Sales, or other modules you can use.",
        "Inventory, planning alerts, This month, Order pipeline, and Sales overview appear when your role has access.",
        "Use Dashboard → P-Count Dashboard for month progress, Site Traffic for who is online, and Market Survey for competitor notes.",
      ],
    },
    {
      title: "Next steps",
      description:
        "Use Help & Support for full workflow guides. Daily execution usually continues in Orders, Operations, Inventory, Sales, or Returns / Replacement.",
    },
  ],
};
