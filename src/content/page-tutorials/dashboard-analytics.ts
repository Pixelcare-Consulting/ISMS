import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const DASHBOARD_ANALYTICS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "dashboard-analytics",
  triggerLabel: "Open analytics dashboard tutorial",
  dialogTitle: "Analytics — quick guide",
  dialogDescription: "Interactive operations and sales analytics built on the same numbers as Operations and Sales.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Analytics shows the Operations and Sales dashboard numbers as interactive charts you can filter, print and export.",
    },
    {
      title: "Working with the charts",
      bullets: [
        "Click a chart slice or bar to filter the other elements; click again to clear it.",
        "Use the toolbar to print or export the dashboard to PDF or Excel.",
        "You only see the tiles and charts your role can open, scoped to your assigned branches.",
      ],
    },
  ],
};
