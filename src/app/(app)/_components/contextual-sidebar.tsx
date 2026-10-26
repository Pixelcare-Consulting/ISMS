"use client";

import { ChevronsLeft, ChevronsRight } from "lucide-react";

import { useAppNav } from "@/app/(app)/_components/app-nav-provider";
import {
  contextualSidebarWidthClass,
  isContextualSidebarOpen,
} from "@/app/(app)/_components/contextual-sidebar-preference";
import { NavDestinationList } from "@/app/(app)/_components/nav-destination-list";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/utils/cn";

/**
 * White page list for the active module. It sits in the flex row between the
 * dark primary sidebar and the workspace, so it takes width instead of overlaying.
 */
export function ContextualSidebar() {
  const {
    activeEntry,
    showSecondary,
    pathname,
    permissions,
    countBadges,
    preference,
    secondaryExpanded,
    toggleSecondary,
  } = useAppNav();
  const { isMobile } = useSidebar();

  if (isMobile || !showSecondary || !activeEntry || activeEntry.type !== "group") {
    return null;
  }

  const menuOpen = isContextualSidebarOpen(preference, secondaryExpanded);

  return (
    <aside
      data-slot="contextual-sidebar"
      data-state={menuOpen ? "expanded" : "collapsed"}
      aria-label={`${activeEntry.label} pages`}
      aria-hidden={menuOpen ? undefined : true}
      inert={!menuOpen}
      className={cn(
        "sticky top-0 hidden h-svh min-w-0 shrink-0 flex-col overflow-hidden bg-white text-neutral-900 transition-[width] duration-200 ease-linear md:flex",
        contextualSidebarWidthClass(preference),
      )}
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-neutral-200 px-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-950">
          {activeEntry.label}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950"
          onClick={toggleSecondary}
          aria-label="Hide section menu"
        >
          <ChevronsLeft />
        </Button>
      </div>
      <nav className="content-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <NavDestinationList
          items={activeEntry.items}
          pathname={pathname}
          permissions={permissions}
          countBadges={countBadges}
          variant="contextual"
        />
      </nav>
    </aside>
  );
}

export function ContextualSidebarTrigger() {
  const { showSecondary, preference, secondaryExpanded, toggleSecondary } =
    useAppNav();
  const { isMobile } = useSidebar();
  if (!showSecondary || isMobile) return null;

  const expanded = isContextualSidebarOpen(preference, secondaryExpanded);
  if (expanded) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title="Show section menu"
      className="hidden size-7 text-sidebar hover:bg-sidebar-accent/60 hover:text-sidebar-foreground md:inline-flex"
      onClick={toggleSecondary}
      aria-expanded={false}
      aria-label="Show section menu"
    >
      <ChevronsRight />
    </Button>
  );
}
