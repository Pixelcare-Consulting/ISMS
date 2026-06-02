import {
  ArrowLeftRight,
  ArrowUpToLine,
  Building2,
  ClipboardList,
  Clock,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  MapPin,
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
}

export interface NavLinkEntry extends NavLinkItem {
  type: "link";
}

export interface NavGroupEntry {
  type: "group";
  label: string;
  icon: LucideIcon;
  items: NavLinkItem[];
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
    href: "/policies",
    label: "Policies",
    icon: ScrollText,
    anyPermissions: ["policies.view", "policies.create", "policies.approve"],
  },
  {
    type: "link",
    href: "/inventory",
    label: "Inventory",
    icon: Package,
    permission: "inventory.view",
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
  {
    type: "link",
    href: "/sales",
    label: "Sales",
    icon: Store,
    permission: "sales.create",
  },
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
      {
        href: "/settings/audit-log",
        label: "Audit logs",
        icon: ClipboardList,
        permission: "reports.view",
      },
    ],
  },
  {
    type: "group",
    label: "Settings",
    icon: Settings,
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
      },
      {
        href: "/settings/master-data/brands",
        label: "Master data",
        icon: Tags,
        permission: "master_data.manage",
      },
      {
        href: "/settings/aors",
        label: "AORs",
        icon: Network,
        permission: "aors.manage",
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
