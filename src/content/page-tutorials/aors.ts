import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const AORS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "settings-aors",
  triggerLabel: "Open areas of responsibility tutorial",
  dialogTitle: "Areas of responsibility — quick guide",
  dialogDescription:
    "Map users to branches (and warehouses) so inventory and ops stay scoped.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "AORs assign people to branches (and optionally warehouses). Inventory lists and many ops screens filter by these assignments so users only see their network.",
    },
    {
      title: "How to use it",
      bullets: [
        "Assignments are stored per branch; the table groups by user so you see every branch in one place.",
        "Create Branches and Users first, then attach AORs.",
        "White-trigger / suggest flows use AORs to know which branches a user can act on.",
      ],
    },
    {
      title: "Next steps",
      description:
        "After AORs are set, verify Inventory and Orders show the expected branches for each role.",
    },
  ],
};
