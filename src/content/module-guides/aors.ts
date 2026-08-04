import type { ModuleGuideContent } from "@/content/module-guides/types";

export const AORS_MODULE_GUIDE: ModuleGuideContent = {
  title: "Areas of responsibility",
  description:
    "Map people to branches (and optionally warehouses) so inventory and ops stay scoped to each user’s network.",
  tips: [
    { label: "Create Branches and Users first, then attach AORs" },
    { label: "The table groups by user so every branch shows in one place" },
    { label: "Inventory and many ops screens filter by these assignments" },
  ],
  storageKey: "module-guide.aors",
};
