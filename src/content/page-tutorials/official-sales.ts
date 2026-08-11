import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const OFFICIAL_SALES_PAGE_TUTORIAL: PageTutorialContent = {
  id: "reports-official-sales",
  triggerLabel: "Open Official Sales tutorial",
  dialogTitle: "Official Sales — quick guide",
  dialogDescription:
    "Stage dealer sales from a template, review rows, then process by Action Key.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Upload dealer files into a staging table, check each row, then process using the Action Key: ADD (branch official sold), WHSE_ADD (from warehouse), or DEL (reverse and restore stock).",
    },
    {
      title: "How to use it",
      bullets: [
        "Download Template for the correct Excel columns (sample rows show ADD, DEL, and WHSE_ADD), fill it in, then Upload sales to stage rows.",
        "Review staging status and open View details for the full sale fields on a row — Branch name and Action Key must be set before process.",
        "Process pending applies the Action Key for each ready row; a progress window shows each step. Results describe the path (for example ADD — Official Sold or DEL — restored STK).",
        "Delete pending or failed rows (single or selected) when you need to clear mistakes — successfully processed rows stay protected.",
        "Use Show all columns when you need the extra dealer-template fields in the table.",
      ],
    },
    {
      title: "Tip",
      description:
        "Action Key drives the outcome — not stock status alone. UPD is not supported here; edit that sale under Sales instead. Day-to-day branch encode stays on Sales; this page is for bulk dealer-template official sales.",
      bullets: [
        "Units marked For pull-out or in an open pull-out cannot be ADD'd — finish or cancel the pull-out first.",
        "Demo warehouse serials SN-WHSE-001…003 (Pasig Main) are available for WHSE_ADD after warehouse seed — use Branch Sold Western Makati with the template sample.",
        "ADD and WHSE_ADD fill model price from the price list for that model, package, and transaction date (or the latest price if no period covers the date).",
      ],
    },
  ],
};
