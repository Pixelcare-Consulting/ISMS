import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const DASHBOARD_OPERATIONS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "dashboard-operations",
  triggerLabel: "Open operations tutorial",
  dialogTitle: "Operations — quick guide",
  dialogDescription:
    "Your operations home for today’s briefing and activity cards for stock, orders, planning, and logistics.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Operations shows the snapshot of work that needs attention for inventory, orders, logistics, and planning roles.",
    },
    {
      title: "Briefing and activity",
      bullets: [
        "Today’s briefing (when ISMS Assist is on) summarizes the numbers on this page.",
        "Tap an activity card to jump to Orders, Inventory, Logistics, or other modules you can use.",
        "Inventory summary, planning alerts, This month, and Order pipeline appear when your role has access.",
      ],
    },
    {
      title: "Related Dashboard pages",
      bullets: [
        "Overview is for company announcements only.",
        "Sales (when you have access) holds the sales overview and returns snapshot.",
        "Use P-Count Dashboard, Site Traffic, and Market Survey under the same Dashboard menu when available.",
      ],
    },
  ],
};
