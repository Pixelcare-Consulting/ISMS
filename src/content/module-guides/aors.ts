import type { ModuleGuideContent } from "@/content/module-guides/types";

export const AORS_MODULE_GUIDE: ModuleGuideContent = {
  title: "Areas of responsibility",
  description:
    "Map people to branches, warehouses, and service centers so inventory and ops stay scoped to each user’s network.",
  tips: [
    { label: "Create Branches / Service centers and Users first, then attach AORs" },
    { label: "The table groups by user so every location shows in one place" },
    { label: "Inventory, Sales, and Service screens filter by these assignments" },
  ],
  storageKey: "module-guide.aors",
};
