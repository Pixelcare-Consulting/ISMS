import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const OFFICIAL_SALES_PAGE_TUTORIAL: PageTutorialContent = {
  id: "reports-official-sales",
  triggerLabel: "Open Official Sales tutorial",
  dialogTitle: "Official Sales — quick guide",
  dialogDescription:
    "Stage dealer sales from a template, review rows, then process sales or returns.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Upload dealer DR files into a staging table, check each row, then process SALE (stock sold) or RETURN (stock back) per serial.",
    },
    {
      title: "How to use it",
      bullets: [
        "Download Template for the correct Excel columns, fill it in, then Upload sales to stage rows.",
        "Review staging status and open View details for the full sale fields on a row.",
        "Process pending to apply SALE or RETURN for rows that are ready; a progress window shows each step.",
        "Delete pending or failed rows (single or selected) when you need to clear mistakes — successfully processed rows stay protected.",
        "Use Show all columns when you need the extra dealer-template fields in the table.",
      ],
    },
    {
      title: "Tip",
      description:
        "Fix or delete error rows before processing again. Sales & ATR is for day-to-day branch encode; this page is for bulk dealer-template staging.",
    },
  ],
};
