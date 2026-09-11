import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const PLANOGRAM_PAGE_TUTORIAL: PageTutorialContent = {
  id: "settings-planogram",
  triggerLabel: "Open planogram tutorial",
  dialogTitle: "Planogram — quick guide",
  dialogDescription: "Find branches with or without a shelf plan, then assign authorized SKUs.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Planogram is the ISMS shelf plan: which SKUs a branch may hold. Planning and order limits still use stored shelf values. It is not a SAP document.",
    },
    {
      title: "How to use it",
      bullets: [
        "Click the cards to filter the list: branches with a planogram or none yet (empty). Total branches shows everyone. Click the same card again to clear the filter.",
        "Each branch row shows how many SKUs it has. Open a branch to add or remove a SKU. Add model needs Allowed models first — if that list is empty, you get a shortcut to open it.",
        "Use Import → Download template when you need to assign SKUs to many branches at once (branch SAP code and SKU). The download is filled with your current rows.",
        "SKUs and branches must already exist from Models, Branches, or SAP. The template does not create new products. Upload that same file to preview creates and updates. Rows you leave out stay as they are.",
        "Forecast uses the official template on Planning — do not upload that file here.",
      ],
    },
    {
      title: "Next steps",
      description:
        "After planograms are current, run Planning allocation and review Suggested orders before approval on Branch orders.",
    },
  ],
};
