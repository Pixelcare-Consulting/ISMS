import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const DASHBOARD_PAGE_TUTORIAL: PageTutorialContent = {
  id: "dashboard-home",
  triggerLabel: "Open dashboard tutorial",
  dialogTitle: "Dashboard — quick guide",
  dialogDescription:
    "Role-based snapshot of approvals, stock, and alerts that need attention.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "The dashboard is your landing view after sign-in: ops KPIs (approvals, DIT, stock, ATR, planogram/MIL alerts) plus active announcements.",
    },
    {
      title: "How to use it",
      bullets: [
        "Scan KPIs for items in your lane, then jump to Orders, Inventory, or Logistics.",
        "Read the announcement banner for tenant-wide notices.",
        "If a module is missing from the menu, ask your admin for the right role permission.",
      ],
    },
    {
      title: "Next steps",
      description:
        "Use Help & Support for full workflow guides. Daily execution usually continues in Orders, Operations, or Inventory.",
    },
  ],
};
