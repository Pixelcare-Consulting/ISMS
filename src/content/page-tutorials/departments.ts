import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const DEPARTMENTS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "settings-departments",
  triggerLabel: "Open departments tutorial",
  dialogTitle: "Departments — quick guide",
  dialogDescription: "Organize users by department for reporting and assignment.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Departments group people for org structure. Default departments are created when you register a new organization.",
    },
    {
      title: "How to use it",
      bullets: [
        "Add departments that match how your teams work (e.g. Supply Planning, Branch Ops).",
        "Assign users to departments under Settings → Users.",
        "Departments do not replace roles — roles still control module permissions.",
      ],
    },
    {
      title: "Next steps",
      description:
        "After departments exist, finish Roles and Users, then configure Branches and Areas of responsibility.",
    },
  ],
};
