import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const PULLOUTS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "logistics-pullouts",
  triggerLabel: "Open pull-outs tutorial",
  dialogTitle: "Pull-outs & pickups — quick guide",
  dialogDescription:
    "Return or pull inventory from branch back through logistics to warehouse.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Pull-outs move stock from branch back to warehouse. Flow: PS creates → TL approves → logistics schedules → branch releases → warehouse validates.",
    },
    {
      title: "How to use it",
      bullets: [
        "Create the request with reason and items.",
        "After TL approval, schedule pickup and coordinate with the branch.",
        "Branch completes release in Operations; warehouse closes receipt.",
      ],
    },
    {
      title: "Tip",
      description:
        "Keep reason/status codes current under Settings so pull-out forms stay consistent.",
    },
  ],
};
