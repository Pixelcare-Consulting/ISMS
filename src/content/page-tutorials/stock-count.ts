import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const STOCK_COUNT_PAGE_TUTORIAL: PageTutorialContent = {
  id: "inventory-stock-count",
  triggerLabel: "Open stock count tutorial",
  dialogTitle: "Stock count (P-Count) — quick guide",
  dialogDescription:
    "Physical count sessions to align system stock with what is on the shelf.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Stock count runs structured P-Count sessions: branch STK, PS scan, variance report, TL investigation, and SAP adjustment handoff.",
    },
    {
      title: "Typical flow",
      bullets: [
        "Create a session for the branch and scope.",
        "Count units, enter quantities, and note discrepancies.",
        "Submit for review; approvers validate large variances.",
        "Finalize accepted adjustments and close the session for audit lock.",
      ],
    },
    {
      title: "Tip",
      description:
        "Do not reopen closed sessions — start a new session for recounts. Use Stock units for serial lookup outside a count cycle.",
    },
  ],
};
