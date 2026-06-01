export interface PermissionActionOption {
  value: string;
  label: string;
}

export interface AppModule {
  id: string;
  name: string;
  route: string | null;
  slugPrefix: string;
  description?: string;
  /** Permission slug that gates sidebar access to this module */
  navPermission?: string;
  actions: PermissionActionOption[];
}

export const appModules: AppModule[] = [
  {
    id: "dashboard",
    name: "Dashboard",
    route: "/dashboard",
    slugPrefix: "dashboard",
    // navPermission: "dashboard.manage",
    description: "Main overview and module launcher",
    actions: [
      { value: "manage", label: "Manage" },
      { value: "view", label: "View" },
    ],
  },
  {
    id: "company",
    name: "Company Settings",
    route: "/settings/company",
    slugPrefix: "company",
    description: "Tenant branding and company profile",
    actions: [{ value: "manage", label: "Manage" }],
  },
  {
    id: "users",
    name: "Users",
    route: "/settings/users",
    slugPrefix: "users",
    navPermission: "users.manage",
    description: "Team members and assignments",
    actions: [{ value: "manage", label: "Manage" }],
  },
  {
    id: "roles",
    name: "Roles",
    route: "/settings/roles",
    slugPrefix: "roles",
    navPermission: "roles.manage",
    description: "Role and permission matrix",
    actions: [{ value: "manage", label: "Manage" }],
  },
  {
    id: "policies",
    name: "Policies",
    route: "/policies",
    slugPrefix: "policies",
    navPermission: "policies.view",
    description: "ISMS policy documents",
    actions: [
      { value: "view", label: "View" },
      { value: "create", label: "Create" },
      { value: "approve", label: "Approve" },
    ],
  },
  {
    id: "audits",
    name: "Audits",
    route: null,
    slugPrefix: "audits",
    description: "Internal audit workflows",
    actions: [
      { value: "create", label: "Create" },
      { value: "close", label: "Close" },
    ],
  },
  {
    id: "reports",
    name: "Reports",
    route: null,
    slugPrefix: "reports",
    description: "Compliance and management reports",
    actions: [{ value: "view", label: "View" }],
  },
  {
    id: "branches",
    name: "Branches",
    route: "/settings/branches",
    slugPrefix: "branches",
    navPermission: "branches.manage",
    description: "Dealer branch locations and delivery schedules",
    actions: [{ value: "manage", label: "Manage" }],
  },
  {
    id: "master_data",
    name: "Master Data",
    route: "/settings/master-data/brands",
    slugPrefix: "master_data",
    navPermission: "master_data.manage",
    description: "Brands, categories, and product models",
    actions: [{ value: "manage", label: "Manage" }],
  },
  {
    id: "status_settings",
    name: "Status Settings",
    route: "/settings/status",
    slugPrefix: "status_settings",
    navPermission: "status_settings.manage",
    description: "Reason/Status codes for inventory, logistics, and pull-outs",
    actions: [{ value: "manage", label: "Manage" }],
  },
  {
    id: "aors",
    name: "Areas of Responsibility",
    route: "/settings/aors",
    slugPrefix: "aors",
    navPermission: "aors.manage",
    description: "User scope by branch or warehouse",
    actions: [{ value: "manage", label: "Manage" }],
  },
  {
    id: "inventory",
    name: "Inventory",
    route: "/inventory",
    slugPrefix: "inventory",
    navPermission: "inventory.view",
    description: "Serialized branch inventory (AOR-scoped)",
    actions: [
      { value: "view", label: "View" },
      { value: "manage", label: "Manage" },
    ],
  },
  {
    id: "orders",
    name: "Branch Orders",
    route: "/orders",
    slugPrefix: "orders",
    navPermission: "orders.view",
    description: "Branch ordering and approval workflow",
    actions: [
      { value: "view", label: "View" },
      { value: "create", label: "Create" },
      { value: "approve", label: "Approve" },
    ],
  },
  {
    id: "logistics",
    name: "Logistics",
    route: "/logistics",
    slugPrefix: "logistics",
    navPermission: "logistics.manage",
    description: "Delivery, transfer, and pull-out",
    actions: [{ value: "manage", label: "Manage" }],
  },
  {
    id: "sales",
    name: "Sales",
    route: "/sales",
    slugPrefix: "sales",
    navPermission: "sales.create",
    description: "Branch sales and ATR status",
    actions: [{ value: "create", label: "Create" }],
  },
  {
    id: "forecast",
    name: "Planning & Forecast",
    route: "/settings/planning",
    slugPrefix: "forecast",
    navPermission: "forecast.manage",
    description: "Forecast upload, allocation, and suggested orders",
    actions: [{ value: "manage", label: "Manage" }],
  },
  {
    id: "planogram",
    name: "Planogram",
    route: "/settings/planogram",
    slugPrefix: "planogram",
    navPermission: "planogram.view",
    description: "Branch authorized SKUs, shelf capacity, and MIL thresholds",
    actions: [
      { value: "view", label: "View" },
      { value: "manage", label: "Manage" },
    ],
  },
];

export function getAppModuleById(id: string): AppModule | undefined {
  return appModules.find((module) => module.id === id);
}

export function getAppModuleBySlugPrefix(prefix: string): AppModule | undefined {
  return appModules.find((module) => module.slugPrefix === prefix);
}

export function composePermissionSlug(moduleId: string, action: string): string {
  const appModule = getAppModuleById(moduleId);
  if (!appModule) {
    throw new Error("Unknown module");
  }

  return `${appModule.slugPrefix}.${action}`;
}

export function parsePermissionSlug(slug: string): {
  module: AppModule | null;
  action: string | null;
} {
  const dotIndex = slug.indexOf(".");
  if (dotIndex === -1) {
    return { module: null, action: null };
  }

  const prefix = slug.slice(0, dotIndex);
  const action = slug.slice(dotIndex + 1);

  return {
    module: getAppModuleBySlugPrefix(prefix) ?? null,
    action: action || null,
  };
}

export function getModuleNavPermission(moduleId: string): string | undefined {
  return getAppModuleById(moduleId)?.navPermission;
}

export function formatPermissionName(appModule: AppModule, action: string): string {
  const actionLabel =
    appModule.actions.find((item) => item.value === action)?.label ??
    action.charAt(0).toUpperCase() + action.slice(1);

  return `${actionLabel} ${appModule.name}`;
}

export function isValidModuleAction(moduleId: string, action: string): boolean {
  const appModule = getAppModuleById(moduleId);
  if (!appModule) {
    return false;
  }

  return appModule.actions.some((item) => item.value === action);
}
