import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const INVENTORY_PAGE_TUTORIAL: PageTutorialContent = {
  id: "inventory-stock-units",
  triggerLabel: "Open inventory tutorial",
  dialogTitle: "Inventory — quick guide",
  dialogDescription:
    "Serialized branch stock scoped by your areas of responsibility.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Stock units lists each physical serial at a branch. Use it to look up stock, spot exceptions, and open a unit for detail. Lists follow your areas of responsibility (AOR).",
    },
    {
      title: "Off planogram — what it means",
      description:
        "Planogram is the list of SKUs a branch is allowed to carry (set under Settings → Planogram). Inventory only reads that list for the badge.",
      bullets: [
        "On planogram — this unit’s model (SKU) is listed for that branch.",
        "Off planogram — that SKU is not on the branch’s planogram. It does not mean the unit is missing, in the backroom, or sold.",
        "Status (Stock / Sold / etc.) is separate from the planogram badge.",
        "If many rows are Off planogram, the branch’s authorized SKUs may be incomplete or outdated in Settings → Planogram.",
        "Turn on Off-planogram only to list just those exception units.",
      ],
    },
    {
      title: "Table columns",
      bullets: [
        "Branch — location holding the unit (hidden when you are already inside one branch).",
        "Model — SKU code and product name for this serial.",
        "Serial — unique serial number for the unit.",
        "DR# — delivery / receipt reference when the unit arrived (— if none).",
        "DR DATE — date on that delivery reference (— if none).",
        "Planogram — On planogram or Off planogram for this branch + SKU (see above).",
        "Aging in days — how long the unit has been aging (click the header to sort).",
        "Status — life-cycle label for the unit (this list shows Stock units).",
      ],
    },
    {
      title: "Series summary & filters",
      bullets: [
        "Series summary groups QTY and peso value by SKU series. It starts collapsed — click the header to expand, or use View series for a searchable list.",
        "This page shows Stock (STK) units only. Sold and other statuses appear in Sales & ATRs or Logistics.",
        "Search by serial, SKU, or branch. Use Off-planogram only for planogram exceptions.",
        "Click a row to open serial-level detail.",
      ],
    },
    {
      title: "Related work",
      description:
        "Receive, transfer, and pull-out happen in Operations and Logistics. Use Stock count (P-Count) for physical counts. Keep planograms current under Settings so On / Off badges stay meaningful.",
    },
  ],
};
