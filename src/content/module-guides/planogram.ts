import type { ModuleGuideContent } from "@/content/module-guides/types";

export const PLANOGRAM_MODULE_GUIDE: ModuleGuideContent = {
  title: "Planogram",
  description:
    "Define which SKUs a branch may hold, shelf capacity, and minimum inventory levels (MIL). Planning and order enforcement use these limits.",
  tips: [
    { label: "Open a branch to set authorized models, capacity, and MIL" },
    { label: "Keep MIL aligned so auto-replenish suggests sensible quantities" },
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
    { label: "Add or remove models the branch is allowed to carry" },
    { label: "Capacity and MIL feed Planning allocation and suggested orders" },
  ],
  storageKey: "module-guide.planogram",
};
