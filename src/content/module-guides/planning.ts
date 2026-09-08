import type { ModuleGuideContent } from "@/content/module-guides/types";

export const PLANNING_MODULE_GUIDE: ModuleGuideContent = {
  title: "Planning & Forecast",
  description:
    "Import the official Forecast template (period, branch SAP code, revenue target), run shelf allocation against planogram capacity, and generate suggested auto-replenish drafts for branches.",
  tips: [
    { label: "Download the Forecast template, then upload the same file to preview and apply" },
    { label: "Each row is one branch for a single planning period, with a revenue target" },
    { label: "Shelf max and MIL stay on Planogram — this file does not change the shelf plan" },
    { label: "Review drafts under Suggested orders before TL / SP approval" },
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
