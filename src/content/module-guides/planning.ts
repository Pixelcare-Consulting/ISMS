import type { ModuleGuideContent } from "@/content/module-guides/types";

export const PLANNING_MODULE_GUIDE: ModuleGuideContent = {
  title: "Planning & Forecast",
  description:
    "Import the SFE forecast for Target Quota, keep planogram and sales history ready, then use Demand Planning to generate and release Auto Replenish to Team Leader.",
  tips: [
    { label: "Before Demand Planning: branches, SKUs, and price list (SRP may be 0 / FREE), planogram per branch, SFE import for the period, and sales history in the Date from–Date to range when you can" },
    { label: "0 SRP means FREE — Import forecast still sets Target Quota to ₱0 and shows a warning; it does not block Apply" },
    { label: "Use the Active period list at the top to switch periods — that period becomes the one used on the dashboard" },
    { label: "Click the cards to jump to Target Quota or Demand Planning (Settings → Planning)" },
    { label: "Target Quota is read-only here — import the SFE sheet to set or update it (forecast qty × price list)" },
    { label: "Download the Forecast template — it lists active branches × planogram SKUs (fill forecast qty), then upload to preview and apply" },
    { label: "Keep Forecast period as text (Dec-25), not an Excel date" },
    { label: "Only a Generated plan can Release. Confirmation lists No history, no Drop 1, and open Auto Replenish for this period before you proceed" },
    { label: "Release sends Auto Replenish straight to Team Leader when Drop 1 > 0; zero Drop 1 or an existing open Auto Replenish for the same period is skipped — other months do not block" },
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
