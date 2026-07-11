import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const SALES_PAGE_TUTORIAL: PageTutorialContent = {
  id: "sales-atr",
  triggerLabel: "Open sales tutorial",
  dialogTitle: "Sales & ATR — quick guide",
  dialogDescription:
    "Branch sales with SN picker, reserved (RSV) flow, and ATR returns.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Record customer sales that update stock and reporting. Supports serial-number picker, reserved (RSV) sales, and BranchReturnRequest ATR workflow.",
    },
    {
      title: "How to use it",
      bullets: [
        "Start a new sale for the branch and add line items (serials per tenant rules).",
        "Verify totals before submit; RSV holds stock until the sale completes.",
        "Use ATR return requests when product must come back through the return path.",
      ],
    },
    {
      title: "Related pages",
      description:
        "Review the Sales report for period close. Inventory shows resulting unit status after sales post.",
    },
  ],
};
