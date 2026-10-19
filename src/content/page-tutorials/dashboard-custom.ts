import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const DASHBOARD_CUSTOM_PAGE_TUTORIAL: PageTutorialContent = {
  id: "dashboard-custom",
  triggerLabel: "Open custom dashboards tutorial",
  dialogTitle: "Custom Dashboards — quick guide",
  dialogDescription: "Build your own dashboards from ISMS data and share them with your company.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Custom Dashboards lists the dashboards you built and the ones colleagues shared with the company.",
    },
    {
      title: "Building a dashboard",
      bullets: [
        "Choose New dashboard, name it, then add charts, tables and indicators in the designer.",
        "Drag fields from the ISMS datasets in the Dictionary panel onto an element, then Save.",
        "Set up a separate phone layout from the designer's mobile view so it reads well on small screens.",
      ],
    },
    {
      title: "Sharing and data access",
      bullets: [
        "Share a dashboard with your company from Details. Only you can change or delete it.",
        "Everyone who opens a dashboard sees only the data their own role and branches allow.",
      ],
    },
  ],
};
