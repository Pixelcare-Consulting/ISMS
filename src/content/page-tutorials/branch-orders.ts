import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const BRANCH_ORDERS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "orders-branch-orders",
  triggerLabel: "Open branch orders tutorial",
  dialogTitle: "Branch orders — quick guide",
  dialogDescription:
    "How to create, review, and track replenishment requests across branches.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Approval path depends on order type. Logistics fulfills only after final Supply Planning approval. Each row is one order with its current workflow status.",
    },
    {
      title: "Order types",
      bullets: [
        "Manual — create the order → Product Specialist review → Team Leader review → Supply Planning approval.",
        "Special — Team Leader creates the request → Supply Planning approval.",
        "Auto replenish — Team Leader review → Supply Planning approval. Suggestions are generated under Settings → Planning (and often started from Suggested orders).",
      ],
    },
    {
      title: "Review & approve",
      bullets: [
        "Open the matching Orders menu (Manual, Auto replenish, or Special) and click Review when it is your role’s turn.",
        "Check status badges to see who must act next; if Review is disabled, hover the button for the reason.",
        "Supply Planning gives final approval and can adjust quantities or an optional delivery date before logistics starts.",
      ],
    },
    {
      title: "After approval",
      description:
        "After Supply Planning approves, logistics schedules delivery. The branch accepts stock in Operations when it arrives (In transit → On hand).",
      bullets: [
        "Use the Processed orders report after fulfillment for audit trails.",
      ],
    },
  ],
};
