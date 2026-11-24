import {
  Activity,
  ArrowLeftRight,
  ArrowUpToLine,
  Barcode,
  Building2,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  ClipboardList,
  Clock,
  History,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  LayoutTemplate,
  MapPin,
  Megaphone,
  Network,
  Package,
  Plug,
  ScrollText,
  Settings,
  Shield,
  ShoppingCart,
  Store,
  Tags,
  Truck,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { getModuleNavPermission } from "@/config/app-modules";
import { BRANCH_QUOTA_ACCESS } from "@/features/branch-quotas/constants/branch-quota-permissions";
import { CUSTOM_DASHBOARD_ACCESS } from "@/features/custom-dashboards/constants/custom-dashboard-permissions";

export type NavCountBadgeKey =
  | "unreadAnnouncements"
  | "stockUnitsStk"
  | "branchInventoryV2Updates"
  | "monthlySirPending"
  | "ordersManualQueue"
  | "ordersSpecialQueue"
  | "ordersAutoReplenishQueue"
  | "returnsApprovals"
  | "scServiceReturns"
  | "logisticsDeliveries"
  | "logisticsTransfers"
  | "logisticsPullouts";

/** One existing queue count. Included only when the viewer can see that type. */
export interface NavCountBadgePart {
  key: NavCountBadgeKey;
  permission?: string;
  anyPermissions?: readonly string[];
}

export interface NavLinkItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only `pathname === href` is active (use for section index routes). */
  exact?: boolean;
  permission?: string;
  /** Show link when user has any of these permissions */
  anyPermissions?: readonly string[];
  /** Extra path prefixes that keep this item active after a route moves under it. */
  activePathPrefixes?: readonly string[];
  platformOperatorOnly?: boolean;
  /** Left out of the sidebar while the route stays reachable by URL. */
  hidden?: boolean;
  /** Compact sidebar badge (e.g. recently added menus) */
  badge?: "new";
  /**
   * When set, sidebar can show a live numeric count badge for this href
   * (e.g. unread announcements on Overview, STK qty on Stock units,
   * pending approval queues on Monthly SIR / Orders / Returns / Logistics).
   */
  countBadgeKey?: NavCountBadgeKey;
  /**
   * Sum of queue counts the viewer is allowed to see.
   * Manual Order uses this for the manual and special queues.
   */
  countBadgeParts?: readonly NavCountBadgePart[];
}

export interface NavLinkEntry extends NavLinkItem {
  type: "link";
}

/** Nested group inside a sidebar group (e.g. Settings submodules) */
export interface NavSubGroupItem {
  label: string;
  icon: LucideIcon;
  items: NavLinkItem[];
}

export type NavGroupChild = NavLinkItem | NavSubGroupItem;

export interface NavGroupEntry {
  type: "group";
  label: string;
  icon: LucideIcon;
  items: NavGroupChild[];
  /** Open on first load when no child route is active (in-session toggle still works) */
  defaultOpen?: boolean;
}

export type NavEntry = NavLinkEntry | NavGroupEntry;

export function isNavSubGroup(child: NavGroupChild): child is NavSubGroupItem {
  return "items" in child;
}

const OPERATIONS_DASHBOARD_PERMISSIONS = [
  "inventory.view",
  "orders.view",
  "orders.manual.view",
  "orders.special.view",
  "orders.auto_replenish.view",
  "logistics.view",
  "logistics.create",
  "logistics.manage",
  "forecast.view",
  "forecast.manage",
  "planogram.view",
  "planogram.manage",
];

const SALES_DASHBOARD_PERMISSIONS = [
  "sales.view",
  "sales.create",
  "sales.update",
  "returns.view",
  "returns.branch.view",
  "returns.service.view",
  "returns.request",
  "returns.evaluate",
  "returns.approve",
  "returns.complete",
];

const MANUAL_ORDER_ACCESS = [
  "orders.manual.view",
  "orders.manual.create",
  "orders.manual.approve",
] as const;

