import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const PERMISSIONS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "settings-permissions",
  triggerLabel: "Open permissions tutorial",
  dialogTitle: "Permissions — quick guide",
  dialogDescription:
    "How the permission catalog links modules, routes, and role access.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Permissions are the building blocks of access control. Each one keys a module action (view, manage, approve) so roles can grant access without hard-coding routes.",
    },
    {
      title: "Seeing and setting access",
      bullets: [
        "Use this list to understand which access keys exist and which modules they belong to.",
        "To turn access on or off for people, open Settings → Roles (or the Permission matrix) and update the role checklist.",
        "Creating or renaming catalog keys is handled by the platform team — tenant Super Admins assign existing permissions to roles.",
      ],
    },
    {
      title: "Next steps",
      description:
        "Assign permissions to roles under Settings → Roles, then attach roles to users under Settings → Users.",
    },
  ],
};
