import type { PageTutorialContent } from "@/components/page-tutorial/types";

export const SC_INVENTORY_PAGE_TUTORIAL: PageTutorialContent = {
  id: "service-centers-inventory",
  triggerLabel: "Open service inventory tutorial",
  dialogTitle: "Service center inventory: quick guide",
  dialogDescription:
    "See serialized stock at the service centers you cover, laid out like Branch Inventory. This page is view only.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Service center stock is kept apart from branch stock. The cards show total, in stock (STK), defective and in transit (DIT) units with their peso value at the price list, else SRP. Sold units are not shown.",
    },
    {
      title: "How to use it",
      bullets: [
        "Pick a series to narrow the cards, the series panel and the service center list.",
        "Open a service center to see its status totals and every unit. Filter by status, model or location, or search a serial.",
        "Open a unit to see its location, DR number, DR date and aging (days since the DR date).",
        "Statuses cannot be changed here. Units arrive as DIT through Check SAP on Orders, become STK when accepted under Deliveries, and leave through sales and pull-outs.",
        "You only see service centers in your area of responsibility.",
      ],
    },
  ],
};

export const SC_SALES_PAGE_TUTORIAL: PageTutorialContent = {
  id: "service-centers-sales",
  triggerLabel: "Open service sales tutorial",
  dialogTitle: "Service center sales — quick guide",
  dialogDescription:
    "Encode sales the same way as branch Sales Transactions, with units sold from service center stock.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Record sales made at a service center. Each sale picks the service center sold and the location whose STK units it sells. These sales stay out of branch sales reports and KPIs.",
    },
    {
      title: "How to use it",
      bullets: [
        "New transaction: pick the service center and location, fill the header, then add package line sets.",
        "Use TO-FOLLOW when the serial is not known yet, then set the real serial later from View details.",
        "Mark a sale Reserved to hold its units as RSV; clearing Reserved sells them (SLD).",
        "Edit header from the list to correct customer, payment, or proof details.",
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
        "Request stock for a service center. Approving posts a SAP Sales Order. When a SAP user copies it to a DR, Check SAP now brings that DR in as a delivery to accept.",
    },
    {
      title: "Creating and approving",
      description:
        "New order asks for the center and SAP customer, then opens the service center Create Order page: enter quantities against what SAP has available in the ordering warehouse (Settings → Ordering policy), plus an optional PO number and SAP project. Approving posts a SAP Sales Order with the defaults from Settings → Ordering policy; if SAP refuses it, the order stays pending with SAP's reason.",
    },
    {
      title: "Deliveries from SAP",
      description:
        "In SAP, copy the Sales Order to a Delivery (Copy To). Then select Check SAP now: each new DR becomes a delivery under Deliveries, and its serials show as DIT at the order's location. The DR no. column shows what has come in; \"Waiting for SAP\" means no DR yet.",
    },
  ],
};

export const SC_DELIVERIES_PAGE_TUTORIAL: PageTutorialContent = {
  id: "service-centers-deliveries",
  triggerLabel: "Open service deliveries tutorial",
  dialogTitle: "Service center deliveries — quick guide",
  dialogDescription:
    "Accept the units SAP delivered into service center stock.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Deliveries come from SAP DRs that Check SAP now (on Orders) found. Accept lists the DR's serials; the ones you accept become STK at the service center location, and the delivery stays partly accepted until every unit is in. If the order named no location, Accept asks for one.",
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
