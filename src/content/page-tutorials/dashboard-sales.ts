import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const DASHBOARD_SALES_PAGE_TUTORIAL: PageTutorialContent = {
  id: "dashboard-sales",
  triggerLabel: "Open sales dashboard tutorial",
  dialogTitle: "Sales — quick guide",
  dialogDescription:
    "Your sales home for today’s briefing and the sales overview cards for the month.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Sales shows KPIs, charts, and rankings for sales and returns work you can access.",
    },
    {
      title: "Briefing and overview",
      bullets: [
        "Today’s briefing (when ISMS Assist is on) focuses on sales and returns numbers.",
        "Use the cards and rankings to spot volume, open ATR, and top performers.",
        "Encode sales and finish returns from Sales Transactions and Returns / Replacement in the menu.",
      ],
    },
    {
      title: "Related Dashboard pages",
      bullets: [
        "Overview is for company announcements only.",
        "Operations (when you have access) holds stock, orders, and logistics cards.",
      ],
    },
  ],
};
