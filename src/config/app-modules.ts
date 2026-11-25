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
  /**
   * Sidebar menu this module belongs to in the role editor.
   * Day-to-day pages use Inventory, Orders, or Sales & Returns.
   */
  area?: string;
  /**
   * Role-editor section. Modules that share a key are one group.
   * Use this when several slug prefixes are one sidebar item.
   */
  groupId?: string;
  /**
   * Kept for existing grants, but not shown in the role editor or permission picker.
   * The current page is gated by a newer permission.
   */
  hidden?: boolean;
  /**
   * Actions kept in the catalog for existing grants but not shown in the role editor,
   * e.g. the old order Approve that workflow-step checkboxes replaced.
   */
  hiddenActions?: readonly string[];
  /** Allowlisted vocabulary actions for this module */
  actions: PermissionActionOption[];
}

export const appModules: AppModule[] = [
  {
    id: "dashboard",
    name: "Dashboard",
    route: "/dashboard",
    slugPrefix: "dashboard",
    description: "Main overview, role dashboards, analytics and custom dashboards",
    actions: permissionActions("manage", "view", "custom.view", "custom.manage"),
  },
  {
    id: "ai",
    name: "ISMS Assist",
    route: "/help",
    slugPrefix: "ai",
    navPermission: "ai.assist",
    description:
      "Ask ISMS for help and a daily briefing on Operations or Sales; Internal AI gates the private Pixelcare AI prototype",
    actions: permissionActions("assist", "internal"),
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
    id: "inventory_approvals",
    name: "Inventory Approvals",
    route: "/audit-logs/inventory-approvals",
    slugPrefix: "inventory_approvals",
    navPermission: "inventory_approvals.view",
    description: "Read-only trace of every unit approval and its status",
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
    id: "branch_quotas",
    name: "Branch Quotas",
    route: "/settings/branch-quotas",
    slugPrefix: "branch_quotas",
    navPermission: "branch_quotas.view",
    description: "Monthly order limits and Target DII by branch and brand",
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
    area: "Settings",
    description: "Settings. Service center locations.",
    actions: permissionActions("view", "manage"),
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
    description: "SAP outbound integration queue",
    actions: permissionActions("view", "manage"),
  },
  {
    id: "master_data",
    name: "Master Data",
    route: "/settings/master-data",
    slugPrefix: "master_data",
    navPermission: "master_data.manage",
    description: "Brands, series, categories, and product models",
    actions: permissionActions("view", "manage"),
  },
  {
    id: "status_settings",
    name: "Status Settings",
    route: "/settings/status",
    slugPrefix: "status_settings",
    navPermission: "status_settings.manage",
    description: "Reason and status codes",
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
    name: "Branch inventory",
    route: "/inventory",
    slugPrefix: "inventory",
    navPermission: "inventory.view",
    area: "Inventory",
    description:
      "Opens branch Inventory. Approve defect reports decides defects for branches in the person's area of responsibility.",
    actions: [
      ...permissionActions("view", "manage"),
      { value: "defect.approve", label: "Approve defect reports" },
    ],
  },
  {
    id: "inventory_monthly_sir",
    name: "Monthly SIR",
    route: "/inventory/monthly-sir",
    slugPrefix: "inventory.monthly_sir",
    navPermission: "inventory.monthly_sir.view",
    area: "Inventory",
    description:
      "Opens Monthly SIR (P-COUNT, PCount) in Inventory. Download template, Scan serials, Upload P-COUNT, Generate variance, Open P-Count, and Approve each follow their own checkbox. Upload P-COUNT also covers Request to upload. Without Manage inventory, the upload budget is the scheduled Manila days or the monthly free slots.",
    actions: [
      { value: "view", label: "View" },
      { value: "download_template", label: "Download template" },
      { value: "scan_serials", label: "Scan serials" },
      { value: "upload", label: "Upload P-COUNT" },
      { value: "upload_scheduled", label: "Upload on scheduled days" },
      { value: "upload_slots", label: "Upload with free slots" },
      { value: "generate_variance", label: "Generate variance" },
      { value: "open_pcount", label: "Open P-Count" },
      { value: "approve", label: "Approve" },
    ],
  },
  {
    id: "logistics",
    name: "Branch deliveries",
    route: "/logistics/deliveries",
    slugPrefix: "logistics",
    navPermission: "logistics.view",
    area: "Inventory",
    description: "Opens Deliveries in Inventory. View, Create, and Manage also open Transfers.",
    actions: permissionActions("view", "create", "manage"),
  },
  {
    id: "logistics_delivery",
    name: "Branch deliveries",
    route: "/logistics/deliveries",
    slugPrefix: "logistics.delivery",
    groupId: "logistics",
    area: "Inventory",
    description: "Opens Deliveries in Inventory. View, Create, and Manage also open Transfers.",
    actions: [
      { value: "dispatch", label: "Dispatch" },
      { value: "receive", label: "Receive" },
    ],
  },
  {
    id: "logistics_delivery_return",
    name: "Branch deliveries",
    route: "/logistics/deliveries",
    slugPrefix: "logistics.delivery_return",
    groupId: "logistics",
    area: "Inventory",
    description: "Opens Deliveries in Inventory. View, Create, and Manage also open Transfers.",
    actions: [
      { value: "request", label: "Request return" },
      { value: "approve", label: "Approve return" },
    ],
  },
  {
    id: "logistics_delivery_transfer",
    name: "Branch transfers",
    route: "/logistics/transfers",
    slugPrefix: "logistics.delivery_transfer",
    area: "Inventory",
    description:
      "Opens Transfers in Inventory. View alone is read only. Create, Approve, and Receive control this page and also cover units not accepted on a delivery. Approve applies to branches in the person's area of responsibility (all branches with Manage branches). Branch deliveries View, Create, or Manage also open Transfers.",
    actions: [
      { value: "view", label: "View" },
      { value: "create", label: "Create" },
      { value: "approve", label: "Approve" },
      { value: "receive", label: "Receive" },
    ],
  },
  {
    id: "pullouts",
    name: "Branch pull-outs",
    route: "/logistics/pickups",
    slugPrefix: "pullouts",
    navPermission: "pullouts.view",
    area: "Inventory",
    description:
      "Opens Pull-outs in Inventory. Create, Approve, and Manage cover new pull-outs, approval, and sending.",
    actions: permissionActions("view", "create", "approve", "manage"),
  },
  {
    id: "service_centers_inventory",
    name: "Service center inventory",
    route: "/service-centers/inventory",
    slugPrefix: "service_centers.inventory",
    navPermission: "service_centers.inventory.view",
    area: "Inventory",
    description: "Opens service center Inventory.",
    actions: permissionActions("view"),
  },
  {
    id: "service_centers_logistics",
    name: "Service center deliveries and pull-outs",
    route: "/service-centers/deliveries",
    slugPrefix: "service_centers.logistics",
    navPermission: "service_centers.logistics.view",
    area: "Inventory",
    description:
      "Opens service center Deliveries and Pull-outs. Approve covers pull-out approve and reject. View, Create, and Manage cover both pages.",
    actions: permissionActions("view", "create", "manage", "approve"),
  },
  {
    id: "orders",
    name: "Branch orders",
    route: "/orders",
    slugPrefix: "orders",
    area: "Orders",
    hidden: true,
    description: "Legacy branch order access. Manual, special, and auto replenish use their own permissions.",
    actions: permissionActions("view", "create", "approve"),
  },
  {
    id: "orders_manual",
    name: "Branch manual orders",
    route: "/orders/manual",
    slugPrefix: "orders.manual",
    navPermission: "orders.manual.view",
    area: "Orders",
    description:
      "Opens Manual Order. Without See everyone's orders, the list shows only the person's own orders.",
    hiddenActions: ["approve"],
    actions: [
      ...permissionActions("view", "create"),
      { value: "approve_sp", label: "Supply Planning approval" },
      { value: "edit_pending", label: "Edit while Pending SP" },
      { value: "view_all", label: "See everyone's orders" },
      { value: "view_queue", label: "See every pending step" },
      { value: "force_cancel", label: "Cancel any pending order" },
    ],
  },
  {
    id: "orders_special",
    name: "Branch special orders",
    route: "/orders/special",
    slugPrefix: "orders.special",
    navPermission: "orders.special.view",
    area: "Orders",
    description:
      "Opens the special-order lines on Manual Order. Without See everyone's orders, the list shows only the person's own orders.",
    hiddenActions: ["approve"],
    actions: [
      ...permissionActions("view", "create"),
      { value: "approve_sp", label: "Supply Planning approval" },
      { value: "view_all", label: "See everyone's orders" },
      { value: "view_queue", label: "See every pending step" },
      { value: "force_cancel", label: "Cancel any pending order" },
    ],
  },
  {
    id: "orders_auto_replenish",
    name: "Branch auto replenish",
    route: "/orders/auto-replenish",
    slugPrefix: "orders.auto_replenish",
    navPermission: "orders.auto_replenish.view",
    area: "Orders",
    description: "Opens Auto replenish.",
    hiddenActions: ["approve"],
    actions: [
      ...permissionActions("view", "create"),
      { value: "approve_tl", label: "Team Leader review" },
      { value: "approve_sp", label: "Supply Planning approval" },
      { value: "view_queue", label: "See every pending step" },
      { value: "force_cancel", label: "Cancel any pending order" },
    ],
  },
  {
    id: "service_centers_orders",
    name: "Service center orders",
    route: "/service-centers/orders",
    slugPrefix: "service_centers.orders",
    navPermission: "service_centers.orders.view",
    area: "Orders",
    description:
      "Opens Service Center Orders. Supply Planning approval approves or rejects SC orders.",
    hiddenActions: ["approve"],
    actions: [
      ...permissionActions("view", "create", "approve"),
      { value: "approve_sp", label: "Supply Planning approval" },
    ],
  },
  {
    id: "sales",
    name: "Branch sales",
    route: "/sales",
    slugPrefix: "sales",
    navPermission: "sales.view",
    area: "Sales & Returns",
    description: "Opens Sales Transactions.",
    actions: permissionActions("view", "create", "update"),
  },
  {
    id: "sales_return",
    name: "Branch returns",
    route: "/returns",
    slugPrefix: "sales.return",
    area: "Sales & Returns",
    hidden: true,
    description: "Legacy branch return access. Returns uses the Returns permissions.",
    actions: permissionActions("view", "request", "evaluate", "approve", "complete"),
  },
  {
    id: "service_centers_sales",
    name: "Service center sales",
    route: "/sales?tab=service-center",
    slugPrefix: "service_centers.sales",
    navPermission: "service_centers.sales.view",
    area: "Sales & Returns",
    description:
      "Opens the Service Center tab in Sales Transactions (read only: copies of branch sales sent to a service center).",
    actions: permissionActions("view", "create", "update"),
  },
  {
    id: "service_centers_return",
    name: "Service center returns",
    route: "/returns",
    slugPrefix: "service_centers.return",
    area: "Sales & Returns",
    hidden: true,
    description: "Legacy service center return access. Returns uses the Returns permissions.",
    actions: permissionActions("request", "evaluate", "approve", "complete"),
  },
  {
    id: "returns",
    name: "Returns",
    route: "/returns",
    slugPrefix: "returns",
    navPermission: "returns.view",
    area: "Sales & Returns",
    description: "Opens Returns for branch and service center.",
    actions: [
      { value: "view", label: "View both tabs" },
      { value: "branch.view", label: "Branch tab" },
      { value: "service.view", label: "Service center tab" },
      { value: "request", label: "Request" },
      { value: "evaluate", label: "Evaluate" },
      { value: "approve", label: "Approve" },
      { value: "complete", label: "Complete" },
    ],
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
    route: "/settings/planning/runs",
    slugPrefix: "forecast",
    navPermission: "forecast.view",
    description:
      "Supply Planning runs and coverage (view) plus forecast import and quota overrides (manage)",
    actions: permissionActions("view", "manage"),
  },
  {
    id: "planogram",
    name: "Planogram",
    route: "/settings/planogram",
    slugPrefix: "planogram",
    navPermission: "planogram.view",
    description: "Branch authorized SKUs",
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

/** Modules an admin can assign. Hidden modules stay in the catalog for existing grants. */
export function visibleAppModules(): AppModule[] {
  return appModules.filter((module) => !module.hidden);
}

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

/** Kept for existing grants but not offered in the role editor or permission picker. */
export function isHiddenPermissionSlug(slug: string): boolean {
  const { module, action } = parsePermissionSlug(slug);
  if (!module) return false;
  if (module.hidden || roleSectionModule(module).hidden) return true;
  return action !== null && (module.hiddenActions?.includes(action) ?? false);
}

export function getModuleNavPermission(moduleId: string): string | undefined {
  return getAppModuleById(moduleId)?.navPermission;
}

/** Role-editor section. Shared by slug prefixes that are one sidebar item. */
export function roleSectionKey(module: AppModule): string {
  return module.groupId ?? module.id;
}

/** Module whose name and description label the role-editor section. */
export function roleSectionModule(module: AppModule): AppModule {
  const key = roleSectionKey(module);
  return appModules.find((item) => roleSectionKey(item) === key) ?? module;
}

/** Short action name shown on a role. The section title already says where it applies. */
export function permissionActionLabel(appModule: AppModule, action: string): string {
  return (
    appModule.actions.find((item) => item.value === action)?.label ??
    getPermissionActionLabel(action)
  );
}

export function formatPermissionName(appModule: AppModule, action: string): string {
  const section = roleSectionModule(appModule);
  return `${permissionActionLabel(appModule, action)} — ${section.name}`;
}

export function isValidModuleAction(moduleId: string, action: string): boolean {
  const appModule = getAppModuleById(moduleId);
  if (!appModule) {
    return false;
  }

  return appModule.actions.some((item) => item.value === action);
}
