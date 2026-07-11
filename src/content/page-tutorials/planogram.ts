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
        "Planogram defines which SKUs a branch may hold, shelf capacity, and minimum inventory levels (MIL). Planning and order enforcement use these limits.",
    },
    {
      title: "How to use it",
      bullets: [
        "Open a branch to set authorized models, capacity, and MIL.",
        "Keep MIL aligned with branch policy so auto-replenish suggests sensible quantities.",
        "Dashboard alerts can flag planogram / MIL issues when configured.",
      ],
    },
    {
      title: "Next steps",
      description:
        "After planograms are current, run Planning allocation and review Suggested orders before approval on Branch orders.",
    },
  ],
};
