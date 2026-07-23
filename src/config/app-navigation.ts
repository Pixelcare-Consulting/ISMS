import {
  ArrowLeftRight,
  ArrowUpToLine,
  Barcode,
  Building2,
  ChartColumn,
  ClipboardList,
  Clock,
  History,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  MapPin,
  Megaphone,
  Network,
  Package,
  ScrollText,
  Settings,
  Shield,
  ShoppingCart,
  Store,
  Tags,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { getModuleNavPermission } from "@/config/app-modules";

export interface NavLinkItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: string;
  /** Show link when user has any of these permissions */
  anyPermissions?: string[];
  platformOperatorOnly?: boolean;
  /** Compact sidebar badge (e.g. recently added menus) */
  badge?: "new";
}

export interface NavLinkEntry extends NavLinkItem {
  type: "link";
}

export interface NavGroupEntry {
  type: "group";
  label: string;
  icon: LucideIcon;
  items: NavLinkItem[];
  /** Open on first load when no child route is active (in-session toggle still works) */
  defaultOpen?: boolean;
}

export type NavEntry = NavLinkEntry | NavGroupEntry;

export const appNavigation: NavEntry[] = [
  {
    type: "link",
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    permission: getModuleNavPermission("dashboard"),
  },
  {
    type: "link",
    href: "/announcements",
    label: "Announcements",
    icon: Megaphone,
    permission: "announcements.view",
    badge: "new",
  },
  {
    type: "link",
    href: "/competitors",
    label: "Competitors",
    icon: ChartColumn,
    permission: "competitors.view",
    badge: "new",
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
    label: "Inventory",
    icon: Package,
    items: [
      {
        href: "/inventory",
        label: "Stock units",
        icon: Package,
        permission: "inventory.view",
      },
      {
        href: "/inventory/stock-count",
        label: "P-Count",
        icon: ClipboardList,
        permission: "inventory.view",
        badge: "new",
      },
      {
        href: "/inventory/serial-numbers",
        label: "Serial numbers",
        icon: Barcode,
        permission: "inventory.view",
      },
    ],
  },
  {
    type: "link",
    href: "/orders",
    label: "Orders",
    icon: ShoppingCart,
    anyPermissions: ["orders.view", "orders.create", "orders.approve"],
  },
  {
    type: "group",
    label: "Logistics",
    icon: Package,
    items: [
      {
        href: "/logistics/deliveries",
        label: "Deliveries",
        icon: Truck,
        permission: "logistics.manage",
      },
      {
        href: "/logistics/transfers",
        label: "Transfers",
        icon: ArrowLeftRight,
        permission: "logistics.manage",
      },
      {
        href: "/logistics/pickups",
        label: "Pull-outs",
        icon: ArrowUpToLine,
        permission: "logistics.manage",
      },
    ],
  },
  // Sales module hidden from the sidebar (kept for future re-enablement)
  // {
  //   type: "link",
  //   href: "/sales",
  //   label: "Sales",
  //   icon: Store,
  //   permission: "sales.create",
  // },
  {
    type: "group",
    label: "Reports",
    icon: ClipboardList,
    items: [
      {
        href: "/reports/processed-orders",
        label: "Processed orders",
        icon: ClipboardList,
        anyPermissions: ["reports.view", "orders.view"],
      },
      {
        href: "/reports/daily-stock",
        label: "Daily stock",
        icon: Package,
        anyPermissions: ["reports.view", "orders.view"],
      },
      {
        href: "/reports/transfers",
        label: "Transfers",
        icon: ArrowLeftRight,
        anyPermissions: ["reports.view", "logistics.manage"],
      },
      // Sales report hidden (kept for future re-enablement)
      // {
      //   href: "/reports/sales",
      //   label: "Sales",
      //   icon: Store,
      //   anyPermissions: ["reports.view", "sales.create"],
      // },
      {
        href: "/reports/pcount",
        label: "P-Count",
        icon: ClipboardList,
        anyPermissions: ["reports.view", "inventory.view"],
        badge: "new",
      },
    ],
  },
  {
    type: "group",
    label: "Audit Logs",
    icon: History,
    items: [
      {
        href: "/audit-logs/system",
        label: "System logs",
        icon: ClipboardList,
        permission: "audit_logs.view",
        badge: "new",
      },
      {
        href: "/audit-logs/serial-numbers",
        label: "Serial number logs",
        icon: Barcode,
        permission: "serial_logs.view",
        badge: "new",
      },
    ],
  },
  {
    type: "group",
    label: "Settings",
    icon: Settings,
    defaultOpen: true,
    items: [
      {
        href: "/settings/company",
        label: "Company Settings",
        icon: Building2,
      },
      {
        href: "/settings/users",
        label: "Users",
        icon: Users,
        permission: "users.manage",
      },
      {
        href: "/settings/departments",
        label: "Departments",
        icon: Network,
        permission: "departments.manage",
      },
      {
        href: "/settings/roles",
        label: "Roles",
        icon: Shield,
        permission: "roles.manage",
        badge: "new",
      },
      {
        href: "/settings/permissions",
        label: "Permissions",
        icon: KeyRound,
        permission: "roles.manage",
        platformOperatorOnly: true,
      },
      {
        href: "/settings/status",
        label: "Status",
        icon: Clock,
        permission: "status_settings.manage",
      },
      {
        href: "/settings/branches",
        label: "Branches",
        icon: MapPin,
        permission: "branches.manage",
        badge: "new",
      },
      {
        href: "/settings/dealers",
        label: "Dealers",
        icon: Store,
        permission: "dealers.manage",
        badge: "new",
      },
      {
        href: "/settings/warehouses",
        label: "Warehouses",
        icon: Building2,
        permission: "warehouses.manage",
        badge: "new",
      },
      {
        href: "/settings/service-centers",
        label: "Service centers",
        icon: Building2,
        permission: "service_centers.manage",
        badge: "new",
      },
      {
        href: "/settings/planning",
        label: "Planning & Forecast",
        icon: LayoutGrid,
        anyPermissions: ["forecast.manage", "planogram.manage"],
      },
      {
        href: "/settings/planogram",
        label: "Planogram",
        icon: LayoutGrid,
        anyPermissions: ["planogram.view", "planogram.manage"],
        badge: "new",
      },
      {
        href: "/settings/master-data",
        label: "Master data",
        icon: Tags,
        permission: "master_data.manage",
        badge: "new",
      },
      {
        href: "/settings/aors",
        label: "AORs",
        icon: Network,
        permission: "aors.manage",
        badge: "new",
      },
      {
        href: "/settings/sap-integration",
        label: "SAP integration",
        icon: Truck,
        permission: "sap.manage",
      },
    ],
  },
];

function hasNavPermission(
  permissions: string[],
  item: NavLinkItem,
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
      if (entry.type === "link") {
        if (entry.platformOperatorOnly && !isPlatformOperator) {
          return null;
        }
        if (!hasNavPermission(permissions, entry)) {
          return null;
        }
        return entry;
      }

      const visibleItems = entry.items.filter((item) => {
        if (item.platformOperatorOnly && !isPlatformOperator) {
          return false;
        }
        return hasNavPermission(permissions, item);
      });

      if (visibleItems.length === 0) {
        return null;
      }

      return { ...entry, items: visibleItems };
    })
    .filter((entry): entry is NavEntry => entry !== null);
}

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isNavGroupActive(pathname: string, items: NavLinkItem[]): boolean {
  return items.some((item) => isNavItemActive(pathname, item.href));
}
