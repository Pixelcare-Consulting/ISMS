"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type {
  SectionTabDefinition,
  SectionTabGroupDefinition,
} from "@/config/section-tabs";
import { cn } from "@/utils/cn";

export type RouteTabItem = SectionTabDefinition;
export type RouteTabGroup = SectionTabGroupDefinition;

export function isRouteTabActive(
  pathname: string,
  href: string,
  exact?: boolean,
): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface RouteTabsProps {
  items: RouteTabItem[];
  /** `pill` — segmented control (default). `underline` — classic tab bar. */
  variant?: "pill" | "underline";
  className?: string;
  "aria-label"?: string;
}

export function RouteTabs({
  items,
  variant = "pill",
  className,
  "aria-label": ariaLabel = "Section navigation",
}: RouteTabsProps) {
  const pathname = usePathname();

  if (variant === "underline") {
    return (
      <nav
        aria-label={ariaLabel}
        className={cn("flex flex-wrap gap-1 border-b border-border", className)}
      >
        {items.map((item) => {
          const active = isRouteTabActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative -mb-px px-4 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "font-semibold text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-border/60 bg-muted/50 p-1 shadow-sm",
        className,
      )}
    >
      {items.map((item) => {
        const active = isRouteTabActive(pathname, item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center justify-center rounded-md px-3.5 py-2 text-sm font-medium transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              active
                ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/80"
                : "border border-transparent text-muted-foreground hover:border-border/80 hover:bg-background/80 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

interface GroupedRouteTabsProps {
  groups: RouteTabGroup[];
  className?: string;
  "aria-label"?: string;
}

/** Grouped pill tabs in a single horizontally scrollable bar (mobile-safe). */
export function GroupedRouteTabs({
  groups,
  className,
  "aria-label": ariaLabel = "Section navigation",
}: GroupedRouteTabsProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={ariaLabel}
      className={cn("-mx-1 overflow-x-auto px-1 pb-1", className)}
    >
      <div className="flex w-max items-stretch gap-3">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <span className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </span>
            <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/50 p-1 shadow-sm">
              {group.items.map((item) => {
                const active = isRouteTabActive(pathname, item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3.5 py-2 text-sm font-medium transition-all",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/80"
                        : "border border-transparent text-muted-foreground hover:border-border/80 hover:bg-background/80 hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
