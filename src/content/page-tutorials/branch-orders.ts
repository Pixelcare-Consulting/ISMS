import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const BRANCH_ORDERS_PAGE_TUTORIAL: PageTutorialContent = {
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
        "Branch orders move stock from planning and approval into logistics delivery. Each row is one order with its current workflow status.",
    },
    {
      title: "Order types",
      bullets: [
        "Auto replenish — system-suggested quantities; Team Leader then Supply Planning.",
        "Manual — Product Specialist review, then Team Leader, then Supply Planning.",
        "Special — Team Leader creates; Supply Planning approves.",
      ],
    },
    {
      title: "Review & approve",
      bullets: [
        "Click Review on pending orders when it is your role’s turn (PS, TL, or SP).",
        "If Review is disabled, hover the button to see who must act next.",
        "Supply Planning can adjust approved quantities and optional delivery date on final approval.",
      ],
    },
    {
      title: "After approval",
      description:
        "Approved orders queue logistics delivery. Branch staff accept stock under Operations when shipments arrive.",
      bullets: [
        "Use Suggested orders under Planning for bulk auto-replenish drafts.",
        "Use Create order for one-off manual or special requests.",
      ],
    },
  ],
};
