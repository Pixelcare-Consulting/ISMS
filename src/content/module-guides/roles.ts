import type { ModuleGuideContent } from "@/content/module-guides/types";

export const ROLES_MODULE_GUIDE: ModuleGuideContent = {
  title: "Roles",
  description:
    "Group permissions into job-shaped access. Users inherit everything attached to their role — prefer least privilege.",
  tips: [
    { label: "Toggle access in plain language, then assign roles under Users" },
    { label: "Use the permission matrix for a module × action view" },
    { label: "If a menu item is missing, check the person’s role first" },
  ],
  storageKey: "module-guide.roles",
};

export const ROLES_MATRIX_MODULE_GUIDE: ModuleGuideContent = {
  title: "Permission matrix",
  description:
    "Pick a role, then toggle access by module and action. On phones this uses cards; on desktop you get the full matrix.",
  tips: [
    { label: "Search to find a module or action quickly" },
    { label: "Built-in system roles may be hidden for tenant admins" },
  ],
  storageKey: "module-guide.roles.matrix",
};
