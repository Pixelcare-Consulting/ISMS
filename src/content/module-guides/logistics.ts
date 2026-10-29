import type { ModuleGuideContent } from "@/content/module-guides/types";

export const DELIVERIES_MODULE_GUIDE: ModuleGuideContent = {
  title: "Deliveries",
  description:
    "Inbound movement from approved orders. Dispatch happens in SAP: copy the order's ITR to an Inventory Transfer, or its SO to a Delivery. ISMS picks it up within about 10 minutes and the units show as in transit; branch staff then accept them in Operations.",
  tips: [
    { label: "Each delivery shows its SAP ITR or SO number to copy from" },
    { label: "A SAP document ISMS could not apply is listed on the delivery with the reason" },
    { label: "Branches accept in Operations and resolve shortages before closing" },
  ],
  storageKey: "module-guide.logistics.deliveries",
};

export const TRANSFERS_MODULE_GUIDE: ModuleGuideContent = {
  title: "Transfers",
  description:
    "Move serialized stock between branches with full serial tracking. Typical path: request → TL approve → logistics → receiving branch accepts.",
  tips: [
    { label: "Source releases when dispatch is confirmed" },
    { label: "Destination validates serials on receipt in Operations" },
  ],
  storageKey: "module-guide.logistics.transfers",
};

export const PULLOUTS_MODULE_GUIDE: ModuleGuideContent = {
  title: "Pull-outs",
  description:
    "Return stock from branch to warehouse. PS creates → TL approves → logistics schedules → branch releases → warehouse validates.",
  tips: [
    { label: "Include a pull-out reason so forms stay consistent" },
    { label: "Branch completes release in Operations after pickup is scheduled" },
  ],
  storageKey: "module-guide.logistics.pullouts",
};

export const UNIT_TRANSFERS_MODULE_GUIDE: ModuleGuideContent = {
  title: "Unit transfers",
  description:
    "Units a branch did not accept from a delivery, for example broken in transit. Approve or delete each line, release, then accept each unit where it arrives.",
  tips: [
    { label: "Create a unit transfer from the delivery receive dialog" },
    { label: "Consignment deliveries post an SAP Inventory Transfer on release" },
    { label: "If that SAP posting fails, use Retry SAP posting on the transfer" },
  ],
  storageKey: "module-guide.logistics.unit-transfers",
};

export function resolveLogisticsModuleGuide(
  pathname: string,
): ModuleGuideContent {
  if (pathname.startsWith("/logistics/delivery-transfers")) {
    return UNIT_TRANSFERS_MODULE_GUIDE;
  }
  if (pathname.startsWith("/logistics/transfers")) {
    return TRANSFERS_MODULE_GUIDE;
  }
  if (pathname.startsWith("/logistics/pickups")) {
    return PULLOUTS_MODULE_GUIDE;
  }
  return DELIVERIES_MODULE_GUIDE;
}
