import type { ModuleGuideContent } from "@/content/module-guides/types";

export const PLANNING_MODULE_GUIDE: ModuleGuideContent = {
  title: "Planning & Forecast",
  description:
    "Pick the planning period, set branch revenue targets, run shelf allocation, then confirm generate in the popup to create suggested auto-replenish drafts.",
  tips: [
    { label: "Use the Active period list at the top to switch periods — that period becomes the one used on the dashboard" },
    { label: "Click the cards to jump to branch targets, allocation gaps, or Suggested orders" },
    { label: "Add, edit, or remove one branch target on this page; use Import forecast when you have many branches to load at once" },
    { label: "Download the Forecast template (period, branch SAP code, revenue target), then upload the same file to preview and apply" },
    { label: "Keep Forecast period as text (Dec-25), not an Excel date" },
    { label: "Shelf max and MIL stay on Planogram — this file does not change the shelf plan" },
    { label: "Run allocation, then Generate or Skip in the popup. Generate opens Suggested orders so you can review drafts before TL / SP approval" },
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
    { label: "To create or refresh drafts, run allocation on Planning and generate from the popup" },
  ],
  storageKey: "module-guide.suggested-orders",
};
