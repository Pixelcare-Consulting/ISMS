import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const PCOUNT_DASHBOARD_PAGE_TUTORIAL: PageTutorialContent = {
  id: "dashboard-pcount",
  triggerLabel: "Open P-Count Dashboard tutorial",
  dialogTitle: "P-Count Dashboard — quick guide",
  dialogDescription:
    "See month progress by dealer, then open a branch to continue counting or posting.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Head-office style overview of physical counts for the calendar month (Manila). It aggregates existing P-Count sessions — it does not replace Inventory → P-Count for day-to-day counting.",
    },
    {
      title: "How to use it",
      bullets: [
        "KPI cards show branches done this month, counts still open, ready to post, and posted with SAP still pending.",
        "Filter by dealer and month, then Export to Excel for a progress matrix.",
        "Open a dealer card row to see last count details, session history, and SAP document refs.",
        "Use Open latest session to continue Counting → Posting. Post differences appears only when a session is ready and you can manage inventory.",
      ],
    },
    {
      title: "Related screens",
      description:
        "Inventory → P-Count runs sessions. Reports → P-Count lists closed sessions historically. Progress here counts a branch as done when its latest qualifying session is Closed or Posted · pending SAP.",
    },
  ],
};
