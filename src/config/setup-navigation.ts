import {
  Building2,
  CalendarClock,
  ChartColumn,
  Clock,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  LayoutTemplate,
  MapPin,
  Network,
  Settings,
  Shield,
  Store,
  Tags,
  Users,
} from "lucide-react";

import type { NavEntry } from "@/config/app-navigation";
import { CUSTOM_DASHBOARD_ACCESS } from "@/features/custom-dashboards/constants/custom-dashboard-permissions";

/**
 * Sidebar for a customer-tenant Super Admin.
 * Same permission fields as the matching links in app navigation, with no queue counts.
 */
export const setupNavigation: NavEntry[] = [
  {
    type: "group",
    label: "Setup",
    icon: Settings,
    defaultOpen: true,
    items: [
      {
        href: "/setup",
        label: "Home",
        icon: LayoutDashboard,
        exact: true,
      },
    ],
  },
  {
    type: "group",
    label: "Dashboard",
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      {
        href: "/dashboard/site-traffic",
        label: "Site Traffic",
        icon: Users,
        anyPermissions: ["users.manage", "audit_logs.view"],
      },
      {
        href: "/dashboard/custom",
        label: "Custom Dashboards",
        icon: LayoutTemplate,
        anyPermissions: CUSTOM_DASHBOARD_ACCESS,
      },
    ],
  },
  {
    type: "group",
    label: "Organization",
    icon: Building2,
    defaultOpen: true,
    items: [
      {
        href: "/settings/company",
        label: "Company",
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
    type: "group",
    label: "People",
    icon: Users,
    defaultOpen: true,
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
    type: "group",
    label: "Places",
    icon: MapPin,
    defaultOpen: true,
    items: [
      {
        href: "/settings/aors",
        label: "AORs",
        icon: Network,
        anyPermissions: ["aors.view", "aors.manage"],
      },
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
    type: "group",
    label: "Catalog and lookups",
    icon: Tags,
    defaultOpen: true,
    items: [
      {
        href: "/settings/master-data",
        label: "Master data",
        icon: Tags,
        permission: "master_data.manage",
      },
    ],
  },
  {
    type: "group",
    label: "Rules",
    icon: CalendarClock,
    defaultOpen: true,
    items: [
      {
        href: "/settings/branch-quotas",
        label: "Branch quotas",
        icon: ChartColumn,
        anyPermissions: ["branches.view", "branches.manage"],
      },
      {
        href: "/settings/ordering",
        label: "Ordering policy",
        icon: CalendarClock,
        anyPermissions: ["ordering_settings.view", "ordering_settings.manage"],
      },
      {
        href: "/settings/planogram",
        label: "Planogram",
        icon: LayoutGrid,
        anyPermissions: ["planogram.view", "planogram.manage"],
      },
    ],
  },
];
