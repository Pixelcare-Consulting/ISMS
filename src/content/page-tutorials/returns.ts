import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const RETURNS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "returns",
  triggerLabel: "Open returns tutorial",
  dialogTitle: "Returns / Replacement — quick guide",
  dialogDescription:
    "Track and finish customer returns and replacements for branch and service center sales.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "After someone submits Process Return from a sale’s View details, use this page to evaluate, approve, reject, restore stock, or complete a replacement. Branch, Service, and Approvals tabs keep the queues organized.",
    },
    {
      title: "How to use it",
      bullets: [
        "Open Sales, View details, and choose Request return to open Process Return (document type, STK/DEF, problems, then Return or Replacement).",
        "On Branch Returns, download ATR/ODRF when available, then use Return (restore) or Replacement (Same/New Invoice) when the request is approved.",
        "On Service Returns, use the action buttons on each row for the same steps on service center sales.",
        "Approvals shows branch and service returns that still need CS, TL, restore, or replacement — handy for operators clearing the queue.",
      ],
    },
    {
      title: "Related pages",
      description:
        "Encode sales under Sales. Official Sales is Accounting’s dealer-template path and is not a customer return.",
    },
  ],
};
