"use client";

import { ChevronLeft, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState, type MouseEvent } from "react";

import { useAppNav } from "@/app/(app)/_components/app-nav-provider";
import { resolveNavEntryCount } from "@/app/(app)/_components/nav-counts";
import { NavDestinationList } from "@/app/(app)/_components/nav-destination-list";
import { SidebarNavCountBadge } from "@/app/(app)/_components/sidebar-nav-count-badge";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  firstPermittedHref,
  isNavEntryActive,
  navEntryKey,
  primaryNavDisplay,
  shouldShowSecondaryNav,
  type NavEntry,
} from "@/config/app-navigation";

const PRIMARY_LABEL_CLASS =
  "min-w-0 flex-1 text-left leading-snug break-normal !overflow-visible !whitespace-normal !text-clip !text-left";

const PRIMARY_BUTTON_CLASS = "h-auto min-h-8 items-start py-1.5 text-left";

export function SidebarNav() {
  const { isMobile, openMobile } = useSidebar();
  return (
    <SidebarNavMenu key={isMobile && openMobile ? "mobile-drawer" : "module-rail"} />
  );
}

function SidebarNavMenu() {
  const { entries, pathname, permissions, countBadges } = useAppNav();
  const { isMobile, setOpenMobile } = useSidebar();
  const [mobileModuleKey, setMobileModuleKey] = useState<string | null>(null);
  const revealed =
    entries.find((entry) => navEntryKey(entry) === mobileModuleKey) ?? null;

  if (
    isMobile &&
    revealed?.type === "group" &&
    shouldShowSecondaryNav(revealed)
  ) {
    return (
      <SidebarGroup>
        <button
          type="button"
          onClick={() => setMobileModuleKey(null)}
          className="mb-1 flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <ChevronLeft className="size-4 shrink-0" />
          All modules
        </button>
        <p className="px-2 pb-2 text-sm font-semibold text-sidebar-foreground">
          {revealed.label}
        </p>
        <NavDestinationList
          items={revealed.items}
          pathname={pathname}
          permissions={permissions}
          countBadges={countBadges}
          variant="drawer"
          nested={false}
          onNavigate={() => setOpenMobile(false)}
        />
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <SidebarMenu>
        {entries.map((entry) => {
          const href = firstPermittedHref(entry);
          if (!href) return null;
          const isActive = isNavEntryActive(pathname, entry);
          const total = resolveNavEntryCount(entry, permissions, countBadges);
          const display = primaryNavDisplay(entry);

          return (
            <SidebarMenuItem key={navEntryKey(entry)}>
              <SidebarMenuButton
                asChild
                isActive={isActive}
                tooltip={
                  total > 0
                    ? `${display.label} (${formatCompactCount(total)})`
                    : display.label
                }
                className={PRIMARY_BUTTON_CLASS}
              >
                <Link
                  href={href}
                  aria-current={entry.type === "link" && isActive ? "page" : undefined}
                  onClick={(event) =>
                    onPrimaryClick(event, entry, isActive, isMobile, {
                      closeMobile: () => setOpenMobile(false),
                      revealModule: () => setMobileModuleKey(navEntryKey(entry)),
                    })
                  }
                >
                  {isActive ? (
                    <span
                      className="absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary group-data-[collapsible=icon]:hidden"
                      aria-hidden
                    />
                  ) : null}
                  <ModuleIcon icon={display.icon} />
                  <span className={PRIMARY_LABEL_CLASS}>{display.label}</span>
                  {total > 0 ? (
                    <SidebarNavCountBadge
                      count={total}
                      className="group-data-[collapsible=icon]:hidden"
                    />
                  ) : null}
                  {total > 0 ? (
                    <span
                      className="absolute top-0.5 right-0.5 hidden h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-0.5 text-[9px] font-bold leading-none text-white tabular-nums !overflow-visible group-data-[collapsible=icon]:inline-flex"
                      aria-label={`${total} pending`}
                    >
                      {formatCompactCount(total)}
                    </span>
                  ) : null}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function onPrimaryClick(
  event: MouseEvent<HTMLAnchorElement>,
  entry: NavEntry,
  isActive: boolean,
  isMobile: boolean,
  actions: { closeMobile: () => void; revealModule: () => void },
) {
  if (isModifiedClick(event)) return;

  if (isMobile && shouldShowSecondaryNav(entry)) {
    actions.revealModule();
    if (isActive) event.preventDefault();
    return;
  }

  if (isActive) {
    event.preventDefault();
    if (isMobile) actions.closeMobile();
    return;
  }

  if (isMobile) actions.closeMobile();
}

function isModifiedClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  );
}

function formatCompactCount(count: number): string {
  if (count > 99) return "99+";
  return String(count);
}

function ModuleIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="mt-0.5" />;
}
