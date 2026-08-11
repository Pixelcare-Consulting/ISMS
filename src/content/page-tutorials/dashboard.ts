import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const DASHBOARD_PAGE_TUTORIAL: PageTutorialContent = {
  id: "dashboard-home",
  triggerLabel: "Open dashboard tutorial",
  dialogTitle: "Dashboard — quick guide",
  dialogDescription:
    "Your home screen shows activity cards for your role, inventory mix, planning alerts, a monthly snapshot, the order pipeline, and a Sales overview when you can access Sales.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "After sign-in, the dashboard shows the numbers that matter for your role — not every module at once.",
    },
    {
      title: "How to use it",
      bullets: [
        "Tap an activity card to jump to Orders, Inventory, Logistics, Sales, Planogram, or Suggested orders — only tiles you can use appear (up to four).",
        "Inventory summary shows stock mix as a chart plus status counts; Planning & alerts lists extra signals that did not fit the top four (hidden when nothing is outstanding).",
        "This month (with icons) sits beside Order pipeline — orders, sales, and in-transit counts for the current month next to workflow stages.",
        "Sales overview (when you have Sales access) shows this month’s sales and amount, open ATR, returns in progress, sale status mix, return pipeline, and top branches and models — sales cards link to Sales; open returns and the return pipeline link to Returns / Replacement.",
        "Compliance roles see Policies, Reports, Announcements, and Competitors when those modules are available.",
        "Read the announcement banner for tenant-wide notices.",
        "If a module is missing from the menu, ask your admin for the right role permission.",
      ],
    },
    {
      title: "Next steps",
      description:
        "Use Help & Support for full workflow guides. Daily execution usually continues in Orders, Operations, Inventory, Sales, or Returns / Replacement.",
    },
  ],
};
