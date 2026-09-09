"use client";

import Link from "next/link";

import { SidebarNavNewBadge } from "@/app/(app)/_components/sidebar-nav-new-badge";
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { isNavItemActive } from "@/config/app-navigation";
import type { LucideIcon } from "lucide-react";

export const SIDEBAR_NAV_LABEL_CLASS =
  "min-w-0 flex-1 text-left leading-snug break-normal !overflow-visible !whitespace-normal !text-clip !text-left";

export const SIDEBAR_NAV_BUTTON_WRAP_CLASS =
  "h-auto min-h-8 items-start py-1.5 text-left";

export const SIDEBAR_NAV_SUB_BUTTON_WRAP_CLASS =
  "h-auto min-h-7 items-start py-1 text-left [&>svg]:mt-0.5";

interface SidebarNavItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  pathname: string;
  exact?: boolean;
  badge?: "new";
}

export function SidebarNavItem({
  href,
  label,
  icon: Icon,
  pathname,
  exact,
  badge,
}: SidebarNavItemProps) {
  const isActive = isNavItemActive(pathname, href, exact);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={label}
        className={SIDEBAR_NAV_BUTTON_WRAP_CLASS}
      >
        <Link href={href}>
          {isActive ? (
            <span
              className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary group-data-[collapsible=icon]:hidden"
              aria-hidden
            />
          ) : null}
          <Icon className="mt-0.5" />
          <span className={SIDEBAR_NAV_LABEL_CLASS}>{label}</span>
          {badge === "new" ? <SidebarNavNewBadge /> : null}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
