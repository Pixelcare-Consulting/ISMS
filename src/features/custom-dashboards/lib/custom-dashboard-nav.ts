// Pure (no server imports): the nav provider runs on the client.
import { LayoutDashboard, LayoutGrid, LayoutTemplate } from "lucide-react";

import type {
  NavEntry,
  NavGroupChild,
  NavLinkItem,
  NavSubGroupItem,
} from "@/config/app-navigation";
import { CUSTOM_DASHBOARD_ACCESS } from "@/features/custom-dashboards/constants/custom-dashboard-permissions";

export const CUSTOM_DASHBOARDS_HREF = "/dashboard/custom";

export interface CustomDashboardNavItem {
  id: string;
  name: string;
}

function isCustomDashboardsLink(child: NavGroupChild): child is NavLinkItem {
  return !("items" in child) && child.href === CUSTOM_DASHBOARDS_HREF;
}

function containsCustomDashboardsLink(child: NavGroupChild): boolean {
  return "items" in child
    ? child.items.some(isCustomDashboardsLink)
    : isCustomDashboardsLink(child);
}

function customDashboardsSection(
  link: NavLinkItem,
  dashboards: readonly CustomDashboardNavItem[],
): NavSubGroupItem {
  return {
    label: link.label,
    icon: LayoutTemplate,
    items: [
      { ...link, label: "Dashboard library", icon: LayoutGrid },
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
}

/**
 * Replaces the "Custom Dashboards" link with a section: the list page plus one
 * link per dashboard the viewer can open. Without dashboards the plain link stays.
 * Sections cannot nest, so a link that sits inside a section is moved out into
 * its own section right after it.
 */
export function withCustomDashboardNav(
  entries: NavEntry[],
  dashboards: readonly CustomDashboardNavItem[],
): NavEntry[] {
  if (dashboards.length === 0) return entries;

  return entries.map((entry) => {
    if (entry.type !== "group" || !entry.items.some(containsCustomDashboardsLink)) {
      return entry;
    }

    return {
      ...entry,
      items: entry.items.flatMap((child): NavGroupChild[] => {
        if (!("items" in child)) {
          return isCustomDashboardsLink(child)
            ? [customDashboardsSection(child, dashboards)]
            : [child];
        }
        const link = child.items.find(isCustomDashboardsLink);
        if (!link) return [child];
        const rest = child.items.filter((item) => item !== link);
        return [
          ...(rest.length > 0 ? [{ ...child, items: rest }] : []),
          customDashboardsSection(link, dashboards),
        ];
      }),
    };
  });
}
