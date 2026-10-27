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
        "A delivery opens when Supply Planning approves an order and ISMS posts its ITR (consignment) or SO (outright) to SAP. Dispatch happens in SAP, not here.",
    },
    {
      title: "How to use it",
      bullets: [
        "Save the waybill, courier, and schedule date on the delivery.",
        "In SAP, use Copy To on the ITR (to an Inventory Transfer) or the SO (to a Delivery) and pick the serials.",
        "ISMS checks SAP about every 10 minutes. The serials then appear on the delivery as in transit, and the SAP section shows the IT or DR number.",
        "If the SAP section says a document needs review or was not applied yet, it names the reason (for example a serial ISMS already has elsewhere).",
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