const SPECIAL_ORDER_ACCESS = [
  "orders.special.view",
  "orders.special.create",
  "orders.special.approve",
] as const;

/** Kept here so the client sidebar does not import service-center server helpers. */
const SC_SALES_ACCESS = [
  "service_centers.sales.view",
  "service_centers.sales.create",
  "service_centers.sales.update",
] as const;

const SC_ORDERS_ACCESS = [
  "service_centers.orders.view",
  "service_centers.orders.create",
  "service_centers.orders.approve",
] as const;

const SC_LOGISTICS_ACCESS = [
  "service_centers.logistics.view",
  "service_centers.logistics.create",
  "service_centers.logistics.manage",
] as const;

export const appNavigation: NavEntry[] = [
  {
    type: "group",
    label: "Dashboard",
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      {
        label: "Dashboard",
        icon: LayoutDashboard,
        items: [
          {
            href: "/dashboard",
            label: "Overview",
            icon: LayoutDashboard,
            exact: true,
            permission: getModuleNavPermission("dashboard"),
            countBadgeKey: "unreadAnnouncements",
          },
          {
            href: "/dashboard/operations",
            label: "Operations",
            icon: Activity,
            anyPermissions: OPERATIONS_DASHBOARD_PERMISSIONS,
            // Client doesn't use it yet (2026-11-16).
            hidden: true,
          },
          {
            href: "/dashboard/sales",
            label: "Sales",
            icon: Store,
            anyPermissions: SALES_DASHBOARD_PERMISSIONS,
            // Client doesn't use it yet (2026-11-16).
            hidden: true,
          },
          {
            href: "/dashboard/pcount",
            label: "P-Count Dashboard",
            icon: ClipboardList,
            anyPermissions: ["inventory.view", "reports.view"],
            // badge: "new",
          },
          {
            href: "/dashboard/site-traffic",
            label: "Site Traffic",
            icon: Users,
            anyPermissions: ["users.manage", "audit_logs.view"],
            // badge: "new",
          },
          {
            href: "/competitors",
            label: "Market Survey",
            icon: ChartColumn,
            permission: "competitors.view",
          },
          {
            href: "/dashboard/custom",
            label: "Custom Dashboards",
            icon: LayoutTemplate,
            anyPermissions: CUSTOM_DASHBOARD_ACCESS,
            badge: "new",
          },
        ],
      },
    ],
  },
  {
    type: "link",
    href: "/announcements",
    label: "Announcements",
    icon: Megaphone,
    permission: "announcements.view",
  },
  {
    type: "group",
    label: "Orders",
    icon: ShoppingCart,
    items: [
      {
        label: "Orders",
        icon: ShoppingCart,
        items: [
          {
            href: "/orders/manual",
            label: "Manual Order",
            icon: ShoppingCart,
            anyPermissions: [...MANUAL_ORDER_ACCESS, ...SPECIAL_ORDER_ACCESS],
            activePathPrefixes: ["/orders/special"],
            countBadgeParts: [
              { key: "ordersManualQueue", anyPermissions: MANUAL_ORDER_ACCESS },
              { key: "ordersSpecialQueue", anyPermissions: SPECIAL_ORDER_ACCESS },
            ],
          },
          {
            href: "/orders/auto-replenish",
            label: "Auto replenish",
            icon: Package,
            anyPermissions: [
              "orders.auto_replenish.view",
              "orders.auto_replenish.create",
              "orders.auto_replenish.approve",
            ],
            countBadgeKey: "ordersAutoReplenishQueue",
          },
          {
            href: "/service-centers/orders",
            label: "Service Center Orders",
            icon: ShoppingCart,
            anyPermissions: SC_ORDERS_ACCESS,
          },
        ],
      },
    ],
  },
  {
    type: "group",
    label: "Sales & Returns",
    icon: History,
    items: [
      {
        label: "Sales",
        icon: Store,
        items: [
          {
            href: "/sales",
            label: "Sales Transactions",
            icon: Store,
            // Branch tab, and the Service Center tab for SC users.
            anyPermissions: ["sales.view", "sales.create", "sales.update", ...SC_SALES_ACCESS],
          },
        ],
      },
      {
        label: "Returns",
        icon: ArrowLeftRight,
        items: [
          {
            href: "/returns",
            label: "Returns / Replacement",
            icon: ArrowLeftRight,
            anyPermissions: [
              "returns.view",
              "returns.branch.view",
              "returns.service.view",
              "returns.request",
              "returns.evaluate",
              "returns.approve",
              "returns.complete",
            ],
            countBadgeKey: "returnsApprovals",
          },
          {
            href: "/service-centers/returns",
            label: "Service Center Returns / Replacement",
            icon: ArrowLeftRight,
            permission: "service_centers.returns.process",
            countBadgeKey: "scServiceReturns",
          },
        ],
      },
    ],
  },
  // {
  //   type: "group",
  //   label: "Logistics",
  //   icon: Package,
  //   items: [
  //     {
  //       href: "/logistics/transfers",
  //       label: "Transfers",
  //       icon: ArrowLeftRight,
  //       anyPermissions: ["logistics.view", "logistics.create", "logistics.manage"],
  //       countBadgeKey: "logisticsTransfers",
  //     },
  //     {
  //       href: "/logistics/pickups",
  //       label: "Pull-outs",
  //       icon: ArrowUpToLine,
  //       anyPermissions: ["logistics.view", "logistics.create", "logistics.manage"],
  //       countBadgeKey: "logisticsPullouts",
  //     },
  //   ],
  // },
  {
    type: "group",
    label: "Inventory",
    icon: Package,
    items: [
      {
        label: "Branch Inventory",
        icon: Package,
        items: [
          {
            href: "/inventory/v2",
            label: "Inventory",
            icon: ClipboardCheck,
            permission: "inventory.view",
            countBadgeKey: "branchInventoryV2Updates",
          },
          {
            href: "/inventory/monthly-sir",
            label: "Monthly SIR",
            icon: ClipboardList,
            permission: "inventory.monthly_sir.view",
            countBadgeKey: "monthlySirPending",
          },
          // { DO NOT UNCOMMENT THIS, NO NEED TO SHOW IN THE NAVIGATION
          //   href: "/inventory/stock-count",
          //   label: "P-Count",
          //   icon: ClipboardList,
          //   permission: "inventory.view",
          //   badge: "new",
          // },
        ],
      },
      
      {
        label: "Branch Movement",
        icon: Truck,
        items: [
          {
            href: "/logistics/deliveries",
            label: "Deliveries",
            icon: Truck,
            anyPermissions: ["logistics.view", "logistics.create", "logistics.manage"],
            countBadgeKey: "logisticsDeliveries",
          },
          {
            href: "/logistics/transfers",
            label: "Transfers",
            icon: ArrowLeftRight,
            // The unit-transfer permissions no longer open this page: its Unit transfers tab is
            // hidden (see HIDDEN_TRANSFERS_PAGE_TABS). orders.create is how a PS reaches the
            // transfers they accept.
            anyPermissions: ["logistics.view", "logistics.create", "logistics.manage", "orders.create"],
            countBadgeKey: "logisticsTransfers",
            activePathPrefixes: ["/logistics/delivery-transfers"],
          },
          {
            href: "/logistics/pickups",
            label: "Pull-outs",
            icon: ArrowUpToLine,
            anyPermissions: ["pullouts.view"],
            countBadgeKey: "logisticsPullouts",
          },
        ],
      },
      {
        label: "Service Center Inventory",
        icon: Package,
        items: [
          {
            href: "/service-centers/inventory",
            label: "Inventory (Service Center)",
            icon: ClipboardCheck,
            permission: "service_centers.inventory.view",
          },
        ],
      },
      {
        label: "Service Center Movement",
        icon: Truck,
        items: [
          {
            href: "/service-centers/deliveries",
            label: "Deliveries (Service Center)",
            icon: Truck,
            anyPermissions: SC_LOGISTICS_ACCESS,
          },
          {
            href: "/service-centers/pullouts",
            label: "Pull-outs (Service Center)",
            icon: ArrowUpToLine,
            anyPermissions: SC_LOGISTICS_ACCESS,
          },
        ],
      },
    ],
  },
  {
    type: "group",
    label: "Reports",
    icon: ClipboardList,
    items: [
      {
        label: "Orders",
        icon: ClipboardList,
        items: [
          {
            href: "/reports/order-summary",
            label: "Order summary",
            icon: ClipboardList,
            anyPermissions: [
              "reports.view",
              "orders.view",
              "orders.manual.view",
              "orders.special.view",
              "orders.auto_replenish.view",
            ],
          },
          {
            href: "/reports/processed-orders",
            label: "Processed orders",
            icon: ClipboardList,
            anyPermissions: [
              "reports.view",
              "orders.view",
              "orders.manual.view",
              "orders.special.view",
              "orders.auto_replenish.view",
            ],
          },
          {
            href: "/reports/daily-stock",
            label: "Daily stock",
            icon: Package,
            anyPermissions: [
              "reports.view",
              "orders.view",
              "orders.manual.view",
              "orders.special.view",
              "orders.auto_replenish.view",
            ],
          },
        ],
      },
      {
        label: "Movement",
        icon: Truck,
        items: [
          {
            href: "/reports/transfers",
            label: "Transfers",
            icon: ArrowLeftRight,
            anyPermissions: [
              "reports.view",
              "logistics.view",
              "logistics.create",
              "logistics.manage",
            ],
          },
          {
            href: "/reports/pull-outs",
            label: "Pull-outs",
            icon: ArrowUpToLine,
            anyPermissions: [
              "reports.view",
              "logistics.view",
              "logistics.create",
              "logistics.manage",
            ],
          },
        ],
      },
      {
        label: "Sales",
        icon: Store,
        items: [
          {
            href: "/reports/sales",
            label: "Sales & Returns",
            icon: Store,
            anyPermissions: ["reports.view", "sales.create"],
          },
          {
            href: "/reports/official-sales",
            label: "Official Sales",
            icon: ScrollText,
            anyPermissions: ["official_sales.view", "official_sales.manage"],
          },
          {
            href: "/reports/branch-returns",
            label: "Branch returns",
            icon: ArrowLeftRight,
            anyPermissions: ["reports.view", "sales.create"],
          },
          {
            href: "/reports/service-returns",
            label: "Service returns",
            icon: ScrollText,
            anyPermissions: ["reports.view", "sales.create"],
          },
        ],
      },
      {
        label: "Inventory",
        icon: Package,
        items: [
          // {
          //   href: "/inventory/serial-numbers",
          //   label: "SAP Serial No.",
          //   icon: Barcode,
          //   permission: "inventory.view",
          //   badge: "new",
          // },
          {
            href: "/inventory/warehouse-stock",
            label: "Warehouse stock",
            icon: Warehouse,
            anyPermissions: ["inventory.view", "warehouses.manage"],
          },
        ],
      },
      {
        label: "Stock",
        icon: ClipboardList,
        items: [
          {
            href: "/reports/pcount",
            label: "P-Count",
            icon: ClipboardList,
            anyPermissions: ["reports.view", "inventory.view"],
          },
          {
            href: "/reports/variance-discrepancy",
            label: "Variance & discrepancy",
            icon: ChartColumn,
            anyPermissions: ["reports.view", "inventory.view"],
          },
          {
            href: "/reports/dii",
            label: "DII",
            icon: CalendarDays,
            anyPermissions: ["reports.view", "inventory.view"],
          },
          {
            href: "/reports/inventory",
            label: "Inventory report",
            icon: Package,
            anyPermissions: ["reports.view", "inventory.view"],
          },
          {
            href: "/reports/aging",
            label: "Aging",
            icon: Clock,
            anyPermissions: ["reports.view", "inventory.view"],
          },
          {
            href: "/reports/consolidated-discrepancy",
            label: "Consolidated discrepancy",
            icon: LayoutGrid,
            anyPermissions: ["reports.view", "inventory.view"],
          },
        ],
      },
      // DO NOT UNCOMMENT THIS, NO NEED TO SHOW IN THE NAVIGATION 
      // {
      //   label: "Planning",
      //   icon: ChartColumn,
      //   items: [
      //     {
      //       href: "/reports/demand-planning",
      //       label: "Supply Planning",
      //       icon: ChartColumn,
      //       anyPermissions: ["forecast.view", "forecast.manage"],
      //     },
      //   ],
      // },
    ],
  },
  {
    type: "group",
    label: "Audit Logs",
    icon: History,
    items: [
      {
        label: "Logs",
        icon: History,
        items: [
          {
            href: "/audit-logs/system",
            label: "System logs",
            icon: ClipboardList,
            permission: "audit_logs.view",
          },
          {
            href: "/audit-logs/serial-numbers",
            label: "Serial number logs",
            icon: Barcode,
            permission: "serial_logs.view",
          },
          {
            href: "/audit-logs/inventory-approvals",
            label: "Inventory approvals",
            icon: ClipboardCheck,
            permission: "inventory_approvals.view",
          },
        ],
      },
    ],
  },
  {
    type: "link",
    href: "/policies",
    label: "Policies",
    icon: ScrollText,
    anyPermissions: ["policies.view", "policies.create", "policies.approve"],
  },
  {
    type: "group",
    label: "Settings",
    icon: Settings,
    defaultOpen: true,
    items: [
      {
        label: "Organization",
        icon: Building2,
        items: [
          {
            href: "/settings/company",
            label: "Company Settings",
            icon: Building2,
            permission: "company.view",
          },
          {
            href: "/settings/departments",
            label: "Departments",
            icon: Network,
            permission: "departments.manage",
          },
          {
            href: "/settings/status",
            label: "Status",
            icon: Clock,
            permission: "status_settings.manage",
          },
        ],
      },
      {
        label: "Operations & Planning",
        icon: LayoutGrid,
        items: [
          {
            href: "/settings/aors",
            label: "AORs",
            icon: Network,
            anyPermissions: ["aors.view", "aors.manage"],
          },
          {
            href: "/settings/branch-quotas",
            label: "Branch quotas",
            icon: ChartColumn,
            anyPermissions: BRANCH_QUOTA_ACCESS,
          },
          {
            href: "/settings/planning",
            label: "Planning & Forecast",
            icon: LayoutGrid,
            anyPermissions: ["forecast.manage", "planogram.manage"],
            exact: true,
          },
          // DO NOT UNCOMMENT THIS, NO NEED TO SHOW IN THE NAVIGATION {
          //   href: "/settings/planning/runs",
          //   label: "Supply Planning",
          //   icon: CalendarDays,
          //   anyPermissions: ["forecast.view", "forecast.manage"],
          //   badge: "new",
          // },
          {
            href: "/settings/planogram",
            label: "Planogram",
            icon: LayoutGrid,
            anyPermissions: ["planogram.view", "planogram.manage"],
          },
          {
            href: "/settings/ordering",
            label: "Ordering policy",
            icon: CalendarClock,
            anyPermissions: ["ordering_settings.view", "ordering_settings.manage"],
            
          },
        ],
      },
      {
        label: "Access & Security",
        icon: Shield,
        items: [
          {
            href: "/settings/users",
            label: "Users",
            icon: Users,
            permission: "users.manage",
          },
          {
            href: "/settings/roles",
            label: "Roles",
            icon: Shield,
            permission: "roles.manage",
          },
          {
            href: "/settings/permissions",
            label: "Permissions",
            icon: KeyRound,
            permission: "roles.manage",
          },
        ],
      },
      {
        label: "Locations & Facilities",
        icon: MapPin,
        items: [
          {
            href: "/settings/branches",
            label: "Branches",
            icon: MapPin,
            permission: "branches.manage",
            
          },
          {
            href: "/settings/warehouses",
            label: "Warehouses",
            icon: Building2,
            permission: "warehouses.manage",
          
          },
          {
            href: "/settings/service-centers",
            label: "Service centers",
            icon: Building2,
            permission: "service_centers.manage",
          },
          {
            href: "/settings/dealers",
            label: "Dealers",
            icon: Store,
            permission: "dealers.manage",
          },
        ],
      },
      {
        label: "Integrations",
        icon: Plug,
        items: [
          {
            href: "/settings/sap-integration",
            label: "SAP integration",
            icon: Truck,
            permission: "sap.manage",
          },
        ],
      },
      {
        label: "Master data",
        icon: Tags,
        items: [
          {
            href: "/settings/master-data",
            label: "Master data",
            icon: Tags,
            permission: "master_data.manage",
          },
        ],
      },
    ],
  },
];

