import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const ROLES_PAGE_TUTORIAL: PageTutorialContent = {
  id: "settings-roles",
  triggerLabel: "Open roles tutorial",
  dialogTitle: "Roles — quick guide",
  dialogDescription:
    "Create custom roles and choose what people can see and do.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Roles group permissions into job-shaped access (PS, TL, SP, Logistics, branch staff). Users inherit everything attached to their role.",
    },
    {
      title: "How to use it",
      bullets: [
        "Create a custom role, then toggle permissions in plain language.",
        "Super Admins see built-in system roles and can adjust their access; renaming and deleting those roles stay locked.",
        "Prefer least privilege — only grant modules required for the job.",
      ],
    },
    {
      title: "Next steps",
      description:
        "Assign roles under Settings → Users. If a module is missing from someone’s menu, check their role permissions first.",
    },
  ],
};
