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
    id: "departments",
    name: "Departments",
    route: "/settings/departments",
    slugPrefix: "departments",
    navPermission: "departments.manage",
    description: "Org departments for user assignment",
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
    route: "/reports",
    slugPrefix: "reports",
    description: "Compliance and management reports",
    actions: [{ value: "view", label: "View" }],
  },
  {
    id: "audit_logs",
    name: "System Logs",
    route: "/audit-logs/system",
    slugPrefix: "audit_logs",
    navPermission: "audit_logs.view",
    description: "System and account activity logs",
    actions: [{ value: "view", label: "View" }],
  },
  {
    id: "serial_logs",
    name: "Serial Number Logs",
    route: "/audit-logs/serial-numbers",
    slugPrefix: "serial_logs",
    navPermission: "serial_logs.view",
    description: "Serial-number lifecycle activity logs",
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
    id: "dealers",
    name: "Dealers",
    route: "/settings/dealers",
    slugPrefix: "dealers",
    navPermission: "dealers.manage",
    description: "Dealer master records and network setup",
    actions: [{ value: "manage", label: "Manage" }],
  },
  {
    id: "service_centers",
    name: "Service centers",
    route: "/settings/service-centers",
    slugPrefix: "service_centers",
    navPermission: "service_centers.manage",
    description: "Service and repair location catalog",
    actions: [{ value: "manage", label: "Manage" }],
  },
  {
    id: "warehouses",
    name: "Warehouses",
    route: "/settings/warehouses",
    slugPrefix: "warehouses",
    navPermission: "warehouses.manage",
    description: "Warehouse and location setup",
    actions: [{ value: "manage", label: "Manage" }],
  },
  {
    id: "sap",
    name: "SAP integration",
    route: "/settings/sap-integration",
    slugPrefix: "sap",
    navPermission: "sap.manage",
    description: "SAP outbound queue and Service Layer settings",
    actions: [{ value: "manage", label: "Manage" }],
  },
  {
    id: "master_data",
    name: "Master Data",
    route: "/settings/master-data",
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
    id: "official_sales",
    name: "Official Sales",
    route: "/reports/official-sales",
    slugPrefix: "official_sales",
    navPermission: "official_sales.view",
    description: "Official sales Excel staging and inventory process",
    actions: [
      { value: "view", label: "View" },
      { value: "manage", label: "Manage" },
    ],
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
  {
    id: "announcements",
    name: "Announcements",
    route: "/announcements",
    slugPrefix: "announcements",
    navPermission: "announcements.view",
    description: "Tenant announcements and dashboard banners",
    actions: [
      { value: "view", label: "View" },
      { value: "manage", label: "Manage" },
    ],
  },
  {
    id: "competitors",
    name: "Competitors",
    route: "/competitors",
    slugPrefix: "competitors",
    navPermission: "competitors.view",
    description: "Competitor price and market observations",
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
