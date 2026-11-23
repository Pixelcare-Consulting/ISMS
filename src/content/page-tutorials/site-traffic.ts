import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const SITE_TRAFFIC_PAGE_TUTORIAL: PageTutorialContent = {
  id: "dashboard-site-traffic",
  triggerLabel: "Open Site Traffic tutorial",
  dialogTitle: "Site Traffic — quick guide",
  dialogDescription:
    "See who is signed in, recent activity, and top Product Specialist sales for the month.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "A lightweight usage overview for head office. Numbers come from real sessions, users, audit logs, and sales — never invented placeholders.",
    },
    {
      title: "How to read it",
      bullets: [
        "Total / Active / Login users (and PS) summarize accounts and fresh sessions.",
        "Recent users lists the latest Better Auth sessions with role and AOR branch when available.",
        "Pages currently summarizes audit activity (entity/action) because full page-path tracking is not wired yet.",
        "Top PS ranks sales transactions created this Manila calendar month.",
      ],
    },
  ],
};
