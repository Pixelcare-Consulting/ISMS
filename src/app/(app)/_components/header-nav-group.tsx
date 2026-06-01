"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  isNavGroupActive,
  isNavItemActive,
  type NavGroupEntry,
  type NavLinkItem,
} from "@/config/app-navigation";
import { cn } from "@/utils/cn";

interface HeaderNavGroupProps {
  group: NavGroupEntry;
  items: NavLinkItem[];
}

export function HeaderNavGroup({ group, items }: HeaderNavGroupProps) {
  const pathname = usePathname();
  const isChildActive = isNavGroupActive(pathname, items);
  const Icon = group.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "group relative flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors outline-none sm:px-3",
          isChildActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground data-[state=open]:bg-sidebar-accent/60 data-[state=open]:text-sidebar-foreground",
        )}
      >
        {isChildActive ? (
          <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-primary" />
        ) : null}
        <Icon
          className={cn(
            "size-4 shrink-0",
            isChildActive
              ? "text-primary"
              : "text-sidebar-muted group-hover:text-sidebar-foreground",
          )}
        />
        <span className="hidden sm:inline">{group.label}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {items.map((item) => {
          const ItemIcon = item.icon;
          const isActive = isNavItemActive(pathname, item.href);

          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link
                href={item.href}
                className={cn(isActive && "bg-accent text-accent-foreground")}
              >
                <ItemIcon className="size-4" />
                {item.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
