import type { ModuleGuideContent } from "@/content/module-guides/types";

export const DELIVERIES_MODULE_GUIDE: ModuleGuideContent = {
  title: "Deliveries",
  description:
    "Inbound movement from approved orders. Logistics schedules shipments; branch staff accept DIT → Stock in Operations.",
  tips: [
    { label: "Tie deliveries to approved branch orders" },
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

export function resolveLogisticsModuleGuide(
  pathname: string,
): ModuleGuideContent {
  if (pathname.startsWith("/logistics/transfers")) {
    return TRANSFERS_MODULE_GUIDE;
  }
  if (pathname.startsWith("/logistics/pickups")) {
    return PULLOUTS_MODULE_GUIDE;
  }
  return DELIVERIES_MODULE_GUIDE;
}
