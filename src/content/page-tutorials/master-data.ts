import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const MASTER_DATA_PAGE_TUTORIAL: PageTutorialContent = {
  id: "settings-master-data",
  triggerLabel: "Open master data tutorial",
  dialogTitle: "Master data — quick guide",
  dialogDescription:
    "Product, geography, sales, service, and operations lookup tables.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this section is for",
      description:
        "Master data powers dropdowns and validation across orders, planograms, branches, dealers, and service workflows. Keep codes and labels consistent with SAP where you integrate.",
    },
    {
      title: "How to navigate",
      bullets: [
        "Use the hub cards or tabs to open brands, models, categories, regions, payment types, and other lookups.",
        "Create rows before they are needed on operational forms — missing lookups block create flows.",
        "This guide opens once for the whole master-data section; use ? anytime to reopen.",
      ],
    },
    {
      title: "Setup tip",
      description:
        "Finish core product and geography tables early in tenant onboarding, then Branches / Dealers / Planogram can reference them cleanly.",
    },
  ],
};
