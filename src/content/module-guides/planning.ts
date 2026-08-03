import type { ModuleGuideContent } from "@/content/module-guides/types";

export const PLANNING_MODULE_GUIDE: ModuleGuideContent = {
  title: "Planning & Forecast",
  description:
    "Import forecast data, run shelf allocation against planogram capacity, and generate suggested auto-replenish drafts for branches.",
  tips: [
    { label: "Refresh forecast inputs before running allocation" },
    { label: "Review drafts under Suggested orders before TL / SP approval" },
    { label: "Keep planograms current so gaps and suggestions stay accurate" },
  ],
  storageKey: "module-guide.planning",
};

/** Own short strip for Suggested orders — related to planning, not identical. */
export const SUGGESTED_ORDERS_MODULE_GUIDE: ModuleGuideContent = {
  title: "Suggested orders",
  description:
    "Draft auto-replenish requests from allocation gaps. They are not live branch orders until you submit them into the approval path.",
  tips: [
    { label: "Review draft lines and gaps by branch before submitting" },
    { label: "Submit for TL review, then SP approval on Branch orders" },
    { label: "Regenerate from Planning after forecast or planogram changes" },
  ],
  storageKey: "module-guide.suggested-orders",
};
