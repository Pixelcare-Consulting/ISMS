"use client";

import Link from "next/link";

import { isNavItemActive } from "@/config/app-navigation";
import { cn } from "@/utils/cn";
import type { LucideIcon } from "lucide-react";

interface HeaderNavItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  pathname: string;
}

export function HeaderNavItem({
  href,
  label,
  icon: Icon,
  pathname,
}: HeaderNavItemProps) {
  const isActive = isNavItemActive(pathname, href);

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors sm:px-3",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      {isActive ? (
        <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-primary" />
      ) : null}
      <Icon
        className={cn(
          "size-4 shrink-0",
          isActive ? "text-primary" : "text-sidebar-muted group-hover:text-sidebar-foreground",
        )}
      />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
