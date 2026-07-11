import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const USERS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "settings-users",
  triggerLabel: "Open users tutorial",
  dialogTitle: "Users — quick guide",
  dialogDescription: "Invite and manage people in your organization.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Users are tenant accounts with roles and optional departments. Access to modules comes from the roles you assign here.",
    },
    {
      title: "How to use it",
      bullets: [
        "Create or edit a user, then assign at least one role and department when your process requires it.",
        "You cannot remove or lock yourself out of critical admin access from this screen.",
        "If someone cannot open a module, verify role permissions before changing URLs.",
      ],
    },
    {
      title: "Setup order",
      description:
        "Recommended for new tenants: Company → Departments → Roles → Users → Branches / warehouses → master data.",
    },
  ],
};
