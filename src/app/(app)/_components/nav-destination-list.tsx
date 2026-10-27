"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { resolveNavLinkCount, type NavCountBadges } from "@/app/(app)/_components/nav-counts";
import { SidebarNavCountBadge } from "@/app/(app)/_components/sidebar-nav-count-badge";
import { SidebarNavNewBadge } from "@/app/(app)/_components/sidebar-nav-new-badge";
import {
  isNavItemActive,
  navSecondarySections,
  type NavGroupChild,
  type NavLinkItem,
  type NavSecondarySection,
} from "@/config/app-navigation";
import { cn } from "@/utils/cn";

type NavDestinationVariant = "contextual" | "drawer";

interface NavDestinationListProps {
  items: readonly NavGroupChild[];
  pathname: string;
  permissions: string[];
  countBadges?: NavCountBadges;
  variant: NavDestinationVariant;
  nested?: boolean;
  onNavigate?: () => void;
}

export function NavDestinationList({
  items,
  pathname,
  permissions,
  countBadges,
  variant,
  nested = true,
  onNavigate,
}: NavDestinationListProps) {
  const sections = navSecondarySections(items);

  return (
    <ul className={listClass(variant, nested)}>
      {sections.map((section) => (
        <NavDestinationSection
          key={sectionKey(section)}
          section={section}
          pathname={pathname}
          permissions={permissions}
          countBadges={countBadges}
          variant={variant}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );
}

function NavDestinationSection({
  section,
  pathname,
  permissions,
  countBadges,
  variant,
  onNavigate,
}: {
  section: NavSecondarySection;
  pathname: string;
  permissions: string[];
  countBadges?: NavCountBadges;
  variant: NavDestinationVariant;
  onNavigate?: () => void;
}) {
  switch (section.kind) {
    case "link":
      return (
        <li>
          <NavDestinationLink
            item={section.item}
            pathname={pathname}
            permissions={permissions}
            countBadges={countBadges}
            variant={variant}
            onNavigate={onNavigate}
          />
        </li>
      );
    case "heading":
      return (
        <li className="mt-4 first:mt-1">
          <SectionHeading label={section.label} icon={section.icon} variant={variant} />
          <ul className={cn("mt-1 flex flex-col gap-0.5", nestedListClass(variant))}>
            {section.items.map((item) => (
              <li key={item.href}>
                <NavDestinationLink
                  item={item}
                  pathname={pathname}
                  permissions={permissions}
                  countBadges={countBadges}
                  variant={variant}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </li>
      );
    default: {
      const _exhaustive: never = section;
      return _exhaustive;
    }
  }
}

function NavDestinationLink({
  item,
  pathname,
  permissions,
  countBadges,
  variant,
  onNavigate,
}: {
  item: NavLinkItem;
  pathname: string;
  permissions: string[];
  countBadges?: NavCountBadges;
  variant: NavDestinationVariant;
  onNavigate?: () => void;
}) {
  const active = isNavItemActive(
    pathname,
    item.href,
    item.exact,
    item.activePathPrefixes,
  );
  const count = resolveNavLinkCount(item, permissions, countBadges);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={linkClass(variant, active)}
    >
      {active ? <ActiveBar variant={variant} /> : null}
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 text-left leading-snug break-words">
        {item.label}
      </span>
      {count > 0 ? (
        <SidebarNavCountBadge count={count} />
      ) : item.badge === "new" ? (
        <SidebarNavNewBadge />
      ) : null}
    </Link>
  );
}

function SectionHeading({
  label,
  icon: Icon,
  variant,
}: {
  label: string;
  icon: LucideIcon;
  variant: NavDestinationVariant;
}) {
  return (
    <p className={headingClass(variant)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span>{label}</span>
    </p>
  );
}

function ActiveBar({ variant }: { variant: NavDestinationVariant }) {
  switch (variant) {
    case "contextual":
    case "drawer":
      return (
        <span
          className="absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary"
          aria-hidden
        />
      );
    default: {
      const _exhaustive: never = variant;
      return _exhaustive;
    }
  }
}

function sectionKey(section: NavSecondarySection): string {
  switch (section.kind) {
    case "link":
      return section.item.href;
    case "heading":
      return `heading:${section.label}`;
    default: {
      const _exhaustive: never = section;
      return _exhaustive;
    }
  }
}

function listClass(variant: NavDestinationVariant, nested: boolean): string {
  switch (variant) {
    case "contextual":
      return "flex flex-col gap-0.5";
    case "drawer":
      return nested
        ? "mt-1 ml-4 flex flex-col gap-0.5 border-l border-sidebar-border py-1 pl-2"
        : "flex flex-col gap-0.5";
    default: {
      const _exhaustive: never = variant;
      return _exhaustive;
    }
  }
}

function nestedListClass(variant: NavDestinationVariant): string {
  switch (variant) {
    case "contextual":
      return "";
    case "drawer":
      return "border-l border-sidebar-border pl-2";
    default: {
      const _exhaustive: never = variant;
      return _exhaustive;
    }
  }
}

function headingClass(variant: NavDestinationVariant): string {
  switch (variant) {
    case "contextual":
      return "flex items-center gap-1.5 px-3 pt-1 pb-1 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase";
    case "drawer":
      return "flex items-center gap-1.5 px-2 pt-1 pb-1 text-[11px] font-semibold tracking-wide text-sidebar-muted uppercase";
    default: {
      const _exhaustive: never = variant;
      return _exhaustive;
    }
  }
}

function linkClass(variant: NavDestinationVariant, active: boolean): string {
  switch (variant) {
    case "contextual":
      return cn(
        "relative flex min-h-8 items-start gap-2 rounded-md px-3 py-1.5 text-sm",
        "focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-neutral-800 hover:bg-neutral-100 hover:text-neutral-950",
      );
    case "drawer":
      return cn(
        "relative flex min-h-8 items-start gap-2 rounded-md px-2 py-1.5 text-sm",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent/70",
      );
    default: {
      const _exhaustive: never = variant;
      return _exhaustive;
    }
  }
}
