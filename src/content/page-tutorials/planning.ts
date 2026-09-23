import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const PLANNING_PAGE_TUTORIAL: PageTutorialContent = {
  id: "settings-planning",
  triggerLabel: "Open planning tutorial",
  dialogTitle: "Planning & forecast — quick guide",
  dialogDescription:
    "Switch the period, review Target Quota from SFE import, run shelf allocation, then confirm generate in the popup.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Planning holds the official forecast for a period — Target Quota per branch comes from your SFE import — then compares shelf capacity to stock. After you run allocation, a popup asks whether to generate suggested auto-replenish drafts.",
    },
    {
      title: "How to use it",
      bullets: [
        "Choose the period from Active period at the top. Switching it makes that period the one used on the dashboard.",
        "Click Total branches to jump to the Target Quota list, and Demand Planning to open runs.",
        "Target Quota is read-only on this page. Use Import forecast with the SFE sheet (period, branch SAP code, SKU, forecast qty) — quotas are calculated from forecast qty × price list. 0 SRP means FREE; Target Quota may be ₱0 and import still continues with a warning.",
        "Shelf max and MIL stay on Settings → Planogram. Have planogram, SFE for the period, and sales history ready before Demand Planning.",
        "Run allocation. In the popup, generate suggested orders or skip. After Demand Planning Release, confirm the branch warnings, then Auto Replenish orders go straight to Team Leader — open Auto Replenish to approve. Branch orders still go through TL / SP approval.",
      ],
    },
    {
      title: "Related pages",
      bullets: [
        "Planogram — authorized SKUs and MIL thresholds per branch.",
        "Demand Planning — generate and release runs from Settings → Planning.",
        "Auto Replenish — orders from Release wait for Team Leader, then Supply Planning.",
        "Branch orders — approval and logistics handoff.",
      ],
    },
  ],
};
