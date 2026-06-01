"use client";

import Link from "next/link";

import { isNavItemActive } from "@/config/app-navigation";
import { cn } from "@/utils/cn";
import type { LucideIcon } from "lucide-react";

interface SidebarNavItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  pathname: string;
  isSubmenu?: boolean;
}

export function SidebarNavItem({
  href,
  label,
  icon: Icon,
  pathname,
  isSubmenu = false,
}: SidebarNavItemProps) {
  const isActive = isNavItemActive(pathname, href);

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg font-medium transition-colors",
        isSubmenu ? "px-3 py-2 text-[13px]" : "px-3 py-2.5 text-sm",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      {isActive ? (
        <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
      ) : null}
      <Icon
        className={cn(
          "shrink-0",
          isSubmenu ? "size-4" : "size-[18px]",
          isActive ? "text-primary" : "text-sidebar-muted group-hover:text-sidebar-foreground",
        )}
      />
      {label}
    </Link>
  );
}
