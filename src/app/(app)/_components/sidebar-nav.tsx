"use client";

import { usePathname } from "next/navigation";

import { SidebarNavGroup } from "@/app/(app)/_components/sidebar-nav-group";
import { SidebarNavItem } from "@/app/(app)/_components/sidebar-nav-item";
import { SidebarGroup, SidebarMenu } from "@/components/ui/sidebar";
import {
  appNavigation,
  filterNavByPermissions,
  type NavLinkItem,
} from "@/config/app-navigation";

export type NavCountBadgeKey = NonNullable<NavLinkItem["countBadgeKey"]>;

export type NavCountBadges = Partial<Record<NavCountBadgeKey, number>>;

export function resolveNavCountBadge(
  countBadgeKey: NavCountBadgeKey | undefined,
  countBadges?: NavCountBadges,
): number | undefined {
  if (!countBadgeKey || !countBadges) return undefined;
  return countBadges[countBadgeKey];
}

interface SidebarNavProps {
  permissions: string[];
  isPlatformOperator: boolean;
  countBadges?: NavCountBadges;
}

export function SidebarNav({
  permissions,
  isPlatformOperator,
  countBadges,
}: SidebarNavProps) {
  const pathname = usePathname();
  const entries = filterNavByPermissions(
    appNavigation,
    permissions,
    isPlatformOperator,
  );

  return (
    <SidebarGroup>
      <SidebarMenu>
        {entries.map((entry) => {
          if (entry.type === "link") {
            return (
              <SidebarNavItem
                key={entry.href}
                href={entry.href}
                label={entry.label}
                icon={entry.icon}
                pathname={pathname}
                exact={entry.exact}
                badge={entry.badge}
                count={resolveNavCountBadge(entry.countBadgeKey, countBadges)}
              />
            );
          }

          return (
            <SidebarNavGroup
              key={entry.label}
              group={entry}
              items={entry.items}
              pathname={pathname}
              countBadges={countBadges}
            />
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
