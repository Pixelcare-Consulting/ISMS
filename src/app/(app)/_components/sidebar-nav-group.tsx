"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { SidebarNavNewBadge } from "@/app/(app)/_components/sidebar-nav-new-badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  isNavGroupActive,
  isNavItemActive,
  type NavGroupEntry,
  type NavLinkItem,
} from "@/config/app-navigation";

interface SidebarNavGroupProps {
  group: NavGroupEntry;
  items: NavLinkItem[];
  pathname: string;
}

export function SidebarNavGroup({ group, items, pathname }: SidebarNavGroupProps) {
  const isChildActive = isNavGroupActive(pathname, items);
  const [isOpen, setIsOpen] = useState(
    () => isChildActive || Boolean(group.defaultOpen),
  );
  const Icon = group.icon;

  return (
    <Collapsible
      asChild
      open={isOpen || isChildActive}
      onOpenChange={setIsOpen}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={group.label} isActive={isChildActive}>
            <Icon />
            <span>{group.label}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {items.map((item) => {
              const ItemIcon = item.icon;
              const active = isNavItemActive(pathname, item.href);

              return (
                <SidebarMenuSubItem key={item.href}>
                  <SidebarMenuSubButton asChild isActive={active}>
                    <Link href={item.href}>
                      <ItemIcon />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.badge === "new" ? <SidebarNavNewBadge /> : null}
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
