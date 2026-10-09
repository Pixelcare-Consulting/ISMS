"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { SidebarNavCountBadge } from "@/app/(app)/_components/sidebar-nav-count-badge";
import { SidebarNavNewBadge } from "@/app/(app)/_components/sidebar-nav-new-badge";
import {
  SIDEBAR_NAV_BUTTON_WRAP_CLASS,
  SIDEBAR_NAV_LABEL_CLASS,
  SIDEBAR_NAV_SUB_BUTTON_WRAP_CLASS,
} from "@/app/(app)/_components/sidebar-nav-item";
import {
  resolveNavCountBadge,
  type NavCountBadges,
} from "@/app/(app)/_components/sidebar-nav";
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
  countBadges?: NavCountBadges;
}

export function SidebarNavGroup({
  group,
  items,
  pathname,
  countBadges,
}: SidebarNavGroupProps) {
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
          <SidebarMenuButton
            tooltip={group.label}
            isActive={isChildActive}
            className={SIDEBAR_NAV_BUTTON_WRAP_CLASS}
          >
            <Icon className="mt-0.5" />
            <span className={SIDEBAR_NAV_LABEL_CLASS}>{group.label}</span>
            <ChevronRight className="mt-0.5 ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
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
                  countBadges={countBadges}
                />
              ) : (
                <SidebarNavSubItem
                  key={child.href}
                  item={child}
                  pathname={pathname}
                  countBadges={countBadges}
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
  countBadges,
}: {
  item: NavLinkItem;
  pathname: string;
  countBadges?: NavCountBadges;
}) {
  const ItemIcon = item.icon;
  const active = isNavItemActive(pathname, item.href, item.exact);
  const count = resolveNavCountBadge(item.countBadgeKey, countBadges);

  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        asChild
        isActive={active}
        className={SIDEBAR_NAV_SUB_BUTTON_WRAP_CLASS}
      >
        <Link href={item.href}>
          <ItemIcon />
          <span className={SIDEBAR_NAV_LABEL_CLASS}>{item.label}</span>
          {typeof count === "number" && count > 0 ? (
            <SidebarNavCountBadge count={count} />
          ) : item.badge === "new" ? (
            <SidebarNavNewBadge />
          ) : null}
        </Link>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

function SidebarNavSubGroup({
  subGroup,
  pathname,
  countBadges,
}: {
  subGroup: NavSubGroupItem;
  pathname: string;
  countBadges?: NavCountBadges;
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
        <SidebarMenuSubButton
          asChild
          isActive={isChildActive}
          className={SIDEBAR_NAV_SUB_BUTTON_WRAP_CLASS}
        >
          <CollapsibleTrigger type="button" className="w-full text-left">
            <Icon />
            <span className={SIDEBAR_NAV_LABEL_CLASS}>{subGroup.label}</span>
            <ChevronRight className="mt-0.5 ml-auto transition-transform duration-200 group-data-[state=open]/subcollapsible:rotate-90" />
          </CollapsibleTrigger>
        </SidebarMenuSubButton>
        <CollapsibleContent>
          <SidebarMenuSub className="mr-0 pr-0">
            {subGroup.items.map((item) => (
              <SidebarNavSubItem
                key={item.href}
                item={item}
                pathname={pathname}
                countBadges={countBadges}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuSubItem>
    </Collapsible>
  );
}
