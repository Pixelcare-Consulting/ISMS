import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const STATUS_SETTINGS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "settings-status",
  triggerLabel: "Open status settings tutorial",
  dialogTitle: "Status settings — quick guide",
  dialogDescription:
    "Lookup tables that power inventory and logistics badges. Each tab is a different module.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Manage the codes and display names used across Stock units and Logistics. System codes ship with the product — you can deactivate them but not delete them. Custom codes can be added per group.",
    },
    {
      title: "Which tab is for which module?",
      bullets: [
        "Inventory system status — Stock units / serial life-cycle (STK, DIT, SLD, RSV, DEF, FPO).",
        "Pull-out reason — why a pull-out was requested (Logistics → Pull-outs forms).",
        "Delivery workflow — Logistics → Deliveries (requested → accepted / rejected / partial).",
        "Transfer workflow — Logistics → Transfers (draft, pending TL, in transit, completed…).",
        "Pull-out workflow — Logistics → Pull-outs progress (reserve, schedule, in transit, pulled out…).",
      ],
    },
    {
      title: "Badge colors",
      bullets: [
        "Click a color swatch on a row to choose how that status looks in lists.",
        "Preview updates immediately; Inventory and Logistics badges use the same colors.",
        "Reseed fills empty colors with sensible defaults without overwriting colors you already set.",
      ],
    },
    {
      title: "Active vs Inactive",
      description:
        "Deactivate hides a code from new picks while keeping history. Activate brings it back. The Record column shows Active / Inactive — separate from the workflow badge preview.",
    },
  ],
};
