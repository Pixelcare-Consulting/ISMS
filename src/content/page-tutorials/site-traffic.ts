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
        "A lightweight usage overview for head office. Numbers come from real sessions, page visits, and sales.",
    },
    {
      title: "How to read it",
      bullets: [
        "Total / Active / Login users (and PS) summarize accounts and fresh sessions.",
        "Recent users lists who opened the app, the page they opened, and when. Refreshing the same page does not move that time. Reset session signs that person out.",
        "Pages lists each app address, how many times it was opened, and when it was last opened.",
        "Top PS ranks sales transactions created this Manila calendar month.",
      ],
    },
  ],
};
