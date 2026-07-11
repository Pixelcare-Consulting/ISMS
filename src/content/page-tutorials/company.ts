import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const COMPANY_PAGE_TUTORIAL: PageTutorialContent = {
  id: "settings-company",
  triggerLabel: "Open company settings tutorial",
  dialogTitle: "Company settings — quick guide",
  dialogDescription:
    "Branding and tenant profile shown in the app sidebar.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Company settings control your organization name, logo, and ISMS tagline. These appear in the left navigation for everyone in the tenant.",
    },
    {
      title: "How to use it",
      bullets: [
        "Update name and tagline so teams recognize the correct workspace.",
        "Upload a logo that reads clearly at sidebar size.",
        "Only tenant admins (or platform operators) can edit these fields.",
      ],
    },
    {
      title: "Admin setup order",
      description:
        "Start here for new tenants, then Departments, Roles, Users, Branches, warehouses, and master data before enabling planning or SAP.",
    },
  ],
};
