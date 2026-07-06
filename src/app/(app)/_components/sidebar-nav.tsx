"use client";

import { usePathname } from "next/navigation";

import { SidebarNavGroup } from "@/app/(app)/_components/sidebar-nav-group";
import { SidebarNavItem } from "@/app/(app)/_components/sidebar-nav-item";
import { SidebarGroup, SidebarMenu } from "@/components/ui/sidebar";
import {
  appNavigation,
  filterNavByPermissions,
} from "@/config/app-navigation";

interface SidebarNavProps {
  permissions: string[];
  isPlatformOperator: boolean;
}

export function SidebarNav({ permissions, isPlatformOperator }: SidebarNavProps) {
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
              />
            );
          }

          return (
            <SidebarNavGroup
              key={entry.label}
              group={entry}
              items={entry.items}
              pathname={pathname}
            />
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
