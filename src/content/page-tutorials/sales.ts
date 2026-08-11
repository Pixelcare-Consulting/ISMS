import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const SALES_PAGE_TUTORIAL: PageTutorialContent = {
  id: "sales",
  triggerLabel: "Open sales tutorial",
  dialogTitle: "Sales — quick guide",
  dialogDescription:
    "Branch sales with package detail sets, reserved (RSV) flow, and request return from sale details.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Encode and review branch sales (shared ID and TRN NO. when a sale has multiple units). Start a customer return from View details; track open returns under Returns / Replacement.",
    },
    {
      title: "How to use it",
      bullets: [
        "Click New transaction, fill the header (stock branch shows area locations with sellable serials), then Add Detail (package qty expands into N sets with model + serial; Model price comes from the price list when available).",
        "Status on each row uses your inventory status colors (TO FOLLOW when a serial is still pending). Open View details to fill a TO-FOLLOW serial, preview proof, or Request return. Accounting can Edit the transaction header when allowed.",
        "After you request a return, open Returns / Replacement to evaluate, approve, reject, or restore stock by role.",
        "Verify the details total before Save; RSV moves stock to reserved instead of sold.",
      ],
    },
    {
      title: "Related pages",
      description:
        "Returns / Replacement for customer return queues. Review the Sales report for period close. Inventory shows resulting unit status after sales post.",
    },
  ],
};
