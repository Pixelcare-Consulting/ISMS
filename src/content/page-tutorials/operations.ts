import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const OPERATIONS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "ops-operations",
  triggerLabel: "Open operations tutorial",
  dialogTitle: "Operations — quick guide",
  dialogDescription:
    "Branch hub for delivery acceptance, transfers, and pull-outs.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Operations is where branch staff execute movement after logistics plans it — accept deliveries, confirm transfers, and release pull-outs.",
    },
    {
      title: "Tabs to use daily",
      bullets: [
        "Deliveries — accept inbound shipments against open delivery records.",
        "Transfers — confirm send or receive steps for your branch.",
        "Pull-outs — complete release when logistics schedules pickup.",
      ],
    },
    {
      title: "Related pages",
      description:
        "Logistics owns scheduling and planning; Orders owns replenishment approvals. Come here when goods physically move at the branch.",
    },
  ],
};
