// Pure (no server imports): the nav provider runs on the client.
import { LayoutDashboard, LayoutGrid, LayoutTemplate } from "lucide-react";

import type { NavEntry, NavGroupChild, NavLinkItem } from "@/config/app-navigation";
import { CUSTOM_DASHBOARD_ACCESS } from "@/features/custom-dashboards/constants/custom-dashboard-permissions";

export const CUSTOM_DASHBOARDS_HREF = "/dashboard/custom";

export interface CustomDashboardNavItem {
  id: string;
  name: string;
}

function isCustomDashboardsLink(child: NavGroupChild): child is NavLinkItem {
  return !("items" in child) && child.href === CUSTOM_DASHBOARDS_HREF;
}

/**
 * Replaces the "Custom Dashboards" link with a section: the list page plus one
 * link per dashboard the viewer can open. Without dashboards the plain link stays.
 */
export function withCustomDashboardNav(
  entries: NavEntry[],
  dashboards: readonly CustomDashboardNavItem[],
): NavEntry[] {
  if (dashboards.length === 0) return entries;

  return entries.map((entry) => {
    if (entry.type !== "group" || !entry.items.some(isCustomDashboardsLink)) {
      return entry;
    }

    return {
      ...entry,
      items: entry.items.map((child) => {
        if (!isCustomDashboardsLink(child)) return child;
        return {
          label: child.label,
          icon: LayoutTemplate,
          items: [
            { ...child, label: "Dashboard library", icon: LayoutGrid },
            ...dashboards.map(
              (dashboard): NavLinkItem => ({
                href: `${CUSTOM_DASHBOARDS_HREF}/${dashboard.id}`,
                label: dashboard.name,
                icon: LayoutDashboard,
                anyPermissions: CUSTOM_DASHBOARD_ACCESS,
              }),
            ),
          ],
        };
      }),
    };
  });
}
