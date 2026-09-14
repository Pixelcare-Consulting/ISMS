import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const BRANCH_ORDERS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "orders-branch-orders",
  triggerLabel: "Open branch orders tutorial",
  dialogTitle: "Branch orders — quick guide",
  dialogDescription:
    "How to check stock, create a branch request, review approvals, and look up past orders.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Each order type (Manual, Special, Auto replenish) has three tabs. Order counts sit under the Orders tab. Logistics fulfills only after final Supply Planning approval.",
    },
    {
      title: "Orders, Analytics, and History",
      bullets: [
        "Orders — live requests you can Review, Edit, or View, with a compact count summary above the list.",
        "Order Analytics — pick a branch, then a brand, to see DII, inventory, this month’s sales, and suggested quantities. Figures stay hidden until you choose a brand. Brand tabs sit above the model table; long lists use pages. Proceed to order opens the create workspace with that branch filled in.",
        "Order History — past SO#s with ordered and approved quantities and amounts, date, and who last updated the request.",
      ],
    },
    {
      title: "Create a branch order",
      bullets: [
        "Create order opens a wide workspace: dealer, branch, and notes on the left; models on the right. Use Additional item above the list to add extras — they appear at the top.",
        "Enter a branch quantity of 1 or more to include a model. Manual starts at 0; Auto replenish starts from the suggested quantity. Full shelves stay visible but stay locked on Manual and Auto replenish.",
        "Manual and Auto replenish extras come from other planogram models at the branch. Special can add an extra item that is not on the planogram.",
      ],
    },
    {
      title: "Order types & review",
      bullets: [
        "Manual — create the order → Product Specialist review → Team Leader review → Supply Planning approval.",
        "Special — Team Leader creates the request → Supply Planning approval.",
        "Auto replenish — Team Leader review → Supply Planning approval. Planning still builds the suggestion list.",
        "Open Review when it is your role’s turn. Supply Planning can adjust quantities or an optional delivery date.",
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