function hasNavPermission(
  permissions: string[],
  item: { permission?: string; anyPermissions?: readonly string[] },
): boolean {
  if (item.anyPermissions?.length) {
    return item.anyPermissions.some((p) => permissions.includes(p));
  }
  return !item.permission || permissions.includes(item.permission);
}

export function filterNavByPermissions(
  entries: NavEntry[],
  permissions: string[],
  isPlatformOperator = false,
): NavEntry[] {
  return entries
    .map((entry) => {
      switch (entry.type) {
        case "link": {
          if (entry.hidden) return null;
          if (entry.platformOperatorOnly && !isPlatformOperator) {
            return null;
          }
          if (!hasNavPermission(permissions, entry)) {
            return null;
          }
          return entry;
        }
        case "group": {
          const isVisible = (item: NavLinkItem) => {
            if (item.hidden) return false;
            if (item.platformOperatorOnly && !isPlatformOperator) {
              return false;
            }
            return hasNavPermission(permissions, item);
          };

          const visibleItems = entry.items
            .map((child) => {
              if (!isNavSubGroup(child)) {
                return isVisible(child) ? child : null;
              }
              const items = child.items.filter(isVisible);
              return items.length > 0 ? { ...child, items } : null;
            })
            .filter((child): child is NavGroupChild => child !== null);

          if (visibleItems.length === 0) {
            return null;
          }

          return { ...entry, items: visibleItems };
        }
        default: {
          const _exhaustive: never = entry;
          return _exhaustive;
        }
      }
    })
    .filter((entry): entry is NavEntry => entry !== null);
}

