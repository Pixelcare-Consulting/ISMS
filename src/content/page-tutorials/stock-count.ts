import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const STOCK_COUNT_PAGE_TUTORIAL: PageTutorialContent = {
  id: "inventory-stock-count",
  triggerLabel: "Open stock count tutorial",
  dialogTitle: "Stock count (P-Count) — quick guide",
  dialogDescription:
    "Physical count sessions aligned with SAP Business One: count first, then post differences.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Run a P-Count like SAP B1 Inventory Counting, then Post differences like Inventory Posting — correct local stock and send a live SAP posting when Service Layer is connected.",
    },
    {
      title: "Typical flow",
      bullets: [
        "Open a session for the branch (system STK snapshot).",
        "Start counting, scan serials (or mark counted). Unexpected serials become surplus.",
        "Complete counting to open missing / surplus variances; investigate or reject as needed.",
        "Post differences to update local stock and queue or send SAP Inventory Posting, then close when everything is resolved.",
      ],
    },
    {
      title: "Tip",
      description:
        "While counting is in progress, those serials are soft-frozen so they cannot move in sales or logistics. Do not reopen closed sessions — start a new session for recounts.",
    },
  ],
};
