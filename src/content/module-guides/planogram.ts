import type { ModuleGuideContent } from "@/content/module-guides/types";

export const PLANOGRAM_MODULE_GUIDE: ModuleGuideContent = {
  title: "Planogram",
  description:
    "See which branches have a shelf plan, then set authorized SKUs, shelf capacity, and minimum inventory levels (MIL).",
  tips: [
    { label: "Click the cards to list branches with a planogram, none yet, stock below shelf max, or past MIL — click the same card again or Total branches to clear" },
    { label: "Each row shows SKUs, how many are below max, and MIL — Open a branch to add, edit, or remove one SKU" },
    { label: "Use Import for many branches at once: download the template, then upload the same file to preview and apply" },
    { label: "Each import row is a branch SAP code plus a SKU, with shelf max and optional MIL days (blank = 30)" },
    { label: "SKUs must already exist — this file does not create products" },
    { label: "Use Planning to set period and revenue targets, not this page" },
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
