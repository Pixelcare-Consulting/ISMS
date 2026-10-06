import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const MONTHLY_SIR_PAGE_TUTORIAL: PageTutorialContent = {
  id: "inventory-monthly-sir",
  triggerLabel: "Open Monthly SIR tutorial",
  dialogTitle: "Monthly SIR — quick guide",
  dialogDescription:
    "Request, scan, review, and upload a branch physical count using the guided P-COUNT workbook.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "Typical flow",
      bullets: [
        "Submit a Monthly SIR request for the branch and wait for approval.",
        "Scan serials with a barcode scanner and build the filled Excel file.",
        "Review the file and upload it through Upload P-COUNT. Scanning never uploads automatically.",
        "Generate the variance workbook, then open P-Count to investigate and finish the count.",
      ],
    },
    {
      title: "Using the scanner",
      description:
        "Keep the serial field focused and scan one barcode at a time. The scanner submits each value with Enter. Duplicates and serials that are not in the catalog are clearly marked and excluded from the filled file.",
    },
    {
      title: "Alternative",
      description:
        "Download the empty template when you need to complete P-COUNT manually. Both paths use the same Upload P-COUNT review and variance process.",
    },
  ],
};