/** Whether a nav href should show as active for the current pathname. */
export function isNavItemActive(
  pathname: string,
  href: string,
  exact?: boolean,
  activePathPrefixes?: readonly string[],
): boolean {
  if (
    activePathPrefixes?.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Length of the href or prefix that makes this item active, 0 when inactive.
 * Lets a list highlight only its most specific match.
 */
function navItemMatchLength(pathname: string, item: NavLinkItem): number {
  let best = 0;
  for (const prefix of item.activePathPrefixes ?? []) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      best = Math.max(best, prefix.length);
    }
  }
  if (isNavItemActive(pathname, item.href, item.exact)) {
    best = Math.max(best, item.href.length);
  }
  return best;
}

/**
 * Hrefs to highlight in one destination list: only the most specific match,
 * so "/dashboard/custom" stays inactive while "/dashboard/custom/abc" is open.
 */
export function resolveActiveNavHrefs(
  pathname: string,
  items: readonly NavGroupChild[],
): Set<string> {
  const links = flattenNavLinks(items);
  const lengths = links.map((item) => navItemMatchLength(pathname, item));
  const best = Math.max(0, ...lengths);
  if (best === 0) return new Set();
  return new Set(links.filter((_, i) => lengths[i] === best).map((item) => item.href));
}

export function isNavGroupActive(
  pathname: string,
  items: NavGroupChild[],
): boolean {
  return items.some((child) =>
    isNavSubGroup(child)
      ? isNavGroupActive(pathname, child.items)
      : isNavItemActive(pathname, child.href, child.exact, child.activePathPrefixes),
  );
}

