import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const POLICIES_PAGE_TUTORIAL: PageTutorialContent = {
  id: "policies-list",
  triggerLabel: "Open policies tutorial",
  dialogTitle: "Policies — quick guide",
  dialogDescription:
    "Controlled ISMS document lifecycle from draft to publication.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Policies are controlled documents for ISMS compliance. Owners draft and revise; approvers publish; most users consume the active version.",
    },
    {
      title: "Lifecycle",
      bullets: [
        "Create a draft with title, scope, owner, and target effective date.",
        "Attach supporting files if required, then submit for review.",
        "Approver publishes; readers open the approved document from this list.",
      ],
    },
    {
      title: "Access",
      description:
        "View-only users see approved policies. Create and approve actions require the matching permissions on your role.",
    },
  ],
};
