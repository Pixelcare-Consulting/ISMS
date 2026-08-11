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
        "Use the Sales tab for sale lines (shared ID and TRN NO. when a sale has multiple units) and the Returns tab for the ATR return pipeline when your role includes View returns. Encode new sales on /sales/new with package detail sets and reserved (RSV) sales.",
    },
    {
      title: "How to use it",
      bullets: [
        "Click New transaction, fill the header (stock branch shows area locations with sellable serials), then Add Detail (package qty expands into N sets with model + serial; Model price comes from the price list when available).",
        "On Sales, status on each row uses your inventory status colors (TO FOLLOW when a serial is still pending). Open View details to fill a TO-FOLLOW serial, preview proof, or Request return. Accounting can Edit the transaction header when allowed.",
        "If you can see Returns, switch to that tab to track open and closed return requests with status badges. Use Show all columns when you need amount, ATR, or notes. Open View details for CS evaluate, TL approve, Reject, Restore stock, or Request return when your role allows — return steps are separate from View returns.",
        "Verify the details total before Save; RSV moves stock to reserved instead of sold.",
      ],
    },
    {
      title: "Related pages",
      description:
        "Review the Sales report for period close. Inventory shows resulting unit status after sales post.",
    },
  ],
};