export function flattenNavLinks(items: readonly NavGroupChild[]): NavLinkItem[] {
  const links: NavLinkItem[] = [];
  for (const child of items) {
    if (isNavSubGroup(child)) {
      links.push(...child.items);
      continue;
    }
    links.push(child);
  }
  return links;
}

export function navEntryKey(entry: NavEntry): string {
  switch (entry.type) {
    case "link":
      return `link:${entry.href}`;
    case "group":
      return `group:${entry.label}`;
    default: {
      const _exhaustive: never = entry;
      return _exhaustive;
    }
  }
}

export function isNavEntryActive(pathname: string, entry: NavEntry): boolean {
  switch (entry.type) {
    case "link":
      return isNavItemActive(
        pathname,
        entry.href,
        entry.exact,
        entry.activePathPrefixes,
      );
    case "group":
      return isNavGroupActive(pathname, entry.items);
    default: {
      const _exhaustive: never = entry;
      return _exhaustive;
    }
  }
}

export function firstPermittedHref(entry: NavEntry): string | null {
  switch (entry.type) {
    case "link":
      return entry.href;
    case "group":
      return flattenNavLinks(entry.items)[0]?.href ?? null;
    default: {
      const _exhaustive: never = entry;
      return _exhaustive;
    }
  }
}

