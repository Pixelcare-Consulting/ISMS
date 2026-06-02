"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { SectionTabDefinition } from "@/config/section-tabs";
import { cn } from "@/utils/cn";

export type RouteTabItem = SectionTabDefinition;

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
