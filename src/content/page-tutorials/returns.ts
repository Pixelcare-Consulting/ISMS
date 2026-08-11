import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const RETURNS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "returns",
  triggerLabel: "Open returns tutorial",
  dialogTitle: "Returns / Replacement — quick guide",
  dialogDescription:
    "Track and finish customer returns for branch and service center sales.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "After someone requests a return from a sale’s View details, use this page to evaluate, approve, reject, or restore stock. Branch, Service, and Approvals tabs keep the queues organized.",
    },
    {
      title: "How to use it",
      bullets: [
        "Open Sales (or Service Center Sales), View details on the sale, and choose Request return with a reason.",
        "On Branch Returns, open View details to evaluate (CS), approve (TL), reject, or restore stock when your role allows.",
        "On Service Returns, use the action buttons on each row for the same steps on service center sales.",
        "Approvals shows branch and service returns that still need CS, TL, or restore — handy for operators clearing the queue.",
      ],
    },
    {
      title: "Related pages",
      description:
        "Encode sales under Sales. Official Sales is Accounting’s dealer-template path and is not a customer return.",
    },
  ],
};