/** White secondary column is hidden when the module has a single destination. */
export function shouldShowSecondaryNav(entry: NavEntry): boolean {
  switch (entry.type) {
    case "link":
      return false;
    case "group":
      return flattenNavLinks(entry.items).length > 1;
    default: {
      const _exhaustive: never = entry;
      return _exhaustive;
    }
  }
}

/**
 * Primary rail label and icon. A module with exactly one visible page uses
 * that page's label (and its icon when it has one). Modules with several
 * pages keep the group label.
 */
export function primaryNavDisplay(entry: NavEntry): {
  label: string;
  icon: LucideIcon;
} {
  switch (entry.type) {
    case "link":
      return { label: entry.label, icon: entry.icon };
    case "group": {
      const links = flattenNavLinks(entry.items);
      if (links.length === 1) {
        const only = links[0];
        return { label: only.label, icon: only.icon ?? entry.icon };
      }
      return { label: entry.label, icon: entry.icon };
    }
    default: {
      const _exhaustive: never = entry;
      return _exhaustive;
    }
  }
}

export function findActiveNavEntry(
  pathname: string,
  entries: readonly NavEntry[],
): NavEntry | null {
  for (const entry of entries) {
    if (isNavEntryActive(pathname, entry)) return entry;
  }
  return null;
}

