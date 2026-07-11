import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const PLANNING_PAGE_TUTORIAL: PageTutorialContent = {
  id: "settings-planning",
  triggerLabel: "Open planning tutorial",
  dialogTitle: "Planning & forecast — quick guide",
  dialogDescription:
    "Run shelf allocation and generate suggested auto-replenish orders.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Planning imports forecast data, runs shelf allocation against planogram capacity, and produces suggested auto-replenish drafts for branches.",
    },
    {
      title: "How to use it",
      bullets: [
        "Import or refresh forecast inputs before running allocation.",
        "Generate suggested orders, then review them under Planning → Suggested orders.",
        "Branch orders still go through TL / SP approval after suggestions become real orders.",
      ],
    },
    {
      title: "Related pages",
      bullets: [
        "Planogram — authorized SKUs and MIL thresholds per branch.",
        "Suggested orders — bulk review of auto-replenish drafts.",
        "Branch orders — approval and logistics handoff.",
      ],
    },
  ],
};
