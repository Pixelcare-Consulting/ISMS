"use client";

import Link from "next/link";

import { SidebarNavNewBadge } from "@/app/(app)/_components/sidebar-nav-new-badge";
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { isNavItemActive } from "@/config/app-navigation";
import type { LucideIcon } from "lucide-react";

interface SidebarNavItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  pathname: string;
  badge?: "new";
}

export function SidebarNavItem({
  href,
  label,
  icon: Icon,
  pathname,
  badge,
}: SidebarNavItemProps) {
  const isActive = isNavItemActive(pathname, href);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
        <Link href={href}>
          {isActive ? (
            <span
              className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary group-data-[collapsible=icon]:hidden"
              aria-hidden
            />
          ) : null}
          <Icon />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {badge === "new" ? <SidebarNavNewBadge /> : null}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
