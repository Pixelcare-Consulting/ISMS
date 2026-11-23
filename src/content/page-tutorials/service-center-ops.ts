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
        "Statuses cannot be changed here. Units arrive as DIT through Check SAP on Deliveries, become STK when accepted under Deliveries, and leave through sales and pull-outs.",
        "You only see service centers in your area of responsibility.",
      ],
    },
  ],
};

export const SC_SALES_PAGE_TUTORIAL: PageTutorialContent = {
  id: "service-centers-sales",
  triggerLabel: "Open service sales tutorial",
  dialogTitle: "Service center sales: quick guide",
  dialogDescription:
    "Sales → Service Center tab: branch sales whose Service Return or Service Replacement went to a service center.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this tab is for",
      description:
        "Service centers do not record their own sales. When a CSR requests a Service Return or Service Replacement on a branch sale and picks a service center, the sale is copied here for that service center. The branch sale keeps its own row on the Branch tab.",
    },
    {
      title: "How to use it",
      bullets: [
        "The copy shows Reserve ODRF while the service center has the unit, then Service Returned or Service Replaced when it is finished.",
        "The service center finishes the request under Service → SC Returns and Replacement. The status here and on the branch sale follows it.",
        "A replacement keeps the returned serial on the line; View details shows the new unit next to it.",
        "This tab is read only. Start a new request from the branch sale's View details.",
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
        "Request stock for a service center. Supply Planning approves the order, which posts a SAP Sales Order. When a SAP user copies it to a DR, Check SAP now under Deliveries brings that DR in as a delivery to accept.",
    },
    {
      title: "Creating and approving",
      description:
        "New order asks for the center and SAP customer, then opens the service center Create Order page: enter quantities against what SAP has available in the ordering warehouse (Settings → Ordering policy), plus an optional PO number and SAP project. The order goes to Pending SP. Supply Planning approves or rejects it; approving posts a SAP Sales Order with the defaults from Settings → Ordering policy, and if SAP refuses it, the order stays pending with SAP's reason.",
    },
    {
      title: "Deliveries from SAP",
      description:
        "In SAP, copy the Sales Order to a Delivery (Copy To). Then select Check SAP now under Deliveries: each new DR becomes a delivery there, and its serials show as DIT at the order's location. The DR no. column here shows what has come in; \"Waiting for SAP\" means no DR yet.",
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
        "Select Check SAP now to bring in the DRs SAP users copied from approved SC orders' Sales Orders; each one becomes a delivery here with its serials DIT. Open a delivery to see its progress, units and history, then select Receive: the units you tick become STK at the service center location, and the delivery stays partly received until every unit is in. To send units back, tick them and select Reject, with optional remarks and DEF per unit: confirming posts a SAP Return for the order's customer right away and the units go back to the order's SAP warehouse. A failed SAP post shows under Rejected units, where you can retry it or cancel the reject. If the order named no location and the center has several, choose the receiving location on the delivery first.",
    },
  ],
};

export const SC_PULLOUTS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "service-centers-pullouts",
  triggerLabel: "Open service pull-outs tutorial",
  dialogTitle: "Service center pull-outs: quick guide",
  dialogDescription:
    "Take units out of a service center through Team Lead approval and Logistics.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "Pull-outs take units out of a service center. Flow: service center requests → TL approves → Logistics saves the list → Logistics sends it. After Send, Check SAP marks the units Pulled out once SAP shows them on an IT or Return.",
    },
    {
      title: "How to use it",
      bullets: [
        "Choose Stock (STK) or Defective (DEF), then add the units and their details.",
        "Team Lead approves or deletes each unit, or approves them all.",
        "After approval, Logistics enters the waybill and schedule and saves the list.",
        "Send puts every unit in transit (DIT). Sent units no longer count in Service Center Inventory.",
        "In SAP, put the pull-out no. in the \"Pull Out Number Generated in ISMS\" row field of the IT or Return, then select Check SAP on the pull-out: the units it lists become Pulled out (PO).",
        "A DR copied from that Return back to the service center becomes a delivery under Deliveries the next time you select Check SAP; accept it there.",
      ],
    },
    {
      title: "Tip",
      description:
        "Keep reason/status codes current under Settings so pull-out forms stay consistent.",
    },
  ],
};

export const SC_RETURNS_PAGE_TUTORIAL: PageTutorialContent = {
  id: "service-centers-returns",
  triggerLabel: "Open service returns tutorial",
  dialogTitle: "Service center returns: quick guide",
  dialogDescription:
    "Finish the Service Returns and Service Replacements a CSR sent to your service center.",
  helpHref: "/help",
  helpLinkLabel: "Full Help & Support portal",
  sections: [
    {
      title: "What this page is for",
      description:
        "A CSR requests a Service Return or Service Replacement on a branch sale (Sales → View details → Request Return) and picks your service center. The sale is copied to Sales → Service Center tab, the unit becomes Reserve ODRF in your stock, and the request waits here as Pending SC. You get a notification for each new request.",
    },
    {
      title: "How to use it",
      bullets: [
        "Inspect the returned unit, then open the request from the notification or search by SI, serial or customer.",
        "Service Return: choose the location that receives the unit and Submit Return. The unit goes into your stock as the STK or DEF the CSR chose.",
        "Service Replacement, unit in stock: pick the model and serial from your STK and Replace Unit. The returned unit goes into your stock and the new unit is Sold on the same invoice.",
        "Service Replacement, no unit in stock: Raise Special Order. It follows the service center order flow (approval, SAP, delivery). The request shows Awaiting Stock until you accept that delivery; the unit is then held for it and the request is back to Pending SC.",
        "Reject with a reason when the unit does not qualify. It goes back to the branch with the status it had before the request, the branch sale reopens, and the CSR is notified.",
      ],
    },
  ],
};
