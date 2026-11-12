import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const PULLOUTS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "logistics-pullouts",
  triggerLabel: "Open pull-outs tutorial",
  dialogTitle: "Pull-outs & pickups — quick guide",
  dialogDescription:
    "Take units out of a branch through Team Lead approval and Logistics.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Pull-outs take units out of a branch. Flow: branch requests → TL approves → Logistics saves the list → Logistics sends it. Sending is the last step.",
    },
    {
      title: "How to use it",
      bullets: [
        "Choose Stock (STK) or Defective (DEF), then add the units and their details.",
        "Team Lead approves or deletes each unit, or approves them all.",
        "After approval, Logistics enters the waybill and schedule and saves the list.",
        "Send puts every unit in transit (DIT) and ends the pull-out. Sent units no longer count in Branch Inventory.",
      ],
    },
    {
      title: "Tip",
      description:
        "Keep reason/status codes current under Settings so pull-out forms stay consistent.",
    },
  ],
};
