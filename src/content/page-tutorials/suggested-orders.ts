import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const SUGGESTED_ORDERS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "planning-suggested-orders",
  triggerLabel: "Open suggested orders tutorial",
  dialogTitle: "Suggested orders — quick guide",
  dialogDescription:
    "Auto-replenish drafts from allocation gaps — review and submit for TL.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Suggested orders are draft auto-replenish requests built from planning allocation gaps. They are not live branch orders until you submit them into the approval path.",
    },
    {
      title: "How to use it",
      bullets: [
        "Review draft lines and allocation gaps by branch.",
        "Submit ready drafts for Team Leader review, then Supply Planning approval on Branch orders.",
        "To create or refresh drafts, go back to Planning, run allocation, and generate from the popup after forecast or planogram changes.",
      ],
    },
    {
      title: "Related pages",
      bullets: [
        "Settings → Planning — run allocation, then generate drafts from the popup.",
        "Branch orders — approve submitted auto-replenish orders.",
      ],
    },
  ],
};
