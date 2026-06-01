"use client";

import { ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { SidebarNavItem } from "@/app/(app)/_components/sidebar-nav-item";
import {
  isNavGroupActive,
  type NavGroupEntry,
  type NavLinkItem,
} from "@/config/app-navigation";
import { cn } from "@/utils/cn";

interface SidebarNavGroupProps {
  group: NavGroupEntry;
  items: NavLinkItem[];
}

export function SidebarNavGroup({ group, items }: SidebarNavGroupProps) {
  const pathname = usePathname();
  const isChildActive = isNavGroupActive(pathname, items);
  const [isOpen, setIsOpen] = useState(true);
  const showItems = isOpen || isChildActive;
  const Icon = group.icon;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          isChildActive
            ? "text-sidebar-foreground"
            : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        )}
        aria-expanded={showItems}
      >
        <Icon className="size-[18px] shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 transition-transform",
            showItems && "rotate-180",
          )}
        />
      </button>

      {showItems ? (
        <div className="ml-4 space-y-0.5 border-l border-white/10 pl-2">
          {items.map((item) => (
            <SidebarNavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              pathname={pathname}
              isSubmenu
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