export type NavSecondarySection =
  | { kind: "link"; item: NavLinkItem }
  | {
      kind: "heading";
      label: string;
      icon: LucideIcon;
      items: NavLinkItem[];
    };

export function navSecondarySections(
  items: readonly NavGroupChild[],
): NavSecondarySection[] {
  const sections: NavSecondarySection[] = [];
  for (const child of items) {
    if (isNavSubGroup(child)) {
      if (child.items.length === 0) continue;
      sections.push({
        kind: "heading",
        label: child.label,
        icon: child.icon,
        items: child.items,
      });
      continue;
    }
    sections.push({ kind: "link", item: child });
  }
  return sections;
}

/** Queue keys that should contribute to this link's count for the current user. */
export function visibleCountBadgeKeys(
  item: Pick<NavLinkItem, "countBadgeKey" | "countBadgeParts">,
  permissions: string[],
): NavCountBadgeKey[] {
  if (item.countBadgeParts && item.countBadgeParts.length > 0) {
    const keys: NavCountBadgeKey[] = [];
    for (const part of item.countBadgeParts) {
      if (!hasNavPermission(permissions, part)) continue;
      if (keys.includes(part.key)) continue;
      keys.push(part.key);
    }
    return keys;
  }
  if (item.countBadgeKey) return [item.countBadgeKey];
  return [];
}
