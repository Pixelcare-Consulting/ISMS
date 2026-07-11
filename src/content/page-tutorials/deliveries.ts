import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const DELIVERIES_PAGE_TUTORIAL: PageTutorialContent = {
  id: "logistics-deliveries",
  triggerLabel: "Open deliveries tutorial",
  dialogTitle: "Deliveries — quick guide",
  dialogDescription:
    "Plan inbound movement from approved orders; branches confirm receipt.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Deliveries sync from approved orders (SAP ITR/SO). Logistics schedules inbound movement; branch PS accepts DIT → Stock in Operations.",
    },
    {
      title: "How to use it",
      bullets: [
        "Create or update delivery records tied to approved orders.",
        "Assign schedule, carrier notes, and expected arrival windows.",
        "Branch staff accept in Operations and resolve shortages before closing lines.",
      ],
    },
    {
      title: "Related pages",
      description:
        "Branch orders must be fully approved before logistics fulfillment. Use Operations for branch acceptance.",
    },
  ],
};
