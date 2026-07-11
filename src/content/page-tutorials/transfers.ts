import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const TRANSFERS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "logistics-transfers",
  triggerLabel: "Open transfers tutorial",
  dialogTitle: "Transfers — quick guide",
  dialogDescription:
    "Move serialized stock between branches with full traceability.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Inter-branch transfers move stock from a source to a destination with serial-level tracking. Typical path: PS requests → TL approves → logistics executes → receiving branch accepts.",
    },
    {
      title: "How to use it",
      bullets: [
        "Initiate transfer with source, destination, and line items.",
        "Source branch releases when dispatch is confirmed.",
        "Destination branch receives in Operations and validates serials.",
      ],
    },
    {
      title: "Reporting",
      description:
        "Use the Transfers report to reconcile in-transit and completed moves.",
    },
  ],
};
