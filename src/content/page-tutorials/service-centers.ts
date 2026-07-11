import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const SERVICE_CENTERS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "settings-service-centers",
  triggerLabel: "Open service centers tutorial",
  dialogTitle: "Service centers — quick guide",
  dialogDescription:
    "Service center master data and nested locations for future ops workflows.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Service centers hold repair and service locations. Nested locations prepare the catalog for service-related ops as those workflows expand.",
    },
    {
      title: "How to use it",
      bullets: [
        "Maintain accurate center names and codes for reporting.",
        "Add nested locations when your process needs site-level detail.",
        "Access requires service_centers.manage — grant it like other Settings location modules.",
      ],
    },
    {
      title: "Related setup",
      description:
        "Keep Dealers, Branches, and Master data consistent so service centers align with the rest of the network.",
    },
  ],
};
