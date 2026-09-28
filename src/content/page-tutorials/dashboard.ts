import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const DASHBOARD_PAGE_TUTORIAL: PageTutorialContent = {
  id: "dashboard-home",
  triggerLabel: "Open overview tutorial",
  dialogTitle: "Overview — quick guide",
  dialogDescription:
    "Dashboard Overview is your company announcement feed — new posts first, then ones you already read.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "After sign-in, Overview is home for company announcements. Ops and sales cards live on their own Dashboard pages.",
    },
    {
      title: "Announcements feed",
      bullets: [
        "New (unread) posts appear at the top; Earlier holds posts you have marked as read.",
        "Read each post, mark it as read, and open the reader list to see who has acknowledged it.",
        "Like or comment to acknowledge updates without leaving Overview. Comments show the latest few; open Show all when there are more. You can edit or delete your own comments; announcement managers can delete any comment.",
        "Managers still create and edit posts under Announcements in the menu.",
      ],
    },
    {
      title: "Other Dashboard pages",
      bullets: [
        "Operations holds today’s briefing and stock, orders, logistics, and planning cards when you have access.",
        "Sales holds the sales overview when you can use Sales or Returns.",
        "Use P-Count Dashboard, Site Traffic, and Market Survey under the same Dashboard menu when available.",
      ],
    },
    {
      title: "Next steps",
      description:
        "Use Help & Support for full workflow guides. Daily execution usually continues in Orders, Inventory, Sales, or Returns / Replacement.",
    },
  ],
};
