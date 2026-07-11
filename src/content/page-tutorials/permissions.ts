import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const PERMISSIONS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "settings-permissions",
  triggerLabel: "Open permissions tutorial",
  dialogTitle: "Permissions — quick guide",
  dialogDescription:
    "How the global permission catalog links modules, routes, and role access.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Permissions are the building blocks of RBAC. Each permission keys a module action (view, manage, approve) so roles can grant access without hard-coding routes.",
    },
    {
      title: "Creating permissions",
      bullets: [
        "Pick a module when creating a permission so it links to the correct routes and sidebar entries.",
        "Use clear names (e.g. orders.view, inventory.manage) that match how roles will assign them.",
        "Super Admin only — tenant admins manage access via Roles, not this catalog.",
      ],
    },
    {
      title: "Next steps",
      description:
        "After the catalog is ready, assign permissions to roles under Settings → Roles, then attach roles to users.",
    },
  ],
};
