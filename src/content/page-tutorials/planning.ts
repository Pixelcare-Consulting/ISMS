import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const PLANNING_PAGE_TUTORIAL: PageTutorialContent = {
  id: "settings-planning",
  triggerLabel: "Open planning tutorial",
  dialogTitle: "Planning & forecast — quick guide",
  dialogDescription:
    "Switch the period, set branch targets, run shelf allocation, then confirm generate in the popup.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Planning holds the official forecast for a period — a peso target per branch — then compares shelf capacity to stock. After you run allocation, a popup asks whether to generate suggested auto-replenish drafts.",
    },
    {
      title: "How to use it",
      bullets: [
        "Choose the period from Active period at the top. Switching it makes that period the one used on the dashboard.",
        "Click Total branches to jump to the target list, Allocation gaps or Allocation rows to jump to the gap table, and Draft suggestions to open Suggested orders.",
        "Add, edit, or remove one branch revenue target on this page. Select several rows to remove them together.",
        "Use Import forecast → Download template when you need to load or update many branches at once (planning period, branch SAP code, revenue target). Shelf max and MIL stay on Settings → Planogram.",
        "Run allocation. In the popup, generate suggested orders or skip. Review drafts under Suggested orders (next to Add target). Branch orders still go through TL / SP approval after suggestions become real orders.",
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
