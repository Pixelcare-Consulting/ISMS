"use client";

import { usePathname } from "next/navigation";

import { HeaderNavGroup } from "@/app/(app)/_components/header-nav-group";
import { HeaderNavItem } from "@/app/(app)/_components/header-nav-item";
import {
  appNavigation,
  filterNavByPermissions,
} from "@/config/app-navigation";

interface HeaderNavProps {
  permissions: string[];
  isPlatformOperator: boolean;
}

export function HeaderNav({ permissions, isPlatformOperator }: HeaderNavProps) {
  const pathname = usePathname();
  const entries = filterNavByPermissions(
    appNavigation,
    permissions,
    isPlatformOperator,
  );

  return (
    <nav className="themed-scrollbar flex items-center gap-0.5 overflow-x-auto py-1 sm:gap-1">
      {entries.map((entry) => {
        if (entry.type === "link") {
          return (
            <HeaderNavItem
              key={entry.href}
              href={entry.href}
              label={entry.label}
              icon={entry.icon}
              pathname={pathname}
            />
          );
        }

        return (
          <HeaderNavGroup key={entry.label} group={entry} items={entry.items} />
        );
      })}
    </nav>
  );
}
