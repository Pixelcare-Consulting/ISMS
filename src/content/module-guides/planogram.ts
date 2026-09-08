import type { ModuleGuideContent } from "@/content/module-guides/types";

export const PLANOGRAM_MODULE_GUIDE: ModuleGuideContent = {
  title: "Planogram",
  description:
    "Define which SKUs a branch may hold, shelf capacity, and minimum inventory levels (MIL). Download the official template to load or update many branches at once.",
  tips: [
    { label: "Download the Planogram template, then upload the same file to preview and apply" },
    { label: "Each row is a branch SAP code plus a SKU, with shelf max and optional MIL days (blank = 30)" },
    { label: "SKUs must already exist — this file does not create products" },
    { label: "Use Planning → Import forecast for period and revenue targets, not this page" },
    { label: "Add model on a branch needs Allowed models first" },
    { label: "Off-planogram badges on Stock units follow this list" },
  ],
  storageKey: "module-guide.planogram",
};

/** Same guidance on branch detail — shared storage so expand preference carries over. */
export const BRANCH_PLANOGRAM_MODULE_GUIDE: ModuleGuideContent = {
  title: "Branch planogram",
  description:
    "Authorized models, shelf capacity (max qty), and minimum inventory life (MIL) aging rules for this branch.",
  tips: [
    { label: "Add or remove models the branch is allowed to carry — Add model requires Allowed models first" },
    { label: "Capacity and MIL feed Planning allocation and suggested orders" },
    { label: "Bulk updates use Import on Settings → Planogram (official template)" },
  ],
  storageKey: "module-guide.planogram",
};
