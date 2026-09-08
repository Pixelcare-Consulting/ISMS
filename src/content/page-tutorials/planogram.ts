import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const PLANOGRAM_PAGE_TUTORIAL: PageTutorialContent = {
  id: "settings-planogram",
  triggerLabel: "Open planogram tutorial",
  dialogTitle: "Planogram — quick guide",
  dialogDescription: "Authorized SKUs and MIL thresholds per branch.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Planogram is the ISMS shelf plan: which SKUs a branch may hold, shelf capacity, and minimum inventory life (MIL). Planning and order limits use these values. It is not a SAP document.",
    },
    {
      title: "How to use it",
      bullets: [
        "Use Import → Download template to get a Planogram spreadsheet (branch SAP code, SKU, max qty, MIL days) prefilled with your current rows.",
        "SKUs and branches must already exist from Models, Branches, or SAP. The template does not create new products.",
        "Upload that same file to preview creates and updates. Rows you leave out stay as they are.",
        "Open a branch to add a model, edit max qty or MIL, or remove a SKU one at a time.",
        "Forecast still uses the BRS file on Planning — do not upload that wide spreadsheet here.",
      ],
    },
    {
      title: "Next steps",
      description:
        "After planograms are current, run Planning allocation and review Suggested orders before approval on Branch orders.",
    },
  ],
};
