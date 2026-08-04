import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const SALES_PAGE_TUTORIAL: PageTutorialContent = {
  id: "sales-atr",
  triggerLabel: "Open sales tutorial",
  dialogTitle: "Sales & ATR — quick guide",
  dialogDescription:
    "Branch sales with package detail sets, reserved (RSV) flow, and ATR returns.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "List sales one serial line at a time (shared ID and TRN NO. when a sale has multiple units) and run ATR returns. Encode new sales on /sales/new with package detail sets, reserved (RSV) sales, and BranchReturnRequest ATR workflow.",
    },
    {
      title: "How to use it",
      bullets: [
        "Click New transaction, fill the header (stock branch shows area locations with sellable serials), then Add Detail (package qty expands into N sets with model + serial; Model price comes from the price list when available).",
        "Status on each row uses your inventory status colors (TO FOLLOW when a serial is still pending). Open View details to edit a serial line, review proof attachments, or use return actions at the bottom of the details window.",
        "Verify the details total before Save; RSV moves stock to reserved instead of sold.",
        "Use ATR return requests from View details when product must come back through the return path.",
      ],
    },
    {
      title: "Related pages",
      description:
        "Review the Sales report for period close. Inventory shows resulting unit status after sales post.",
    },
  ],
};
