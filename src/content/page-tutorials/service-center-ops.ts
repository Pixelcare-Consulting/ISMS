import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const SC_INVENTORY_PAGE_TUTORIAL: PageTutorialContent = {
  id: "service-centers-inventory",
  triggerLabel: "Open service inventory tutorial",
  dialogTitle: "Service center inventory — quick guide",
  dialogDescription:
    "View serialized stock at your assigned service centers and stock in units for UAT.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Service center inventory is a separate stock ledger from branch inventory. Units show as STK when available to sell or pull out.",
    },
    {
      title: "How to use it",
      bullets: [
        "Filter by status to focus on available (STK) or sold units.",
        "Use Manual stock-in when a serial already exists and you need to place it at a service center location.",
        "Your list is limited to service centers in your area of responsibility.",
      ],
    },
  ],
};

export const SC_SALES_PAGE_TUTORIAL: PageTutorialContent = {
  id: "service-centers-sales",
  triggerLabel: "Open service sales tutorial",
  dialogTitle: "Service center sales & ATR — quick guide",
  dialogDescription:
    "Encode sales from service center stock and run the return (ATR) workflow.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Record a sale from STK stock at a service center location, then request, evaluate, approve, and complete returns to restore stock.",
    },
    {
      title: "How to use it",
      bullets: [
        "New sale picks a center, location, and available serial.",
        "ATR steps mirror branch returns: request → CS evaluate → TL approve → restore to STK.",
        "Rejected returns can be requested again once the sale is open.",
      ],
    },
  ],
};

export const SC_ORDERS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "service-centers-orders",
  triggerLabel: "Open service orders tutorial",
  dialogTitle: "Service center orders — quick guide",
  dialogDescription: "Create and approve manual orders for service centers.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Request stock for a service center. After approval, create a delivery and accept serials into inventory.",
    },
  ],
};

export const SC_DELIVERIES_PAGE_TUTORIAL: PageTutorialContent = {
  id: "service-centers-deliveries",
  triggerLabel: "Open service deliveries tutorial",
  dialogTitle: "Service center deliveries — quick guide",
  dialogDescription:
    "Create deliveries from approved orders and accept serials into service center stock.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Accepting a delivery records serials as backload lines and places them as STK at the service center location.",
    },
  ],
};

export const SC_PULLOUTS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "service-centers-pullouts",
  triggerLabel: "Open service pull-outs tutorial",
  dialogTitle: "Service center pull-outs — quick guide",
  dialogDescription:
    "Reserve, approve, and complete pull-outs against service center inventory.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Pull-outs remove units from the service center ledger when completed. There is no warehouse destination on this flow.",
    },
  ],
};
