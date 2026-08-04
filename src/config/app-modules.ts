import {
  getPermissionActionLabel,
  permissionActions,
  type PermissionActionOption,
} from "@/config/permission-actions";

export type { PermissionActionOption };

export interface AppModule {
  id: string;
  name: string;
  route: string | null;
  slugPrefix: string;
  description?: string;
  /** Permission slug that gates sidebar access to this module */
  navPermission?: string;
  /** Allowlisted vocabulary actions for this module */
  actions: PermissionActionOption[];
}

export const appModules: AppModule[] = [
  {
    id: "dashboard",
    name: "Dashboard",
    route: "/dashboard",
    slugPrefix: "dashboard",
    description: "Main overview and module launcher",
    actions: permissionActions("manage", "view"),
  },
  {
    id: "company",
    name: "Company Settings",
    route: "/settings/company",
    slugPrefix: "company",
    description: "Tenant branding and company profile",
    actions: permissionActions("view", "manage"),
  },
  {
    id: "users",
    name: "Users",
    route: "/settings/users",
    slugPrefix: "users",
    navPermission: "users.manage",
    description: "Team members and assignments",
    actions: permissionActions("view", "manage"),
  },
  {
    id: "departments",
    name: "Departments",
    route: "/settings/departments",
    slugPrefix: "departments",
    navPermission: "departments.manage",
    description: "Org departments for user assignment",
    actions: permissionActions("view", "manage"),
  },
  {
    id: "roles",
    name: "Roles",
    route: "/settings/roles",
    slugPrefix: "roles",
    navPermission: "roles.manage",
    description: "Role and permission matrix",
    actions: permissionActions("view", "manage"),
  },
  {
    id: "policies",
    name: "Policies",
    route: "/policies",
    slugPrefix: "policies",
    navPermission: "policies.view",
    description: "ISMS policy documents",
    actions: permissionActions("view", "create", "approve"),
  },
  {
    id: "audits",
    name: "Audits",
    route: null,
    slugPrefix: "audits",
    description: "Internal audit workflows",
    actions: permissionActions("create", "close"),
  },
  {
    id: "reports",
    name: "Reports",
    route: "/reports",
    slugPrefix: "reports",
    description: "Compliance and management reports",
    actions: permissionActions("view", "export"),
  },
  {
    id: "audit_logs",
    name: "System Logs",
    route: "/audit-logs/system",
    slugPrefix: "audit_logs",
    navPermission: "audit_logs.view",
    description: "System and account activity logs",
    actions: permissionActions("view"),
  },
  {
    id: "serial_logs",
    name: "Serial Number Logs",
    route: "/audit-logs/serial-numbers",
    slugPrefix: "serial_logs",
    navPermission: "serial_logs.view",
    description: "Serial-number lifecycle activity logs",
    actions: permissionActions("view"),
  },
  {
    id: "branches",
    name: "Branches",
    route: "/settings/branches",
    slugPrefix: "branches",
    navPermission: "branches.manage",
    description: "Dealer branch locations and delivery schedules",
    actions: permissionActions("view", "manage"),
  },
  {
    id: "dealers",
    name: "Dealers",
    route: "/settings/dealers",
    slugPrefix: "dealers",
    navPermission: "dealers.manage",
    description: "Dealer master records and network setup",
    actions: permissionActions("view", "manage"),
  },
  {
    id: "service_centers",
    name: "Service centers",
    route: "/settings/service-centers",
    slugPrefix: "service_centers",
    navPermission: "service_centers.manage",
    description: "Service center master data and ATR return steps",
    actions: permissionActions(
      "view",
      "manage",
      "return.request",
      "return.evaluate",
      "return.approve",
      "return.complete",
    ),
  },
  {
    id: "service_centers_inventory",
    name: "Service Center Inventory",
    route: "/service-centers/inventory",
    slugPrefix: "service_centers.inventory",
    navPermission: "service_centers.inventory.view",
    description: "Serialized stock at service center locations",
    actions: permissionActions("view"),
  },
  {
    id: "service_centers_sales",
    name: "Service Center Sales",
    route: "/service-centers/sales",
    slugPrefix: "service_centers.sales",
    navPermission: "service_centers.sales.view",
    description: "Service center sales encode",
    actions: permissionActions("view", "create"),
  },
  {
    id: "service_centers_orders",
    name: "Service Center Orders",
    route: "/service-centers/orders",
    slugPrefix: "service_centers.orders",
    navPermission: "service_centers.orders.view",
    description: "Service center manual orders",
    actions: permissionActions("view", "create", "approve"),
  },
  {
    id: "service_centers_logistics",
    name: "Service Center Logistics",
    route: "/service-centers/deliveries",
    slugPrefix: "service_centers.logistics",
    navPermission: "service_centers.logistics.view",
    description: "Service center deliveries and pull-outs",
    actions: permissionActions("view", "create", "manage"),
  },
  {
    id: "warehouses",
    name: "Warehouses",
    route: "/settings/warehouses",
    slugPrefix: "warehouses",
    navPermission: "warehouses.manage",
    description: "Warehouse and location setup",
    actions: permissionActions("view", "manage"),
  },
  {
    id: "sap",
    name: "SAP integration",
    route: "/settings/sap-integration",
    slugPrefix: "sap",
    navPermission: "sap.manage",
    description: "SAP outbound queue and Service Layer settings",
    actions: permissionActions("view", "manage"),
  },
  {
    id: "master_data",
    name: "Master Data",
    route: "/settings/master-data",
    slugPrefix: "master_data",
    navPermission: "master_data.manage",
    description: "Brands, categories, and product models",
    actions: permissionActions("view", "manage"),
  },
  {
    id: "status_settings",
    name: "Status Settings",
    route: "/settings/status",
    slugPrefix: "status_settings",
    navPermission: "status_settings.manage",
    description: "Reason/Status codes for inventory, logistics, and pull-outs",
    actions: permissionActions("view", "manage"),
  },
  {
    id: "ordering_settings",
    name: "Ordering Policy",
    route: "/settings/ordering",
    slugPrefix: "ordering_settings",
    navPermission: "ordering_settings.manage",
    description: "Global locked ordering days (e.g. no orders on Sundays)",
    actions: permissionActions("view", "manage"),
  },
  {
    id: "aors",
    name: "Areas of Responsibility",
    route: "/settings/aors",
    slugPrefix: "aors",
    navPermission: "aors.manage",
    description: "User scope by branch or warehouse",
    actions: permissionActions("view", "manage"),
  },
  {
    id: "inventory",
    name: "Inventory",
    route: "/inventory",
    slugPrefix: "inventory",
    navPermission: "inventory.view",
    description: "Serialized branch inventory (AOR-scoped)",
    actions: permissionActions("view", "manage"),
  },
  {
    id: "orders_manual",
    name: "Manual Order",
    route: "/orders/manual",
    slugPrefix: "orders.manual",
    navPermission: "orders.manual.view",
    description: "Manual branch orders (planogram SKUs)",
    actions: permissionActions("view", "create", "approve"),
  },
  {
    id: "orders_special",
    name: "Special Order",
    route: "/orders/special",
    slugPrefix: "orders.special",
    navPermission: "orders.special.view",
    description: "Special branch orders (off-planogram allowed)",
    actions: permissionActions("view", "create", "approve"),
  },
  {
    id: "orders_auto_replenish",
    name: "Auto replenish",
    route: "/orders/auto-replenish",
    slugPrefix: "orders.auto_replenish",
    navPermission: "orders.auto_replenish.view",
    description: "Auto-replenish branch orders",
    actions: permissionActions("view", "create", "approve"),
  },
  {
    id: "logistics",
    name: "Logistics",
    route: "/logistics",
    slugPrefix: "logistics",
    navPermission: "logistics.view",
    description: "Delivery, transfer, and pull-out",
    actions: permissionActions("view", "create", "manage"),
  },
  {
    id: "sales",
    name: "Sales",
    route: "/sales",
    slugPrefix: "sales",
    navPermission: "sales.view",
    description: "Branch sales and ATR status",
    actions: permissionActions(
      "view",
      "create",
      "return.request",
      "return.evaluate",
      "return.approve",
      "return.complete",
    ),
  },
  {
    id: "official_sales",
    name: "Official Sales",
    route: "/reports/official-sales",
    slugPrefix: "official_sales",
    navPermission: "official_sales.view",
    description: "Official sales Excel staging and inventory process",
    actions: permissionActions("view", "manage"),
  },
  {
    id: "forecast",
    name: "Planning & Forecast",
    route: "/settings/planning",
    slugPrefix: "forecast",
    navPermission: "forecast.manage",
    description: "Forecast upload, allocation, and suggested orders",
    actions: permissionActions("view", "manage"),
  },
  {
    id: "planogram",
    name: "Planogram",
    route: "/settings/planogram",
    slugPrefix: "planogram",
    navPermission: "planogram.view",
    description: "Branch authorized SKUs, shelf capacity, and MIL thresholds",
    actions: permissionActions("view", "manage"),
  },
  {
    id: "announcements",
    name: "Announcements",
    route: "/announcements",
    slugPrefix: "announcements",
    navPermission: "announcements.view",
    description: "Tenant announcements and dashboard banners",
    actions: permissionActions("view", "manage"),
  },
  {
    id: "competitors",
    name: "Competitors",
    route: "/competitors",
    slugPrefix: "competitors",
    navPermission: "competitors.view",
    description: "Competitor price and market observations",
    actions: permissionActions("view", "manage"),
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
  // Prefer longest slugPrefix match (e.g. orders.manual before a hypothetical orders).
  const byPrefixLength = [...appModules].sort(
    (a, b) => b.slugPrefix.length - a.slugPrefix.length,
  );

  for (const appModule of byPrefixLength) {
    const prefix = `${appModule.slugPrefix}.`;
    if (!slug.startsWith(prefix)) {
      continue;
    }
    const action = slug.slice(prefix.length);
    if (!action) {
      continue;
    }
    return { module: appModule, action };
  }

  return { module: null, action: null };
}

export function getModuleNavPermission(moduleId: string): string | undefined {
  return getAppModuleById(moduleId)?.navPermission;
}

export function formatPermissionName(appModule: AppModule, action: string): string {
  const actionLabel =
    appModule.actions.find((item) => item.value === action)?.label ??
    getPermissionActionLabel(action);

  return `${actionLabel} ${appModule.name}`;
}

export function isValidModuleAction(moduleId: string, action: string): boolean {
  const appModule = getAppModuleById(moduleId);
  if (!appModule) {
    return false;
  }

  return appModule.actions.some((item) => item.value === action);
}
