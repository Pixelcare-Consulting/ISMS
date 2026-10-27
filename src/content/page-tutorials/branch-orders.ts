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
        "Manual, Special, and Auto replenish each show Orders and Order History. Open Order analytics on an order to see stock, sales, and days of cover. Order counts sit under the Orders tab for your current work queue. Logistics fulfills only after final Supply Planning approval.",
    },
    {
      title: "Orders, Analytics, and History",
      bullets: [
        "Orders — requests waiting for your role so you can Review or Edit. Approved, rejected, and cancelled orders stay in Order History.",
        "Order analytics — from an order, opens stock, sales, sell-through, and days of cover for that branch. Suggest follows the order type. It is separate from the order sheet.",
        "Order History — past orders (ITR# for consignment, SO# for outright) with ordered and approved quantities and amounts, date, and who last updated the request.",
      ],
    },
    {
      title: "Create a branch order",
      bullets: [
        "Create order opens a wide workspace: dealer, branch, optional brand, and notes on the left; models on the right. Leave brand empty to see every model at the branch, or pick a brand to narrow the list.",
        "Additional item sits to the right of the filters. On a special order it opens a search window for active models that are not already on the sheet. On a manual order it opens a separate special order and does not add those lines here.",
        "Enter a branch quantity of 1 or more to include a model. Manual starts at 0; Auto replenish starts from the suggested quantity. Full shelves stay visible but stay locked on Manual and Auto replenish.",
        "Manual and Auto replenish extras come from other planogram models at the branch. Special can add an extra item that is not on the planogram.",
      ],
    },
    {
      title: "Order types & review",
      bullets: [
        "Manual — create the order → Pending SP (Team Leader may optionally edit) → Supply Planning approval.",
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
