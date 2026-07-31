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
  isNavSubGroup,
  type NavGroupChild,
  type NavGroupEntry,
  type NavLinkItem,
  type NavSubGroupItem,
} from "@/config/app-navigation";

interface SidebarNavGroupProps {
  group: NavGroupEntry;
  items: NavGroupChild[];
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
            {items.map((child) =>
              isNavSubGroup(child) ? (
                <SidebarNavSubGroup
                  key={child.label}
                  subGroup={child}
                  pathname={pathname}
                />
              ) : (
                <SidebarNavSubItem
                  key={child.href}
                  item={child}
                  pathname={pathname}
                />
              ),
            )}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function SidebarNavSubItem({
  item,
  pathname,
}: {
  item: NavLinkItem;
  pathname: string;
}) {
  const ItemIcon = item.icon;
  const active = isNavItemActive(pathname, item.href, item.exact);

  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton asChild isActive={active}>
        <Link href={item.href}>
          <ItemIcon />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.badge === "new" ? <SidebarNavNewBadge /> : null}
        </Link>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

function SidebarNavSubGroup({
  subGroup,
  pathname,
}: {
  subGroup: NavSubGroupItem;
  pathname: string;
}) {
  const isChildActive = isNavGroupActive(pathname, subGroup.items);
  const [isOpen, setIsOpen] = useState(() => isChildActive);
  const Icon = subGroup.icon;

  return (
    <Collapsible
      asChild
      open={isOpen || isChildActive}
      onOpenChange={setIsOpen}
      className="group/subcollapsible"
    >
      <SidebarMenuSubItem>
        <SidebarMenuSubButton asChild isActive={isChildActive}>
          <CollapsibleTrigger type="button">
            <Icon />
            <span className="min-w-0 flex-1 truncate">{subGroup.label}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/subcollapsible:rotate-90" />
          </CollapsibleTrigger>
        </SidebarMenuSubButton>
        <CollapsibleContent>
          <SidebarMenuSub className="mr-0 pr-0">
            {subGroup.items.map((item) => (
              <SidebarNavSubItem
                key={item.href}
                item={item}
                pathname={pathname}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuSubItem>
    </Collapsible>
  );
}
